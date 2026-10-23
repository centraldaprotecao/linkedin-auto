import type { MailboxStatus } from "@prisma/client";

// Regras das caixas de envio, sem banco e sem rede (as telas e os testes também usam).

const DAY_MS = 24 * 60 * 60 * 1000;
// Brasília não tem horário de verão desde 2019: o dia vai de 03:00 UTC a 03:00 UTC.
const SP_OFFSET_MS = 3 * 60 * 60 * 1000;

export function startOfDaySP(now: Date): Date {
  return new Date(Math.floor((now.getTime() - SP_OFFSET_MS) / DAY_MS) * DAY_MS + SP_OFFSET_MS);
}

// Aquecimento: a caixa nova começa com poucos e-mails por dia e sobe 1 por dia até o teto dela
// (com o teto padrão de 30, são 25 dias).
// Caixa que sai disparando em volume logo no começo
// costuma cair em spam.
export const RAMP_START = 5;
export const RAMP_STEP = 1;

export interface MailboxLike {
  id: string;
  status: MailboxStatus;
  dailyLimit: number;
  startedAt: Date;
}

function daysSinceStart(mb: Pick<MailboxLike, "startedAt">, now: Date): number {
  return Math.max(0, Math.round((startOfDaySP(now).getTime() - startOfDaySP(mb.startedAt).getTime()) / DAY_MS));
}

export function effectiveLimit(mb: Pick<MailboxLike, "dailyLimit" | "startedAt">, now: Date): number {
  return Math.max(0, Math.min(mb.dailyLimit, RAMP_START + daysSinceStart(mb, now) * RAMP_STEP));
}

// Aviso de aquecimento para a tela. O aquecimento NUNCA impede de enviar: só limita ao recomendado.
export interface WarmupInfo {
  warming: number; // caixas ainda aquecendo
  total: number; // caixas ativas
  todayCap: number; // quanto as caixas ativas podem mandar hoje, somadas
  fullCap: number; // quanto poderão mandar quando terminarem o aquecimento
  daysLeft: number; // dias até a última terminar
}

export function warmupInfo(boxes: Pick<MailboxLike, "status" | "dailyLimit" | "startedAt">[], now: Date): WarmupInfo | null {
  const active = boxes.filter((b) => b.status === "ACTIVE");
  const warming = active.filter((b) => effectiveLimit(b, now) < b.dailyLimit);
  if (warming.length === 0) return null;
  const daysLeft = Math.max(1, ...warming.map((b) => Math.ceil((b.dailyLimit - RAMP_START) / RAMP_STEP) - daysSinceStart(b, now)));
  return {
    warming: warming.length,
    total: active.length,
    todayCap: active.reduce((n, b) => n + effectiveLimit(b, now), 0),
    fullCap: active.reduce((n, b) => n + b.dailyLimit, 0),
    daysLeft,
  };
}

export function warmupMessage(w: WarmupInfo): string {
  const who = w.total === 1 ? "A caixa de envio está" : w.warming === w.total ? "As caixas de envio estão" : `${w.warming} de ${w.total} caixas de envio estão`;
  return `Fase de aquecimento de domínio: ${who} aquecendo. Limite atual: ${w.todayCap} e-mail${w.todayCap === 1 ? "" : "s"} por dia (chega a ${w.fullCap} em cerca de ${w.daysLeft} dia${w.daysLeft === 1 ? "" : "s"}). Você pode enviar normalmente: o aquecimento só impede de passar do recomendado, para os e-mails não caírem em spam.`;
}

export function remainingToday(mb: MailboxLike, sentToday: number, now: Date): number {
  return Math.max(0, effectiveLimit(mb, now) - sentToday);
}

// Qual caixa manda este e-mail. Quem já conversa com uma caixa continua nela (a resposta sai do mesmo
// endereço); se a pessoa já respondeu, o limite do dia não segura a resposta. Quem é novo vai pra
// caixa com mais espaço no dia, o que espalha o volume igualmente.
export function chooseMailbox<T extends MailboxLike>(
  mailboxes: T[],
  sentToday: (id: string) => number,
  opts: { preferredId?: string | null; replied?: boolean; now: Date },
): T | null {
  const active = mailboxes.filter((m) => m.status === "ACTIVE");
  const room = (m: T) => remainingToday(m, sentToday(m.id), opts.now);
  const preferred = opts.preferredId ? active.find((m) => m.id === opts.preferredId) : undefined;
  if (preferred && (opts.replied || room(preferred) > 0)) return preferred;
  const open = active.filter((m) => room(m) > 0).sort((a, b) => room(b) - room(a) || a.startedAt.getTime() - b.startedAt.getTime());
  return open[0] ?? null;
}

