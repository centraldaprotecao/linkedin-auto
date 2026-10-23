import { prismaSystem } from "@/lib/prisma";
import { createInviteToken, normalizeLogin } from "@/lib/panelUsers";
import { startOfMonthSP } from "@/lib/aiUsage";

// Gestão de clientes da DOR$ (chamada só pelo backoffice, via /api/ops/clients, nunca por uma pessoa do painel).
// Usa o banco sem filtro de cliente (prismaSystem) porque o assunto aqui é justamente o conjunto de clientes.

export interface PlanInput {
  planName?: string | null;
  planConversations?: number | null;
  planMailboxes?: number | null;
  planUsers?: number | null;
  planAiBudgetUsd?: number | null;
  // Tetos que o cliente pode escolher em Ajustes (o dono do sistema define).
  dailyInviteMax?: number;
  dailyMessageMax?: number;
}

const PLAN_KEYS: (keyof PlanInput)[] = ["planName", "planConversations", "planMailboxes", "planUsers", "planAiBudgetUsd", "dailyInviteMax", "dailyMessageMax"];

function planOf(input: PlanInput): PlanInput {
  const out: Record<string, unknown> = {};
  for (const k of PLAN_KEYS) if (input[k] !== undefined) out[k] = input[k];
  return out as PlanInput;
}

function inviteBase(): string {
  return process.env.APP_URL?.replace(/\/$/, "") ?? "";
}

export function inviteLinkFor(user: { id: string; passwordHash: string | null }): string {
  return `${inviteBase()}/convite/${createInviteToken(user.id, user.passwordHash)}`;
}

export type ClientRow = Awaited<ReturnType<typeof listClients>>[number];

// Uma linha por cliente, com o uso do mês. Tudo em consultas agrupadas (não uma por cliente).
export async function listClients() {
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const monthStart = startOfMonthSP();
  const [clients, users, leads, messages, emails, ai, boxes] = await Promise.all([
    prismaSystem.client.findMany({ orderBy: { createdAt: "asc" }, include: { settings: true } }),
    prismaSystem.panelUser.groupBy({ by: ["clientId"], where: { active: true }, _count: true }),
    prismaSystem.lead.groupBy({ by: ["clientId"], _count: true }),
    prismaSystem.message.groupBy({ by: ["clientId"], where: { createdAt: { gte: since30 } }, _count: true }),
    prismaSystem.message.groupBy({ by: ["clientId"], where: { createdAt: { gte: monthStart }, channel: "EMAIL", sender: "AGENT" }, _count: true }),
    prismaSystem.aiUsage.groupBy({ by: ["clientId"], where: { createdAt: { gte: monthStart } }, _count: true, _sum: { costUsd: true } }),
    prismaSystem.mailbox.groupBy({ by: ["clientId"], where: { status: { not: "RETIRED" } }, _count: true }),
  ]);
  const by = <T extends { clientId: string }>(rows: T[]) => new Map(rows.map((r) => [r.clientId, r]));
  const u = by(users), l = by(leads), m = by(messages), e = by(emails), a = by(ai), b = by(boxes);
  return clients.map((c) => {
    const s = c.settings;
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      createdAt: c.createdAt,
      plan: s ? { name: s.planName, conversations: s.planConversations, mailboxes: s.planMailboxes, users: s.planUsers, aiBudgetUsd: s.planAiBudgetUsd, dailyInviteMax: s.dailyInviteMax, dailyMessageMax: s.dailyMessageMax } : null,
      usage: {
        users: u.get(c.id)?._count ?? 0,
        leads: l.get(c.id)?._count ?? 0,
        messages30d: m.get(c.id)?._count ?? 0,
        emailsMonth: e.get(c.id)?._count ?? 0,
        aiInteractionsMonth: a.get(c.id)?._count ?? 0,
        aiCostUsdMonth: a.get(c.id)?._sum.costUsd ?? 0,
        mailboxes: b.get(c.id)?._count ?? 0,
      },
      health: s
        ? {
            automationPaused: s.automationPaused,
            linkedinConnected: Boolean(s.linkedinIdentityId) && !s.linkedinNeedsReconnect,
            linkedinNeedsReconnect: s.linkedinNeedsReconnect,
            whatsappConfigured: Boolean(s.deskcommToken),
            googleConnected: Boolean(s.googleRefreshToken),
            lastRobotRunAt: s.lastRobotRunAt,
          }
        : null,
    };
  });
}

export async function getClient(id: string) {
  return (await listClients()).find((c) => c.id === id) ?? null;
}

