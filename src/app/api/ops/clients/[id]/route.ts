import { NextResponse } from "next/server";
import { opsAuthorized } from "@/lib/ops";
import { getClient, updateClient, type PlanInput } from "@/lib/clients";

export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ error: "Não autorizado." }, { status: 401 });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!opsAuthorized(request)) return unauthorized();
  const client = await getClient((await params).id);
  return client ? NextResponse.json(client) : NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
}

// Nome, pausar/reativar e plano/limites.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!opsAuthorized(request)) return unauthorized();
  const body = (await request.json().catch(() => null)) as { name?: string; status?: string; plan?: PlanInput } | null;
  if (!body) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  if (body.status !== undefined && body.status !== "ACTIVE" && body.status !== "PAUSED") return NextResponse.json({ error: "Situação inválida." }, { status: 400 });
  const r = await updateClient((await params).id, { name: body.name, status: body.status as "ACTIVE" | "PAUSED" | undefined, plan: body.plan });
  return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
}
