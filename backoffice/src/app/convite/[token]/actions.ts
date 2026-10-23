"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { MIN_PASSWORD, createSessionToken, fingerprint, hashPassword, readInviteToken } from "@/lib/auth";
import { q } from "@/lib/db";
import { startSession } from "@/lib/session";

type Row = { id: string; name: string; email: string; password_hash: string | null; active: boolean };

// A pessoa escolhe a própria senha pelo link. O link vale uma vez só.
export async function acceptInvite(token: string, _prev: { error?: string } | undefined, form: FormData) {
  const pw = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");
  const invite = readInviteToken(token);
  const [admin] = invite ? await q<Row>("SELECT id, name, email, password_hash, active FROM bo_admin WHERE id = $1", [invite.adminId]) : [];
  if (!invite || !admin || !admin.active || fingerprint(admin.password_hash) !== invite.fp) return { error: "Este link não vale mais. Peça um novo." };
  if (pw.length < MIN_PASSWORD) return { error: `Use pelo menos ${MIN_PASSWORD} caracteres.` };
  if (pw !== again) return { error: "As duas senhas não são iguais." };
  const hash = hashPassword(pw);
  await q("UPDATE bo_admin SET password_hash = $2 WHERE id = $1", [admin.id, hash]);
  await startSession(createSessionToken(admin.id, fingerprint(hash)));
  await audit({ id: admin.id, name: admin.name, email: admin.email }, "Escolheu a própria senha");
  redirect("/");
}
