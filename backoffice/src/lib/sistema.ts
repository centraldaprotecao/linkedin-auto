// Conversa com o sistema pelas rotas /api/ops (segredo OPS_SECRET). É o único caminho até os dados dos clientes:
// o backoffice nunca escreve direto no banco do sistema.

export interface PlanView {
  name: string | null;
  conversations: number | null;
  mailboxes: number | null;
  users: number | null;
  aiBudgetUsd: number | null;
  dailyInviteMax: number;
  dailyMessageMax: number;
}
export interface ClientView {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED";
  createdAt: string;
  plan: PlanView | null;
  usage: { users: number; leads: number; messages30d: number; emailsMonth: number; aiInteractionsMonth: number; aiCostUsdMonth: number; mailboxes: number };
  health: { automationPaused: boolean; linkedinConnected: boolean; linkedinNeedsReconnect: boolean; whatsappConfigured: boolean; googleConnected: boolean; lastRobotRunAt: string | null } | null;
}
export interface UserView {
  id: string;
  name: string;
  login: string;
  active: boolean;
  hasPassword: boolean;
  createdAt: string;
}
export interface PlanInput {
  planName?: string | null;
  planConversations?: number | null;
  planMailboxes?: number | null;
  planUsers?: number | null;
  planAiBudgetUsd?: number | null;
  dailyInviteMax?: number;
  dailyMessageMax?: number;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Result<T>> {
  const base = process.env.SISTEMA_URL?.replace(/\/$/, "");
  const secret = process.env.OPS_SECRET;
  if (!base || !secret) return { ok: false, error: "A ligação com o sistema não está configurada (SISTEMA_URL e OPS_SECRET)." };
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", ...init.headers },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `O sistema respondeu ${res.status}.` };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: "Não consegui falar com o sistema agora. Tente de novo em instantes." };
  }
}

export const listClients = () => call<{ clients: ClientView[] }>("/api/ops/clients");
export const getClient = (id: string) => call<ClientView>(`/api/ops/clients/${encodeURIComponent(id)}`);
export const createClient = (b: { name: string; ownerName: string; login?: string; plan?: PlanInput }) =>
  call<{ clientId: string; login: string; inviteLink: string }>("/api/ops/clients", { method: "POST", body: JSON.stringify(b) });
export const updateClient = (id: string, b: { name?: string; status?: "ACTIVE" | "PAUSED"; plan?: PlanInput }) =>
  call<{ ok: true }>(`/api/ops/clients/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(b) });
export const listUsers = (id: string) => call<{ users: UserView[] }>(`/api/ops/clients/${encodeURIComponent(id)}/users`);
export const addUser = (id: string, b: { name: string; login?: string }) =>
  call<{ id: string; login: string; inviteLink: string }>(`/api/ops/clients/${encodeURIComponent(id)}/users`, { method: "POST", body: JSON.stringify(b) });
export const setUserActive = (id: string, userId: string, active: boolean) =>
  call<{ ok: true }>(`/api/ops/clients/${encodeURIComponent(id)}/users/${encodeURIComponent(userId)}`, { method: "PATCH", body: JSON.stringify({ active }) });
export const userInviteLink = (id: string, userId: string) =>
  call<{ inviteLink: string }>(`/api/ops/clients/${encodeURIComponent(id)}/users/${encodeURIComponent(userId)}`, { method: "POST" });
// Retrato de saúde do cliente (pode levar alguns segundos: o sistema pergunta ao WhatsApp).
export const clientStatus = (id: string) => call<Record<string, unknown>>(`/api/ops/status?client=${encodeURIComponent(id)}`, {}, 30_000);
// "Rodar agora": uma rodada do robô só para este cliente.
export const runNow = (id: string) => call<{ clients: number; results: Record<string, unknown> }>(`/api/cron/poll?client=${encodeURIComponent(id)}`, {}, 120_000);

// Há quanto tempo o robô rodou pela última vez (null = nunca rodou).
export const robotAgeMs = (lastRobotRunAt: string | null): number | null => (lastRobotRunAt ? Date.now() - new Date(lastRobotRunAt).getTime() : null);

// ---- WhatsApp (chave do CRM de cada cliente) ----
export interface WhatsappView {
  hasKey: boolean;
  live: string;
  channelId: string | null;
}
const q = (id: string) => `?client=${encodeURIComponent(id)}`;
export const getWhatsapp = (id: string) => call<WhatsappView>(`/api/ops/whatsapp${q(id)}`, {}, 30_000);
export const setWhatsappKey = (id: string, token: string) => call<{ saved: true }>(`/api/ops/whatsapp${q(id)}`, { method: "PUT", body: JSON.stringify({ token }) }, 30_000);
export const removeWhatsappKey = (id: string) => call<{ removed: true }>(`/api/ops/whatsapp${q(id)}`, { method: "DELETE" });

// ---- Caixas de e-mail de envio ----
export interface MailboxView {
  id: string;
  address: string;
  displayName: string | null;
  status: "ACTIVE" | "PAUSED" | "RETIRED";
  dailyLimit: number;
  limitToday: number;
  startedAt: string;
  bounces: number;
  blockedBounces: number;
  lastError: string | null;
  lastCheckedAt: string | null;
}
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
export const listMailboxes = (id: string) => call<{ mailboxes: MailboxView[] }>(`/api/ops/mailbox${q(id)}`);
// O sistema responde 200 com { error } quando o pedido é válido mas a caixa não passou no teste.
const mailboxPost = async (id: string, body: Record<string, unknown>): Promise<Result<Record<string, never>>> => {
  const r = await call<{ error?: string }>(`/api/ops/mailbox${q(id)}`, { method: "POST", body: JSON.stringify(body) }, 60_000);
  if (!r.ok) return r;
  return r.data.error ? { ok: false, error: r.data.error } : { ok: true, data: {} };
};
export const addMailbox = (id: string, m: MailboxInput) => mailboxPost(id, { action: "add", ...m });
export const testMailbox = (id: string, mailboxId: string) => mailboxPost(id, { action: "test", id: mailboxId });
export const setMailbox = (id: string, mailboxId: string, action: "pause" | "resume" | "retire") => mailboxPost(id, { action, id: mailboxId });
