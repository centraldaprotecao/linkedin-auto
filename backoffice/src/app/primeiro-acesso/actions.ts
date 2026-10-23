"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { MIN_PASSWORD, createSessionToken, fingerprint, hashPassword, newId, normalizeEmail, setupKeyMatches } from "@/lib/auth";
import { q } from "@/lib/db";
import { startSession } from "@/lib/session";

// Só funciona enquanto NÃO existe nenhum administrador, e exige o código de instalação.
export async function createFirstAdmin(_prev: { error?: string } | undefined, form: FormData) {
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");
  if (!setupKeyMatches(String(form.get("key") ?? "").trim())) return { error: "Código de instalação incorreto." };
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { error: "Informe o nome e um e-mail válido." };
  if (password.length < MIN_PASSWORD) return { error: `Use pelo menos ${MIN_PASSWORD} caracteres na senha.` };
  if (password !== again) return { error: "As duas senhas não são iguais." };

  const id = newId();
  const hash = hashPassword(password);
  // A condição garante que dois pedidos ao mesmo tempo não criem dois "primeiros".
  const created = await q("INSERT INTO bo_admin (id, name, email, password_hash) SELECT $1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM bo_admin) RETURNING id", [id, name, email, hash]);
  if (created.length === 0) return { error: "Já existe um administrador. Entre com o seu e-mail." };
  await startSession(createSessionToken(id, fingerprint(hash)));
  await audit({ id, name, email }, "Criou o primeiro administrador");
  redirect("/");
}
