import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const COOKIE = "bo_session";
export const MIN_PASSWORD = 10;

function secret(): string {
  const s = process.env.BACKOFFICE_SECRET;
  if (!s || s.length < 24) throw new Error("BACKOFFICE_SECRET não configurado (mínimo 24 caracteres).");
  return s;
}
const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const newId = () => randomBytes(12).toString("base64url");

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(pw, salt, 64).toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string | null): boolean {
  const [kind, salt, hash] = (stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const got = scryptSync(pw, Buffer.from(salt, "hex"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// Trocar a senha muda a impressão digital: sessões e convites antigos deixam de valer.
export const fingerprint = (stored: string | null) => createHash("sha256").update(stored ?? "sem-senha").digest("hex").slice(0, 10);

export function createSessionToken(adminId: string, fp: string): string {
  const body = `b.${adminId}.${fp}`;
  return `${body}.${sign(body)}`;
}

export function parseSessionToken(token: string | undefined): { id: string; fp: string } | null {
  const p = (token ?? "").split(".");
  if (p.length !== 4 || p[0] !== "b") return null;
  return same(p[3], sign(`b.${p[1]}.${p[2]}`)) ? { id: p[1], fp: p[2] } : null;
}

const INVITE_DAYS = 7;

// Link para a pessoa escolher a própria senha: vale 7 dias e só até ela escolher.
export function createInviteToken(adminId: string, stored: string | null, now = Date.now()): string {
  const body = `${adminId}.${now + INVITE_DAYS * 86_400_000}.${fingerprint(stored)}`;
  return `${body}.${sign(`invite:${body}`)}`;
}

export function readInviteToken(token: string, now = Date.now()): { adminId: string; fp: string } | null {
  const p = token.split(".");
  if (p.length !== 4) return null;
  const [adminId, exp, fp, sig] = p;
  if (!same(sig, sign(`invite:${adminId}.${exp}.${fp}`))) return null;
  return Number(exp) > now ? { adminId, fp } : null;
}

export const setupKeyMatches = (given: string): boolean => {
  const expected = process.env.BACKOFFICE_SETUP_KEY;
  return Boolean(expected && given && same(given, expected));
};

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

// Limite de tentativas de entrada: 5 erros em 15 minutos bloqueiam aquele e-mail + aparelho por 15 minutos.
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map<string, number[]>();
const recent = (key: string, now: number) => {
  const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) fails.set(key, list);
  else fails.delete(key);
  return list;
};
export const loginBlocked = (key: string, now = Date.now()) => recent(key, now).length >= 5;
export const loginFailed = (key: string, now = Date.now()) => void fails.set(key, [...recent(key, now), now]);
export const loginSucceeded = (key: string) => void fails.delete(key);
