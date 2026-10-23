import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "session";

function sign(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET não configurado (mínimo 32 caracteres).");
  return createHmac("sha256", secret).update(value).digest("hex");
}

// Assina um texto com o segredo do sistema (usado também nos convites de acesso).
export function signWith(value: string): string {
  return sign(value);
}

// Validade da sessão no servidor (o cookie também expira no navegador, mas quem copia o cookie não depende disso).
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

// Sessão de acesso individual: u.<cliente>.<id da pessoa>.<impressão digital da senha>.<emitido em (s)>.<assinatura>.
// O cliente vai dentro do cookie assinado: é dele que o filtro de dados (src/lib/tenant.ts) tira o dono, sem consultar o banco.
export function createUserToken(clientId: string, userId: string, fp: string, nowMs = Date.now()): string {
  const body = `u.${clientId}.${userId}.${fp}.${Math.floor(nowMs / 1000)}`;
  return `${body}.${sign(body)}`;
}

export function parseUserToken(token: string | undefined, nowMs = Date.now()): { cid: string; id: string; fp: string; iat: number } | null {
  const parts = (token ?? "").split(".");
  if (parts.length !== 6 || parts[0] !== "u") return null;
  const a = Buffer.from(parts[5]);
  const b = Buffer.from(sign(parts.slice(0, 5).join(".")));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const iat = Number(parts[4]);
  const now = Math.floor(nowMs / 1000);
  // Vencido, ou emitido "no futuro" (relógio errado não pode esticar a validade).
  if (!Number.isInteger(iat) || now - iat > SESSION_MAX_AGE_S || iat - now > 300) return null;
  return { cid: parts[1], id: parts[2], fp: parts[3], iat };
}

// Cookie emitido antes do último "Sair" da pessoa não vale mais.
export const issuedBeforeLogout = (iat: number, validFrom: Date | null | undefined) => Boolean(validFrom && iat < Math.floor(validFrom.getTime() / 1000));

// Só confere a assinatura (o proxy não consulta o banco). Quem pode de fato entrar,
// ou se a pessoa foi desativada, é decidido por getSession().
export function isValidSessionToken(token: string | undefined): boolean {
  return Boolean(parseUserToken(token));
}

export { COOKIE_NAME };

// Compara um segredo recebido com o esperado em tempo constante. Sem segredo
// configurado, recusa sempre: antes, com CRON_SECRET ausente, o header
// "Bearer undefined" passava.
export function secretMatches(received: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isValidBearer(header: string | null, secret: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  return secretMatches(header.slice("Bearer ".length), secret);
}
