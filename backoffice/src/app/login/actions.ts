"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { createSessionToken, fingerprint, normalizeEmail, verifyPassword } from "@/lib/auth";
import { loginBlocked, loginFailed, loginSucceeded } from "@/lib/loginLimit";
import { q } from "@/lib/db";
import { startSession } from "@/lib/session";

type Row = { id: string; name: string; email: string; password_hash: string | null; active: boolean };

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "sem-ip";
  if (await loginBlocked(email, ip)) return { error: "Muitas tentativas. Espere 15 minutos e tente de novo." };

  const [admin] = email ? await q<Row>("SELECT id, name, email, password_hash, active FROM bo_admin WHERE email = $1", [email]) : [];
  // Confere a senha mesmo sem achar a pessoa, para não revelar quais e-mails existem.
  const ok = verifyPassword(password, admin?.password_hash ?? null);
  if (!admin || !admin.active || !ok) {
    await loginFailed(email, ip);
    // Só guarda o e-mail se ele existe: texto digitado por qualquer visitante não entra no registro.
    await audit(null, "Entrada recusada", admin ? admin.email : "e-mail não cadastrado");
    return { error: "E-mail ou senha incorretos." };
  }
  await startSession(createSessionToken(admin.id, fingerprint(admin.password_hash)));
  await loginSucceeded(email, ip);
  await audit({ id: admin.id, name: admin.name, email: admin.email }, "Entrou");
  redirect("/");
}
