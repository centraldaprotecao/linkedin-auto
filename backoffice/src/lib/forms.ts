import type { PlanInput } from "@/lib/sistema";

// Número inteiro opcional de um campo de formulário: vazio = null (sem limite); inválido = undefined.
export function intField(form: FormData, name: string): number | null | undefined {
  const raw = String(form.get(name) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n) ? n : undefined;
}

export function moneyField(form: FormData, name: string): number | null | undefined {
  const raw = String(form.get(name) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// Campos do plano de um formulário. Devolve a mensagem de erro em português quando algum valor não vale.
export function readPlan(form: FormData, withCeilings: boolean): { plan: PlanInput } | { error: string } {
  const planName = String(form.get("planName") ?? "").trim().slice(0, 60) || null;
  const users = intField(form, "planUsers");
  const mailboxes = intField(form, "planMailboxes");
  const conversations = intField(form, "planConversations");
  const ai = moneyField(form, "planAiBudgetUsd");
  if (users === undefined || mailboxes === undefined || conversations === undefined || ai === undefined) return { error: "Os limites do plano precisam ser números (deixe em branco para sem limite)." };
  const plan: PlanInput = { planName, planUsers: users, planMailboxes: mailboxes, planConversations: conversations, planAiBudgetUsd: ai };
  if (withCeilings) {
    const invites = intField(form, "dailyInviteMax");
    const messages = intField(form, "dailyMessageMax");
    if (invites == null || messages == null || invites < 1 || messages < 1) return { error: "Os tetos diários de convites e mensagens precisam ser números maiores que zero." };
    plan.dailyInviteMax = invites;
    plan.dailyMessageMax = messages;
  }
  return { plan };
}
