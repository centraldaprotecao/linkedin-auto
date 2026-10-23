import { NextResponse } from "next/server";
import { extractConversations } from "@/lib/edges";
import { activeIdentityIdOrNull } from "@/lib/identity";
import { handleIncomingMessage } from "@/lib/respond";
import { isValidBearer } from "@/lib/auth";
import { syncConversation } from "@/lib/sync";
import { runProactive } from "@/lib/followup";
import { isWithinWorkHours } from "@/lib/schedule";
import { prisma, prismaSystem } from "@/lib/prisma";
import { runAsClient } from "@/lib/tenant";
import { syncEmailInbox } from "@/lib/emailSync";
import { syncWhatsapp } from "@/lib/whatsappSync";
import { deskcommConfigOf } from "@/lib/deskcomm";
import { maybeSendDailySummary } from "@/lib/dailySummary";
import { recordSyncRound } from "@/lib/syncReport";

// Geração de texto + envio por lead somam alguns segundos; a parte proativa é
// limitada por rodada (ver lib/followup.ts), mas o padrão da função é curto.
export const maxDuration = 120;

// Agendador externo (cron-job.org) chama este endpoint periodicamente, a cada poucos minutos.
// 1. Reativo: sincroniza as conversas (com o histórico completo das que tiveram
//    novidade) e, quando a última mensagem é do lead, aciona o agente de IA.
// 2. Proativo: detecta convites aceitos, manda a mensagem de abertura e os
//    follow-ups de quem parou de responder.
// Multi-cliente: o robô percorre os clientes ativos, cada um no próprio contexto de dados (com mais de um, cada um numa chamada à parte).
// Um cliente com problema não pode parar os outros. ?client=<id> roda só um (teste e ensaio).
export async function GET(request: Request) {
  // O agendador usa CRON_SECRET; o backoffice ("rodar agora" de um cliente) usa OPS_SECRET.
  const auth = request.headers.get("authorization");
  if (!isValidBearer(auth, process.env.CRON_SECRET) && !isValidBearer(auth, process.env.OPS_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const only = new URL(request.url).searchParams.get("client");
  const clients = await prismaSystem.client.findMany({ where: { status: "ACTIVE", ...(only ? { id: only } : {}) }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  const results: Record<string, unknown> = {};
  // Vários clientes: cada um roda na sua própria chamada (cada uma com o próprio limite de tempo), todas ao mesmo tempo.
  // Assim a rodada não estoura o tempo da função quando a carteira cresce.
  // Só com APP_URL configurado: o endereço da própria requisição não é confiável para mandar a chave adiante. Sem ele, roda em sequência aqui mesmo.
  const base = process.env.APP_URL?.replace(/\/$/, "");
  if (!only && clients.length > 1 && base) {
    await Promise.all(
      clients.map(async (c) => {
        try {
          const res = await fetch(`${base}/api/cron/poll?client=${encodeURIComponent(c.id)}`, { headers: { authorization: auth ?? "" }, signal: AbortSignal.timeout(110_000), cache: "no-store" });
          results[c.id] = res.ok ? ((await res.json()) as { results?: Record<string, unknown> }).results?.[c.id] ?? {} : { error: `rodada respondeu ${res.status}` };
        } catch (err) {
          // passou do tempo de espera: a rodada do cliente continua por conta própria
          console.error(`[poll] Sem resposta do cliente ${c.name} (${c.id})`, err);
          results[c.id] = { error: "sem resposta a tempo (a rodada pode ter terminado depois)" };
        }
      }),
    );
    return NextResponse.json({ clients: clients.length, results });
  }
  for (const c of clients) {
    try {
      results[c.id] = await runAsClient(c.id, pollClient);
    } catch (err) {
      console.error(`[poll] Falha no cliente ${c.name} (${c.id})`, err);
      results[c.id] = { error: err instanceof Error ? err.message : "erro desconhecido" };
    }
  }
  return NextResponse.json({ clients: clients.length, results });
}

async function pollClient() {
  const settings = await prisma.settings.findUniqueOrThrow({ where: { id: "singleton" } });
  // Registra que o agendador chamou (o backoffice usa isto para saber se o robô parou).
  await prisma.settings.update({ where: { id: "singleton" }, data: { lastRobotRunAt: new Date() } }).catch((err) => console.error("Falha ao registrar a rodada do robô", err));
  // Responder pode ser a qualquer hora (opção do admin); INICIAR conversa
  // (abertura, retomada) continua preso ao horário, em runProactive.
  const canReplyNow = settings.automationPaused || settings.replyAnytime || isWithinWorkHours(settings);
  const identityId = await activeIdentityIdOrNull();

  // E-mail primeiro (independe do LinkedIn): grava o que chegou e responde pelo
  // mesmo canal. Fora do horário a resposta espera (salvo "responder a qualquer hora").
  let email: { read: number; saved: number; error?: string } = { read: 0, saved: 0 };
  try {
    const r = await syncEmailInbox();
    email = { read: r.read, saved: r.saved };
    console.log(`[poll] E-mail: lidos ${r.read}, salvos ${r.saved}`);
    if (canReplyNow) for (const lead of r.leads) await handleIncomingMessage(lead, identityId);
  } catch (err) {
    console.error("Falha ao ler a caixa de e-mail", err);
    email.error = err instanceof Error ? err.message : "erro desconhecido";
  }

  // WhatsApp (Deskcomm): mesmas regras do e-mail — grava e responde no canal.
  let whatsapp: { checked: number; saved: number; error?: string } = { checked: 0, saved: 0 };
  if (deskcommConfigOf(settings)) {
    try {
      const r = await syncWhatsapp();
      whatsapp = { checked: r.checked, saved: r.saved };
      console.log(`[poll] WhatsApp: conversas com novidade ${r.checked}, mensagens salvas ${r.saved}, esperando mídia ${r.waiting}`);
      if (canReplyNow) for (const lead of r.leads) await handleIncomingMessage(lead, identityId);
    } catch (err) {
      console.error("Falha ao ler o WhatsApp (Deskcomm)", err);
      whatsapp.error = err instanceof Error ? err.message : "erro desconhecido";
    }
  }

  // Canais independentes: sem LinkedIn conectado, e-mail e WhatsApp seguem sozinhos.
  // Se o LinkedIn falhar aqui, a etapa proativa (fila aprovada, e-mail, WhatsApp) ainda roda.
  let conversations: Awaited<ReturnType<typeof extractConversations>> = [];
  let linkedinError: string | null | undefined;
  if (identityId) {
    try {
      conversations = await extractConversations(identityId);
      linkedinError = null;
    } catch (err) {
      console.error("Falha ao ler as conversas do LinkedIn", err);
      linkedinError = err instanceof Error ? err.message : "erro desconhecido";
    }
  }
  let updatedLeads = 0;
  let newIncomingMessages = 0;
  let fallbacks = 0;
  let failed = 0;

  // Uma conversa com problema não pode derrubar a sincronização das outras.
  for (const conv of conversations) {
    try {
      const result = await syncConversation(conv, identityId!);
      updatedLeads++;
      newIncomingMessages += result.saved.filter((m) => m.fromLead).length;
      if (result.usedFallback) fallbacks++;

      // Uma resposta por conversa, depois de gravar tudo que chegou — o agente
      // lê o histórico completo, então vê todas as mensagens novas de uma vez.
      // Fora do horário de trabalho (sem "responder a qualquer hora") a resposta
      // espera: runProactive responde quando a janela abrir. Pausado marca pra você.
      if (result.shouldRespond && canReplyNow) {
        await handleIncomingMessage(result.lead, identityId);
      }
    } catch (err) {
      failed++;
      console.error("Falha ao sincronizar conversa", conv.linkedin_thread_id, err);
    }
  }

  // Depois do reativo: responder quem escreveu tem prioridade no limite diário.
  let proactive;
  try {
    proactive = await runProactive(identityId);
  } catch (err) {
    console.error("Falha na etapa proativa", err);
    proactive = { error: err instanceof Error ? err.message : "erro desconhecido" };
  }

  // Fim do expediente: resumo do dia (uma vez por dia).
  let summary;
  try {
    summary = await maybeSendDailySummary(settings);
  } catch (err) {
    console.error("Falha no resumo do dia", err);
    summary = { error: err instanceof Error ? err.message : "erro desconhecido" };
  }

  // Rodada concluída: guarda por canal se funcionou (distingue "ligado" de "conseguindo trabalhar").
  // A leitura das caixas de e-mail não lança erro (fica em Mailbox.lastError), então olhamos lá.
  const boxError = await prisma.mailbox.findFirst({ where: { status: "ACTIVE", lastError: { not: null } }, select: { address: true, lastError: true } }).catch(() => null);
  await recordSyncRound(settings.syncReport, {
    email: email.error ?? (boxError ? `${boxError.address}: ${boxError.lastError}` : null),
    whatsapp: deskcommConfigOf(settings) ? (whatsapp.error ?? null) : undefined,
    linkedin: linkedinError,
  }).catch((err) => console.error("Falha ao registrar o resultado da rodada", err));

  return { summary, email, whatsapp, linkedin: identityId ? "conectado" : "não conectado", updatedLeads, newIncomingMessages, fallbacks, failed, proactive };
}
