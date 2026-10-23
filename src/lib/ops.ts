import { NextResponse } from "next/server";
import { isValidBearer } from "@/lib/auth";
import { prismaSystem } from "@/lib/prisma";
import { runAsClient } from "@/lib/tenant";

// Endpoints de operação (/api/ops/*): quem chama é o backoffice da DOR$ (ou a rotina do servidor), nunca uma pessoa no navegador.
// Sem tela e sem sessão: valem só com o segredo de operação (OPS_SECRET; se não existir, o do robô, CRON_SECRET) no cabeçalho Authorization.
export function opsAuthorized(request: Request): boolean {
  return isValidBearer(request.headers.get("authorization"), process.env.OPS_SECRET || process.env.CRON_SECRET);
}

// Rotas que mexem nos dados de UM cliente: o cliente vem em ?client= (ou no cabeçalho x-client-id) e a rota roda no contexto dele.
export async function opsRun(request: Request, fn: () => Promise<Response>): Promise<Response> {
  if (!opsAuthorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const clientId = new URL(request.url).searchParams.get("client") ?? request.headers.get("x-client-id");
  if (!clientId) return NextResponse.json({ error: "Informe o cliente (?client=)." }, { status: 400 });
  const client = await prismaSystem.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  return runAsClient(client.id, fn);
}
