import { NextResponse } from "next/server";
import { opsAuthorized } from "@/lib/ops";
import { addClientUser, listClientUsers } from "@/lib/clients";

export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ error: "Não autorizado." }, { status: 401 });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!opsAuthorized(request)) return unauthorized();
  return NextResponse.json({ users: await listClientUsers((await params).id) });
}

// Nova pessoa do cliente; devolve o link para ela escolher a senha.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!opsAuthorized(request)) return unauthorized();
  const body = (await request.json().catch(() => null)) as { name?: string; login?: string } | null;
  const r = await addClientUser((await params).id, { name: String(body?.name ?? ""), login: body?.login });
  return NextResponse.json(r, { status: "error" in r ? 400 : 201 });
}
