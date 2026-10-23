import { createHash } from "node:crypto";
import { q } from "./db";

// Limite de tentativas de entrada, contado no banco (a memória de cada instância da Vercel não serve: o atacante cai em outra).
// Três contas por tentativa errada, em 15 minutos: e-mail+aparelho (5), só o e-mail (15) e só o aparelho (40).
const WINDOW_S = 15 * 60;
const LIMIT = { pair: 5, email: 15, ip: 40 } as const;

const h = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);
const keysOf = (email: string, ip: string) => ({ pair: `p:${h(`${email}|${ip}`)}`, email: `l:${h(email)}`, ip: `i:${h(ip)}` });

export async function loginBlocked(email: string, ip: string): Promise<boolean> {
  const k = keysOf(email, ip);
  const rows = await q<{ key: string; n: string }>(
    "SELECT key, count(*) AS n FROM bo_login_fail WHERE key = ANY($1) AND at > now() - make_interval(secs => $2) GROUP BY key",
    [[k.pair, k.email, k.ip], WINDOW_S],
  );
  const count = (key: string) => Number(rows.find((r) => r.key === key)?.n ?? 0);
  return count(k.pair) >= LIMIT.pair || count(k.email) >= LIMIT.email || count(k.ip) >= LIMIT.ip;
}

export async function loginFailed(email: string, ip: string): Promise<void> {
  const k = keysOf(email, ip);
  await q("INSERT INTO bo_login_fail (key) SELECT unnest($1::text[])", [[k.pair, k.email, k.ip]]);
  // Faxina: linhas de mais de um dia não contam para nada.
  if (Math.random() < 0.05) await q("DELETE FROM bo_login_fail WHERE at < now() - interval '1 day'");
}

// Entrou: zera só a conta daquele e-mail+aparelho.
export async function loginSucceeded(email: string, ip: string): Promise<void> {
  await q("DELETE FROM bo_login_fail WHERE key = $1", [keysOf(email, ip).pair]);
}