// Quantos e-mails novos ainda cabem hoje, somando as caixas ativas.
export function totalRemainingToday(mailboxes: MailboxLike[], sentToday: (id: string) => number, now: Date): number {
  return mailboxes.filter((m) => m.status === "ACTIVE").reduce((n, m) => n + remainingToday(m, sentToday(m.id), now), 0);
}

// ---------------------------------------------------------------------------
// E-mail devolvido (bounce)
// ---------------------------------------------------------------------------

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const BOUNCE_SENDER = /^(mailer-daemon|postmaster|mail-daemon)@/i;
const BOUNCE_SUBJECT = /undeliver|delivery status|delivery failure|failure notice|returned mail|mail delivery|não foi possível entregar|nao foi possivel entregar|falha na entrega|mensagem não entregue/i;
const PERMANENT = /\b5\.\d{1,3}\.\d{1,3}\b|\b55\d[ -]|user unknown|no such user|does not exist|address not found|n[ãa]o existe|recipient (address )?rejected|unknown (user|recipient)|account (has been )?disabled|invalid recipient/i;
const TEMPORARY = /\b4\.\d{1,3}\.\d{1,3}\b|will keep trying|delayed|mailbox (is )?full|caixa cheia|try again later|tentar(emos)? novamente/i;

// O endereço da pessoa não existe (5.1.x e frases de "usuário desconhecido").
const UNKNOWN_USER = /\b5\.1\.\d{1,3}\b|user unknown|no such user|does not exist|address not found|n[ãa]o existe|unknown (user|recipient)|invalid recipient|recipient (address )?rejected|account (has been )?disabled/i;
// O servidor da pessoa recusou o NOSSO envio (5.7.x: reputação, spam, política, autenticação). Culpa é nossa, não do endereço.
const BLOCKED = /\b5\.7\.\d{1,3}\b|blocked|black ?list|block ?list|spamhaus|reputation|rejected as spam|detected as spam|spam (filter|detected|message)|policy (violation|rejection)|not authenticated|authentication (required|failed)|dmarc|\bspf\b/i;

export interface BounceInfo {
  // Falha definitiva por endereço que não existe. Falha passageira (caixa cheia, atraso) e bloqueio não contam.
  permanent: boolean;
  // O servidor de destino bloqueou o nosso envio: sinal de reputação/autenticação, o endereço pode estar certo.
  blocked: boolean;
  recipients: string[];
}

// Reconhece o aviso de e-mail devolvido e diz para quem foi. null = não é um aviso desses.
export function parseBounce(mail: { from: string; subject: string; text: string }, ownAddress: string): BounceInfo | null {
  if (!BOUNCE_SENDER.test(mail.from) && !BOUNCE_SUBJECT.test(mail.subject)) return null;
  const own = ownAddress.toLowerCase();
  const recipients = [...new Set((mail.text.match(EMAIL_RE) ?? []).map((a) => a.toLowerCase()))].filter((a) => a !== own && !BOUNCE_SENDER.test(a));
  const body = `${mail.subject}\n${mail.text}`;
  const temporary = TEMPORARY.test(body);
  // Endereço inexistente ganha de "bloqueio" quando os dois aparecem (o código 5.1.x é claro).
  const blocked = !temporary && BLOCKED.test(body) && !UNKNOWN_USER.test(body);
  return { permanent: PERMANENT.test(body) && !temporary && !blocked, blocked, recipients };
}

// ---------------------------------------------------------------------------
// Servidores
// ---------------------------------------------------------------------------

export interface ServerPair {
  smtp: { host: string; port: number; secure: boolean };
  imap: { host: string; port: number; secure: boolean };
}

export const MAILBOX_PRESETS: Record<string, ServerPair> = {
  gmail: { smtp: { host: "smtp.gmail.com", port: 465, secure: true }, imap: { host: "imap.gmail.com", port: 993, secure: true } },
  outlook: { smtp: { host: "smtp.office365.com", port: 587, secure: false }, imap: { host: "outlook.office365.com", port: 993, secure: true } },
};

// Servidores conhecidos pelo endereço. Domínio próprio (Google Workspace, Microsoft 365, outros) não dá para saber só pelo endereço.
export function presetFor(address: string): ServerPair | null {
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return MAILBOX_PRESETS.gmail;
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) return MAILBOX_PRESETS.outlook;
  return null;
}
