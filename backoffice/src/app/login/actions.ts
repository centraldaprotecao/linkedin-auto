"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { createSessionToken, fingerprint, loginBlocked, loginFailed, loginSucceeded, normalizeEmail, verifyPassword } from "@/lib/auth";
import { q } from "@/lib/db";
import { startSession } from "@/lib/session";

type Row = { id: string; name: string; email: string; password_hash: string | null; active: boolean };

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "sem-ip";
  const key = `${email}|${ip}`;
  if (loginBlocked(key)) return { error: "Muitas tentativas. Espere 15 minutos e tente de novo." };

  const [admin] = email ? await q<Row>("SELECT id, name, email, password_hash, active FROM bo_admin WHERE email = $1", [email]) : [];
  // Confere a senha mesmo sem achar a pessoa, para não revelar quais e-mails existem.
  const ok = verifyPassword(password, admin?.password_hash ?? null);
  if (!admin || !admin.active || !ok) {
    loginFailed(key);
    await audit(null, "Entrada recusada", email.slice(0, 80));
    return { error: "E-mail ou senha incorretos." };
  }
  await startSession(createSessionToken(admin.id, fingerprint(admin.password_hash)));
  loginSucceeded(key);
  await audit({ id: admin.id, name: admin.name, email: admin.email }, "Entrou");
  redirect("/");
}
