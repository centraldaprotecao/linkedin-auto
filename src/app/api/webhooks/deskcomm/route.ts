import { after, NextResponse } from "next/server";
import { prisma, prismaSystem } from "@/lib/prisma";
import { runAsClient } from "@/lib/tenant";
import { secretMatches } from "@/lib/auth";
import { contactPhoneOf, conversationIdOf, samePhone, verifyDeskcommSignature } from "@/lib/deskcommWebhook";
import { syncWhatsapp } from "@/lib/whatsappSync";
import { handleIncomingMessage } from "@/lib/respond";
import { activeIdentityIdOrNull } from "@/lib/identity";
import { isWithinWorkHours } from "@/lib/schedule";

export const maxDuration = 120;

// Aviso instantâneo do Deskcomm: "chegou mensagem nesta conversa". Em vez de esperar a próxima rodada do
// agendador, lê só aquela conversa e já deixa o assistente responder (o cron continua como rede de segurança).
// Mídia que o Deskcomm ainda está guardando é tentada de novo alguns segundos depois.
const MEDIA_RETRIES = 4;
const MEDIA_RETRY_MS = 8_000;

export async function POST(request: Request) {
  const raw = await request.text();
  // Dois jeitos de provar que o aviso é do Deskcomm: a assinatura (preferido) ou a mesma senha no endereço
  // (?token=...), pra instalação que ainda não consegue guardar o segredo da assinatura (sem a chave de cifra).
  const secret = process.env.DESKCOMM_WEBHOOK_SECRET;
  const ok =
    verifyDeskcommSignature(raw, { signature: request.headers.get("x-webhook-signature"), delivery: request.headers.get("x-webhook-delivery") }, secret) ||
    secretMatches(new URL(request.url).searchParams.get("token"), secret);
  if (!ok) {
    // Só presença e tamanho (nunca os valores), pra achar senha faltando ou com espaço sobrando.
    const given = new URL(request.url).searchParams.get("token");
    console.warn(
      `[deskcomm-webhook] recusado: variável ${secret ? `definida (${secret.length} caracteres)` : "NÃO definida"}, senha no endereço ${given ? `presente (${given.length} caracteres)` : "ausente"}, assinatura ${request.headers.get("x-webhook-signature") ? "presente" : "ausente"}`,
    );
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const conversationId = conversationIdOf(raw);
  if (!conversationId) return NextResponse.json({ ignored: true });
  // O aviso vem de um Deskcomm só para todos os clientes: o dono é quem tem esta conversa. Ambíguo ou desconhecido, ignora.
  const owners = await prismaSystem.lead.findMany({ where: { whatsappConversationId: conversationId, client: { status: "ACTIVE" } }, select: { clientId: true } });
  if (owners.length > 1) {
    console.warn(`[deskcomm-webhook] ignorado: conversa ${conversationId.slice(0, 8)} aparece em ${owners.length} clientes`);
    return NextResponse.json({ ignored: true });
  }
  let clientId = owners[0]?.clientId ?? null;
  if (!clientId) {
    // Conversa nova pro Deskcomm (ex.: número reconectado) de alguém que o assistente já atendia por WhatsApp:
    // acha pelo telefone e passa a acompanhar a conversa nova. Só se houver exatamente um contato assim.
    const phone = contactPhoneOf(raw);
    const candidates = phone
      ? (await prismaSystem.lead.findMany({ where: { whatsappConversationId: { not: null }, phone: { not: null }, client: { status: "ACTIVE" } }, select: { id: true, phone: true, clientId: true } })).filter((l) => samePhone(l.phone, phone))
      : [];
    if (candidates.length !== 1) {
      console.log(`[deskcomm-webhook] ignorado: conversa ${conversationId.slice(0, 8)} sem contato conhecido (telefone ${phone ? "recebido" : "ausente"}, ${candidates.length} candidato(s))`);
      return NextResponse.json({ ignored: true });
    }
    clientId = candidates[0].clientId;
    await runAsClient(clientId, () => prisma.lead.update({ where: { id: candidates[0].id }, data: { whatsappConversationId: conversationId } }));
    console.log(`[deskcomm-webhook] conversa ${conversationId.slice(0, 8)} ligada ao contato ${candidates[0].id} pelo telefone`);
  }

  // Responde logo (o Deskcomm só espera 10 s) e trabalha em seguida.
  const owner = clientId!;
  after(() => runAsClient(owner, async () => {
    try {
      const settings = await prisma.settings.findUniqueOrThrow({ where: { id: "singleton" } });
      const canReplyNow = settings.automationPaused || settings.replyAnytime || isWithinWorkHours(settings);
      const identityId = await activeIdentityIdOrNull();
      for (let attempt = 0; attempt <= MEDIA_RETRIES; attempt++) {
        const r = await syncWhatsapp(conversationId);
        console.log(`[deskcomm-webhook] conversa ${conversationId}: lidas ${r.checked}, salvas ${r.saved}, esperando mídia ${r.waiting}, responder agora ${canReplyNow}`);
        if (canReplyNow) for (const lead of r.leads) await handleIncomingMessage(lead, identityId);
        if (!r.waiting) return;
        await new Promise((resolve) => setTimeout(resolve, MEDIA_RETRY_MS));
      }
    } catch (err) {
      console.error("Falha ao tratar o aviso do Deskcomm", err);
    }
  }));
  return NextResponse.json({ accepted: true });
}
