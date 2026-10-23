import { prisma, prismaSystem } from "@/lib/prisma";
import { effectiveLimit } from "@/lib/mailboxPolicy";
import { mailboxBlockedByPlan } from "@/lib/plan";
import { parseEmail } from "@/lib/contactFields";
import { seal } from "@/lib/secretBox";
import { testServers } from "@/lib/email";
import { imapBaseline, mailboxConfig } from "@/lib/mailboxes";

export interface MailboxInput {
  address: string;
  password: string;
  displayName: string;
  dailyLimit: number;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}

const host = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const port = (v: number) => (Number.isInteger(v) && v > 0 && v < 65536 ? v : null);

// Cadastra uma caixa. Antes de guardar, confere se o envio e a leitura funcionam com os dados informados.
export async function addMailbox(data: MailboxInput): Promise<{ error?: string }> {
  const e = parseEmail(String(data.address ?? ""));
  if ("error" in e) return { error: e.error };
  if (!e.email) return { error: "Informe o endereço da caixa." };
  if (!data.password) return { error: "Informe a senha da caixa (senha de app, se o provedor pedir)." };
  const smtpHost = host(String(data.smtpHost ?? ""));
  const imapHost = host(String(data.imapHost ?? ""));
  const smtpPort = port(data.smtpPort);
  const imapPort = port(data.imapPort);
  if (!smtpHost || !imapHost || !smtpPort || !imapPort) return { error: "Confira os servidores e as portas de envio e de leitura." };
  const dailyLimit = Math.min(100, Math.max(1, Math.round(data.dailyLimit) || 30));
  // O endereço é único em todo o sistema (uma caixa pertence a um cliente só): a checagem olha todos os clientes.
  if (await prismaSystem.mailbox.findUnique({ where: { address: e.email }, select: { id: true } })) return { error: "Essa caixa já está cadastrada." };
  const blocked = await mailboxBlockedByPlan();
  if (blocked) return { error: blocked };

  const fields = {
    address: e.email,
    displayName: String(data.displayName ?? "").trim().slice(0, 60) || null,
    smtpHost,
    smtpPort,
    smtpSecure: smtpPort === 465,
    imapHost,
    imapPort,
    imapSecure: imapPort === 993,
    dailyLimit,
  };
  const cfg = {
    address: fields.address,
    password: data.password,
    smtp: { host: smtpHost, port: smtpPort, secure: fields.smtpSecure },
    imap: { host: imapHost, port: imapPort, secure: fields.imapSecure },
  };
  const problem = await testServers(cfg);
  if (problem) return { error: `Não consegui entrar nessa caixa. ${problem}` };
  const baseline = await imapBaseline(cfg).catch(() => null);

  await prisma.mailbox.create({ data: { ...fields, ...(baseline ?? {}), passwordEnc: seal(data.password) } });
  return {};
}

// Confere a conexão da caixa agora e grava o resultado.
export async function testMailbox(id: string): Promise<{ error?: string }> {
  const mb = await prisma.mailbox.findUnique({ where: { id } });
  if (!mb) return { error: "Caixa não encontrada." };
  const problem = await testServers(mailboxConfig(mb));
  await prisma.mailbox.update({ where: { id }, data: problem ? { lastError: problem.slice(0, 300), lastErrorAt: new Date() } : { lastError: null } });
  return problem ? { error: problem } : {};
}

// Caixas do cliente para o backoffice (sem a senha).
export async function listMailboxes(now = new Date()) {
  const rows = await prisma.mailbox.findMany({ where: { status: { not: "RETIRED" } }, orderBy: { createdAt: "asc" } });
  return rows.map((m) => ({
    id: m.id,
    address: m.address,
    displayName: m.displayName,
    status: m.status,
    dailyLimit: m.dailyLimit,
    limitToday: effectiveLimit(m, now),
    startedAt: m.startedAt,
    bounces: m.bounces,
    blockedBounces: m.blockedBounces,
    lastError: m.lastError,
    lastCheckedAt: m.lastCheckedAt,
  }));
}

// Pausar (para de enviar e de ler), voltar ou aposentar (sai da lista e do plano) uma caixa.
export async function setMailboxStatus(id: string, status: "ACTIVE" | "PAUSED" | "RETIRED"): Promise<{ error?: string }> {
  const mb = await prisma.mailbox.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!mb) return { error: "Caixa não encontrada." };
  if (mb.status === "RETIRED") return { error: "Esta caixa já foi aposentada." };
  await prisma.mailbox.update({ where: { id }, data: { status } });
  return {};
}
