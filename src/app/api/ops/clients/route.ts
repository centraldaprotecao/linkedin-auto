import { NextResponse } from "next/server";
import { opsAuthorized } from "@/lib/ops";
import { createClientWithOwner, listClients, type PlanInput } from "@/lib/clients";

export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ error: "Não autorizado." }, { status: 401 });

// Lista os clientes com plano, uso do mês e saúde. Chamado só pelo backoffice.
export async function GET(request: Request) {
  if (!opsAuthorized(request)) return unauthorized();
  return NextResponse.json({ clients: await listClients() });
}

// Cria o cliente e a primeira pessoa; devolve o link para ela escolher a senha.
export async function POST(request: Request) {
  if (!opsAuthorized(request)) return unauthorized();
  const body = (await request.json().catch(() => null)) as { name?: string; ownerName?: string; login?: string; plan?: PlanInput } | null;
  const r = await createClientWithOwner({ name: String(body?.name ?? ""), ownerName: String(body?.ownerName ?? ""), login: body?.login, plan: body?.plan });
  return NextResponse.json(r, { status: "error" in r ? 400 : 201 });
}
