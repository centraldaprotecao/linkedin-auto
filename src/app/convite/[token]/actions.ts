"use server";

import { redirect } from "next/navigation";
import { createUserToken } from "@/lib/auth";
import { MIN_PASSWORD, fingerprint, hashPassword, readInviteToken } from "@/lib/panelUsers";
import { prismaSystem } from "@/lib/prisma";
import { startSession } from "@/lib/session";

// A pessoa escolhe a própria senha pelo link de convite. O link vale uma vez só.
export async function acceptInvite(token: string, _prev: { error?: string } | undefined, formData: FormData) {
  const pw = String(formData.get("password") ?? "");
  const again = String(formData.get("again") ?? "");
  const invite = readInviteToken(token);
  const user = invite ? await prismaSystem.panelUser.findUnique({ where: { id: invite.userId } }) : null;
  if (!invite || !user || !user.active || fingerprint(user.passwordHash) !== invite.fp) return { error: "Este link não vale mais. Peça um novo." };
  if (pw.length < MIN_PASSWORD) return { error: `Use pelo menos ${MIN_PASSWORD} caracteres.` };
  if (pw !== again) return { error: "As duas senhas não são iguais." };

  const passwordHash = hashPassword(pw);
  await prismaSystem.panelUser.update({ where: { id: user.id }, data: { passwordHash } });
  await startSession(createUserToken(user.clientId, user.id, fingerprint(passwordHash)));
  redirect("/");
}
