"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { readPlan } from "@/lib/forms";
import { requireAdmin } from "@/lib/session";
import { addMailbox, addUser, removeWhatsappKey, runNow, setMailbox, setUserActive, setWhatsappKey, testMailbox, updateClient, userInviteLink } from "@/lib/sistema";

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

// ---- WhatsApp ----
export async function saveWhatsappKeyAction(id: string, clientName: string, _prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const token = String(form.get("token") ?? "").trim();
  if (!token) return { error: "Cole a chave do CRM de WhatsApp (começa com dsk_)." };
  const r = await setWhatsappKey(id, token);
  if (!r.ok) return { error: r.error };
  await audit(admin, "Gravou a chave do WhatsApp do cliente", clientName);
  revalidatePath(`/clientes/${id}`);
  return { ok: "Chave testada e guardada. Agora o cliente conecta o número lendo o QR Code em Ajustes › WhatsApp." };
}

export async function removeWhatsappKeyAction(id: string, clientName: string): Promise<void> {
  const admin = await requireAdmin();
  const r = await removeWhatsappKey(id);
  if (!r.ok) throw new Error(r.error);
  await audit(admin, "Removeu a chave do WhatsApp do cliente", clientName);
  revalidatePath(`/clientes/${id}`);
}

// ---- Caixas de e-mail ----
export async function addMailboxAction(id: string, clientName: string, _prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const num = (k: string) => Number(String(form.get(k) ?? "").trim());
  const address = String(form.get("address") ?? "").trim();
  const r = await addMailbox(id, {
    address,
    password: String(form.get("password") ?? ""),
    displayName: String(form.get("displayName") ?? "").trim(),
    dailyLimit: num("dailyLimit") || 30,
    smtpHost: String(form.get("smtpHost") ?? ""),
    smtpPort: num("smtpPort"),
    imapHost: String(form.get("imapHost") ?? ""),
    imapPort: num("imapPort"),
  });
  if (!r.ok) return { error: r.error };
  await audit(admin, "Cadastrou uma caixa de envio", clientName, address.toLowerCase());
  revalidatePath(`/clientes/${id}`);
  return { ok: "Caixa conferida (envio e leitura) e cadastrada. Ela começa o aquecimento hoje." };
}

export async function testMailboxAction(id: string, mailboxId: string, _prev: FormState): Promise<FormState> {
  await requireAdmin();
  const r = await testMailbox(id, mailboxId);
  revalidatePath(`/clientes/${id}`);
  return r.ok ? { ok: "Conexão da caixa funcionando." } : { error: r.error };
}

export async function setMailboxAction(id: string, clientName: string, mailboxId: string, address: string, action: "pause" | "resume" | "retire"): Promise<void> {
  const admin = await requireAdmin();
  const r = await setMailbox(id, mailboxId, action);
  if (!r.ok) throw new Error(r.error);
  await audit(admin, action === "pause" ? "Pausou uma caixa de envio" : action === "resume" ? "Reativou uma caixa de envio" : "Aposentou uma caixa de envio", clientName, address);
  revalidatePath(`/clientes/${id}`);
}
