import { cookies } from "next/headers";
import { COOKIE, fingerprint, parseSessionToken } from "@/lib/auth";
import { q } from "@/lib/db";

export type Admin = { id: string; name: string; email: string };

type Row = { id: string; name: string; email: string; password_hash: string | null; active: boolean };

// Quem está logado, conferido no banco: administrador desativado ou com senha trocada perde a sessão.
export async function sessionAdmin(token: string | undefined): Promise<Admin | null> {
  const parsed = parseSessionToken(token);
  if (!parsed) return null;
  const [row] = await q<Row>("SELECT id, name, email, password_hash, active FROM bo_admin WHERE id = $1", [parsed.id]);
  if (!row || !row.active || fingerprint(row.password_hash) !== parsed.fp) return null;
  return { id: row.id, name: row.name, email: row.email };
}

export async function getAdmin(): Promise<Admin | null> {
  return sessionAdmin((await cookies()).get(COOKIE)?.value);
}

// Ações de servidor aceitam POST direto: conferem a sessão de novo, mesmo com o proxy na frente.
export async function requireAdmin(): Promise<Admin> {
  const a = await getAdmin();
  if (!a) throw new Error("Sessão expirada. Entre de novo.");
  return a;
}

export async function startSession(token: string): Promise<void> {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 horas: é uma ferramenta de trabalho, não um app de celular
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
