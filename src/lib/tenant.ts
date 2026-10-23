import { AsyncLocalStorage } from "node:async_hooks";
import { COOKIE_NAME, parseUserToken } from "@/lib/auth";

// De qual cliente é a requisição que está rodando. É daqui que o filtro central (src/lib/prisma.ts) tira o dono dos dados.
// Duas fontes, nesta ordem:
//  1. contexto explícito (runAsClient): robô de 15 minutos, webhooks e rotinas de fundo, que não têm cookie;
//  2. cookie de sessão assinado (a pessoa logada no painel).
// Sem nenhum dos dois, falha: nunca devolve "todos os clientes".
const store = new AsyncLocalStorage<{ clientId: string }>();

// Async de propósito: as consultas do Prisma só rodam quando alguém espera por elas. Esperar AQUI DENTRO garante que
// rodam com o cliente certo mesmo se quem chamou devolver a consulta sem await.
export async function runAsClient<T>(clientId: string, fn: () => T | Promise<T>): Promise<T> {
  if (!clientId) throw new Error("runAsClient sem cliente.");
  return store.run({ clientId }, async () => await fn());
}

export async function currentClientId(): Promise<string> {
  const explicit = store.getStore()?.clientId;
  if (explicit) return explicit;
  try {
    const { cookies } = await import("next/headers");
    const parsed = parseUserToken((await cookies()).get(COOKIE_NAME)?.value);
    if (parsed) return parsed.cid;
  } catch {
    // fora de uma requisição web (script, teste): cai no erro abaixo
  }
  throw new Error("Sem cliente no contexto: a consulta ao banco precisa rodar dentro de uma sessão ou de runAsClient().");
}
