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

// Validade da sessão no servidor: 12 horas (o cookie também expira no navegador, mas quem o copia não depende disso).
export const SESSION_MAX_AGE_S = 60 * 60 * 12;

// b.<id>.<impressão digital da senha>.<emitido em (s)>.<assinatura>
export function createSessionToken(adminId: string, fp: string, nowMs = Date.now()): string {
  const body = `b.${adminId}.${fp}.${Math.floor(nowMs / 1000)}`;
  return `${body}.${sign(body)}`;
}

export function parseSessionToken(token: string | undefined, nowMs = Date.now()): { id: string; fp: string; iat: number } | null {
  const p = (token ?? "").split(".");
  if (p.length !== 5 || p[0] !== "b") return null;
  if (!same(p[4], sign(p.slice(0, 4).join(".")))) return null;
  const iat = Number(p[3]);
  const now = Math.floor(nowMs / 1000);
  if (!Number.isInteger(iat) || now - iat > SESSION_MAX_AGE_S || iat - now > 300) return null;
  return { id: p[1], fp: p[2], iat };
}

// Cookie emitido antes do último "Sair" da pessoa não vale mais.
export const issuedBeforeLogout = (iat: number, validFrom: Date | null | undefined) => Boolean(validFrom && iat < Math.floor(validFrom.getTime() / 1000));

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
