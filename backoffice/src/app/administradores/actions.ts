"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { createInviteToken, newId, normalizeEmail } from "@/lib/auth";
import { q } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export type AdminFormState = { error?: string; ok?: string; link?: string; for?: string } | undefined;

type Row = { id: string; name: string; email: string; password_hash: string | null; active: boolean };

const linkOf = (id: string, hash: string | null) => `${(process.env.BACKOFFICE_URL ?? "").replace(/\/$/, "")}/convite/${createInviteToken(id, hash)}`;

export async function addAdminAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const me = await requireAdmin();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { error: "Informe o nome e um e-mail válido." };
  if ((await q("SELECT 1 FROM bo_admin WHERE email = $1", [email])).length) return { error: "Já existe um administrador com este e-mail." };
  const id = newId();
  await q("INSERT INTO bo_admin (id, name, email) VALUES ($1, $2, $3)", [id, name, email]);
  await audit(me, "Adicionou um administrador", email);
  revalidatePath("/administradores");
  return { ok: `${name} foi adicionado(a). Envie o link para escolher a senha:`, link: linkOf(id, null), for: id };
}

export async function adminLinkAction(id: string, _prev: AdminFormState): Promise<AdminFormState> {
  const me = await requireAdmin();
  const [a] = await q<Row>("SELECT id, name, email, password_hash, active FROM bo_admin WHERE id = $1", [id]);
  if (!a || !a.active) return { error: "Administrador não encontrado ou desativado." };
  await audit(me, "Gerou link de senha de um administrador", a.email);
  return { ok: "Link gerado. Envie para a pessoa:", link: linkOf(a.id, a.password_hash), for: a.id };
}

export async function toggleAdminAction(id: string, active: boolean): Promise<void> {
  const me = await requireAdmin();
  if (!active && id === me.id) throw new Error("Você não pode desativar o próprio acesso.");
  const [a] = await q<Row>("SELECT id, name, email, password_hash, active FROM bo_admin WHERE id = $1", [id]);
  if (!a) return;
  await q("UPDATE bo_admin SET active = $2 WHERE id = $1", [id, active]);
  await audit(me, active ? "Reativou um administrador" : "Desativou um administrador", a.email);
  revalidatePath("/administradores");
}
