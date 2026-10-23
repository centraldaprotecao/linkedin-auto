"use server";

import { audit } from "@/lib/audit";
import { readPlan } from "@/lib/forms";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/sistema";

export type NewClientState = { error?: string; created?: { clientId: string; name: string; login: string; inviteLink: string } } | undefined;

export async function createClientAction(_prev: NewClientState, form: FormData): Promise<NewClientState> {
  const admin = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const ownerName = String(form.get("ownerName") ?? "").trim();
  const login = String(form.get("login") ?? "").trim();
  if (!name) return { error: "Informe o nome do cliente." };
  if (!ownerName) return { error: "Informe o nome da primeira pessoa do cliente." };
  const plan = readPlan(form, false);
  if ("error" in plan) return { error: plan.error };
  const r = await createClient({ name, ownerName, login: login || undefined, plan: plan.plan });
  if (!r.ok) return { error: r.error };
  await audit(admin, "Criou o cliente", name, `primeiro acesso: ${r.data.login}`);
  return { created: { clientId: r.data.clientId, name, login: r.data.login, inviteLink: r.data.inviteLink } };
}
