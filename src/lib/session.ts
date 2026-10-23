import { cookies } from "next/headers";
import { COOKIE_NAME, parseUserToken } from "@/lib/auth";
import { fingerprint } from "@/lib/panelUsers";
import { prismaSystem } from "@/lib/prisma";

export type Session = { kind: "user"; clientId: string; user: { id: string; name: string; login: string } };

// Quem está logado, conferido no banco: pessoa desativada, com senha trocada ou de cliente pausado perde a sessão.
// Usa o banco sem filtro porque é aqui que o cliente é confirmado (o cookie só traz o que a pessoa diz ser).
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const parsed = parseUserToken(token);
  if (!parsed) return null;
  const user = await prismaSystem.panelUser.findUnique({ where: { id: parsed.id }, include: { client: { select: { status: true } } } });
  if (!user || !user.active || user.clientId !== parsed.cid || user.client.status !== "ACTIVE" || fingerprint(user.passwordHash) !== parsed.fp) return null;
  return { kind: "user", clientId: user.clientId, user: { id: user.id, name: user.name, login: user.login } };
}

// As ações de servidor aceitam POST direto (não só pela tela). O proxy.ts já barra quem não
// entrou, mas a documentação do Next pede conferir de novo dentro de cada ação.
export async function requireSession(): Promise<void> {
  if (!(await getSession())) throw new Error("Sessão expirada. Entre de novo.");
}

export async function startSession(token: string): Promise<void> {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
