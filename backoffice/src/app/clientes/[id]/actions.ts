"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { readPlan } from "@/lib/forms";
import { requireAdmin } from "@/lib/session";
import { addUser, runNow, setUserActive, updateClient, userInviteLink } from "@/lib/sistema";

export type FormState = { error?: string; ok?: string; link?: string; for?: string } | undefined;

export async function setStatusAction(id: string, name: string, status: "ACTIVE" | "PAUSED"): Promise<void> {
  const admin = await requireAdmin();
  const r = await updateClient(id, { status });
  if (!r.ok) throw new Error(r.error);
  await audit(admin, status === "PAUSED" ? "Pausou o cliente" : "Reativou o cliente", name);
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/");
}

export async function saveClientAction(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "O nome não pode ficar vazio." };
  const plan = readPlan(form, true);
  if ("error" in plan) return { error: plan.error };
  const r = await updateClient(id, { name, plan: plan.plan });
  if (!r.ok) return { error: r.error };
  await audit(admin, "Alterou nome, plano ou limites do cliente", name, JSON.stringify(plan.plan));
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/");
  return { ok: "Salvo." };
}

export async function addUserAction(id: string, clientName: string, _prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const login = String(form.get("login") ?? "").trim();
  if (!name) return { error: "Informe o nome da pessoa." };
  const r = await addUser(id, { name, login: login || undefined });
  if (!r.ok) return { error: r.error };
  await audit(admin, "Adicionou uma pessoa ao cliente", clientName, `login: ${r.data.login}`);
  revalidatePath(`/clientes/${id}`);
  return { ok: `${name} foi adicionada. Envie o link para ela escolher a senha:`, link: r.data.inviteLink, for: r.data.id };
}

export async function toggleUserAction(id: string, clientName: string, userId: string, login: string, active: boolean): Promise<void> {
  const admin = await requireAdmin();
  const r = await setUserActive(id, userId, active);
  if (!r.ok) throw new Error(r.error);
  await audit(admin, active ? "Reativou o acesso de uma pessoa" : "Desativou o acesso de uma pessoa", clientName, `login: ${login}`);
  revalidatePath(`/clientes/${id}`);
}

export async function inviteLinkAction(id: string, clientName: string, userId: string, login: string, ...rest: [FormState]): Promise<FormState> {
  const admin = await requireAdmin();
  const r = await userInviteLink(id, userId);
  if (!r.ok) return { error: r.error };
  await audit(admin, "Gerou novo link de senha", clientName, `login: ${login}`);
  return { ok: "Link gerado. Envie para a pessoa:", link: r.data.inviteLink, for: userId };
}

export async function runNowAction(id: string, clientName: string, ...rest: [FormState]): Promise<FormState> {
  const admin = await requireAdmin();
  const r = await runNow(id);
  if (!r.ok) return { error: r.error };
  await audit(admin, "Rodou o robô agora", clientName);
  const res = r.data.results[id] as { error?: string } | undefined;
  return res?.error ? { error: `A rodada terminou com erro: ${res.error}` } : { ok: "Rodada concluída." };
}
