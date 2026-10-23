import { NextResponse } from "next/server";
import { opsAuthorized } from "@/lib/ops";
import { newInviteLink, setClientUserActive } from "@/lib/clients";

export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ error: "Não autorizado." }, { status: 401 });

// Ativar ou desativar o acesso.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  if (!opsAuthorized(request)) return unauthorized();
  const body = (await request.json().catch(() => null)) as { active?: boolean } | null;
  if (typeof body?.active !== "boolean") return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { id, userId } = await params;
  const r = await setClientUserActive(id, userId, body.active);
  return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
}

// Novo link para a pessoa escolher a senha (serve também para quem esqueceu).
export async function POST(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  if (!opsAuthorized(request)) return unauthorized();
  const { id, userId } = await params;
  const r = await newInviteLink(id, userId);
  return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
}
