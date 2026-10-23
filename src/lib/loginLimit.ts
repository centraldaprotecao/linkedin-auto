import { createHash } from "node:crypto";
import { prismaSystem } from "@/lib/prisma";

// Limite de tentativas de login, contado no banco (a memória de cada instância da Vercel não serve: o atacante cai em outra).
// Três contas por tentativa errada, em 15 minutos: login+aparelho (5), só o login (15: protege uma conta atacada de vários
// aparelhos) e só o aparelho (40: protege contra quem varre vários logins).
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = { pair: 5, login: 15, ip: 40 } as const;

const h = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);
const keysOf = (login: string, ip: string) => ({ pair: `p:${h(`${login}|${ip}`)}`, login: `l:${h(login)}`, ip: `i:${h(ip)}` });

export async function loginBlocked(login: string, ip: string, now = Date.now()): Promise<boolean> {
  const k = keysOf(login, ip);
  const rows = await prismaSystem.loginAttempt.groupBy({
    by: ["key"],
    where: { key: { in: [k.pair, k.login, k.ip] }, at: { gt: new Date(now - WINDOW_MS) } },
    _count: { _all: true },
  });
  const count = (key: string) => rows.find((r) => r.key === key)?._count._all ?? 0;
  return count(k.pair) >= LIMIT.pair || count(k.login) >= LIMIT.login || count(k.ip) >= LIMIT.ip;
}

export async function loginFailed(login: string, ip: string, now = Date.now()): Promise<void> {
  const k = keysOf(login, ip);
  const at = new Date(now);
  await prismaSystem.loginAttempt.createMany({ data: [k.pair, k.login, k.ip].map((key) => ({ key, at })) });
  // Faxina: linhas de mais de um dia não contam para nada.
  if (Math.random() < 0.05) await prismaSystem.loginAttempt.deleteMany({ where: { at: { lt: new Date(now - 24 * 60 * 60 * 1000) } } });
}

// Entrou: zera só a conta daquele login+aparelho (as contas por login e por aparelho seguem valendo).
export async function loginSucceeded(login: string, ip: string): Promise<void> {
  await prismaSystem.loginAttempt.deleteMany({ where: { key: keysOf(login, ip).pair } });
}
