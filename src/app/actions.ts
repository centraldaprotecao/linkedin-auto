"use server";

import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma, prismaSystem } from "@/lib/prisma";
import { COOKIE_NAME, parseUserToken } from "@/lib/auth";

export async function toggleAutomation(): Promise<{ error?: string }> {
  await requireSession();
  const settings = await prisma.settings.findUniqueOrThrow({ where: { id: "singleton" } });
  // Ligar exige o nome: é com ele que o assistente se apresenta aos leads.
  if (settings.automationPaused && !settings.ownerName?.trim()) {
    return { error: "Antes de ligar, cadastre o seu nome em Conta → Seu nome. É assim que o assistente vai se apresentar." };
  }
  await prisma.settings.update({
    where: { id: "singleton" },
    data: { automationPaused: !settings.automationPaused },
  });
  revalidatePath("/");
  return {};
}

export async function logout() {
  const cookieStore = await cookies();
  // Além de apagar o cookie daqui, invalida os já emitidos (um cookie copiado deixa de abrir).
  const parsed = parseUserToken(cookieStore.get(COOKIE_NAME)?.value);
  if (parsed) await prismaSystem.panelUser.updateMany({ where: { id: parsed.id, clientId: parsed.cid }, data: { sessionsValidFrom: new Date() } });
  cookieStore.delete(COOKIE_NAME);
  redirect("/login");
}
