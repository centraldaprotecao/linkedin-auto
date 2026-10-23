import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "session";

function sign(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

// Assina um texto com o segredo do sistema (usado também nos convites de acesso).
export function signWith(value: string): string {
  return sign(value);
}

// Sessão de acesso individual: u.<cliente>.<id da pessoa>.<impressão digital da senha>.<assinatura>.
// O cliente vai dentro do cookie assinado: é dele que o filtro de dados (src/lib/tenant.ts) tira o dono, sem consultar o banco.
export function createUserToken(clientId: string, userId: string, fp: string): string {
  const body = `u.${clientId}.${userId}.${fp}`;
  return `${body}.${sign(body)}`;
}

export function parseUserToken(token: string | undefined): { cid: string; id: string; fp: string } | null {
  const parts = (token ?? "").split(".");
  if (parts.length !== 5 || parts[0] !== "u") return null;
  const a = Buffer.from(parts[4]);
  const b = Buffer.from(sign(`u.${parts[1]}.${parts[2]}.${parts[3]}`));
  return a.length === b.length && timingSafeEqual(a, b) ? { cid: parts[1], id: parts[2], fp: parts[3] } : null;
}

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
