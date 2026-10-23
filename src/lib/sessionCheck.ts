import { issuedBeforeLogout, parseUserToken } from "@/lib/auth";
import { fingerprint } from "@/lib/panelUsers";
import { prismaSystem } from "@/lib/prisma";

// Confere no banco se o cookie ainda vale (pessoa existe, ativa, senha não trocada, cliente ativo e o mesmo do cookie).
// Usado pelo proxy, que protege TODAS as páginas e rotas de uma vez. A resposta fica 15 s em memória para não pesar
// no banco a cada clique; ponytail: pessoa desativada pode navegar até 15 s depois do clique em "desativar".
const TTL_MS = 15_000;
const cache = new Map<string, { ok: boolean; at: number }>();

export async function sessionStillValid(token: string): Promise<boolean> {
  const now = Date.now();
  const hit = cache.get(token);
  if (hit && now - hit.at < TTL_MS) return hit.ok;
  const parsed = parseUserToken(token);
  let ok = false;
  if (parsed) {
    const user = await prismaSystem.panelUser.findUnique({
      where: { id: parsed.id },
      select: { active: true, passwordHash: true, clientId: true, sessionsValidFrom: true, client: { select: { status: true } } },
    });
    ok = Boolean(user && user.active && user.clientId === parsed.cid && user.client.status === "ACTIVE" && fingerprint(user.passwordHash) === parsed.fp && !issuedBeforeLogout(parsed.iat, user.sessionsValidFrom));
  }
  if (cache.size > 500) cache.clear();
  cache.set(token, { ok, at: now });
  return ok;
}
