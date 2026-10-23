"use server";

import { redirect } from "next/navigation";
import { createUserToken } from "@/lib/auth";
import { fingerprint, normalizeLogin, verifyPassword } from "@/lib/panelUsers";
import { prismaSystem } from "@/lib/prisma";
import { startSession } from "@/lib/session";
import { headers } from "next/headers";
import { loginBlocked, loginFailed, loginSucceeded } from "@/lib/loginLimit";

export async function login(_prevState: { error?: string } | undefined, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "sem-ip";
  const login = normalizeLogin(String(formData.get("login") ?? ""));
  if (await loginBlocked(login, ip)) return { error: "Muitas tentativas. Espere 15 minutos e tente de novo." };

  // O login é único em todo o sistema; é por ele que se descobre o cliente da pessoa.
  const user = login ? await prismaSystem.panelUser.findUnique({ where: { login }, include: { client: { select: { status: true } } } }) : null;
  // Confere a senha mesmo sem achar a pessoa, para não revelar quais logins existem.
  const ok = verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !user.active || user.client.status !== "ACTIVE" || !ok) {
    await loginFailed(login, ip);
    return { error: "Login ou senha incorretos." };
  }
  await startSession(createUserToken(user.clientId, user.id, fingerprint(user.passwordHash)));

  await loginSucceeded(login, ip);
  redirect("/");
}