// Cria o cliente, a configuração inicial (nasce PAUSADO e em modo piloto: nada sai sem o cliente ligar) e a primeira pessoa,
// que recebe o link para escolher a senha.
export async function createClientWithOwner(input: { name: string; ownerName: string; login?: string; plan?: PlanInput }): Promise<{ error: string } | { clientId: string; login: string; inviteLink: string }> {
  const name = input.name.trim().slice(0, 120);
  const ownerName = input.ownerName.trim().slice(0, 80);
  if (!name) return { error: "Informe o nome do cliente." };
  if (!ownerName) return { error: "Informe o nome da primeira pessoa." };
  const login = normalizeLogin(input.login || ownerName.split(/\s+/)[0]);
  if (login.length < 2 || login.length > 40) return { error: "O login precisa ter de 2 a 40 letras ou números." };
  if (await prismaSystem.panelUser.findUnique({ where: { login }, select: { id: true } })) return { error: `O login "${login}" já está em uso. Escolha outro.` };

  const { client, user } = await prismaSystem.$transaction(async (tx) => {
    const client = await tx.client.create({ data: { name } });
    await tx.settings.create({ data: { clientId: client.id, ownerName, ...planOf(input.plan ?? {}) } });
    const user = await tx.panelUser.create({ data: { clientId: client.id, name: ownerName, login } });
    return { client, user };
  });
  return { clientId: client.id, login, inviteLink: inviteLinkFor(user) };
}

export async function updateClient(id: string, patch: { name?: string; status?: "ACTIVE" | "PAUSED"; plan?: PlanInput }): Promise<{ error: string } | { ok: true }> {
  const client = await prismaSystem.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) return { error: "Cliente não encontrado." };
  const data: { name?: string; status?: "ACTIVE" | "PAUSED" } = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim().slice(0, 120);
    if (!n) return { error: "O nome não pode ficar vazio." };
    data.name = n;
  }
  if (patch.status) data.status = patch.status;
  const plan = planOf(patch.plan ?? {});
  await prismaSystem.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.client.update({ where: { id }, data });
    if (Object.keys(plan).length) await tx.settings.update({ where: { clientId: id }, data: plan });
    // Cliente pausado: o robô deixa de percorrê-lo (ver cron/poll) e as sessões caem (ver session.ts).
  });
  return { ok: true };
}

export async function listClientUsers(clientId: string) {
  return (await prismaSystem.panelUser.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } })).map((u) => ({
    id: u.id,
    name: u.name,
    login: u.login,
    active: u.active,
    hasPassword: Boolean(u.passwordHash),
    createdAt: u.createdAt,
  }));
}

export async function addClientUser(clientId: string, input: { name: string; login?: string }): Promise<{ error: string } | { id: string; login: string; inviteLink: string }> {
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: "Informe o nome da pessoa." };
  const login = normalizeLogin(input.login || name.split(/\s+/)[0]);
  if (login.length < 2 || login.length > 40) return { error: "O login precisa ter de 2 a 40 letras ou números." };
  if (!(await prismaSystem.client.findUnique({ where: { id: clientId }, select: { id: true } }))) return { error: "Cliente não encontrado." };
  if (await prismaSystem.panelUser.findUnique({ where: { login }, select: { id: true } })) return { error: `O login "${login}" já está em uso. Escolha outro.` };
  const user = await prismaSystem.panelUser.create({ data: { clientId, name, login } });
  return { id: user.id, login, inviteLink: inviteLinkFor(user) };
}

export async function setClientUserActive(clientId: string, userId: string, active: boolean): Promise<{ error: string } | { ok: true }> {
  const user = await prismaSystem.panelUser.findFirst({ where: { id: userId, clientId }, select: { id: true } });
  if (!user) return { error: "Pessoa não encontrada neste cliente." };
  await prismaSystem.panelUser.update({ where: { id: userId }, data: { active } });
  // Desativada: o celular dela para de receber avisos com dados de leads.
  if (!active) await prismaSystem.pushSubscription.deleteMany({ where: { userId } });
  return { ok: true };
}

export async function newInviteLink(clientId: string, userId: string): Promise<{ error: string } | { inviteLink: string }> {
  const user = await prismaSystem.panelUser.findFirst({ where: { id: userId, clientId } });
  if (!user) return { error: "Pessoa não encontrada neste cliente." };
  if (!user.active) return { error: "Reative o acesso antes de gerar o link." };
  return { inviteLink: inviteLinkFor(user) };
}
