import { NextResponse } from "next/server";
import { opsAuthorized, opsRun } from "@/lib/ops";
import { addMailbox, listMailboxes, setMailboxStatus, testMailbox, type MailboxInput } from "@/lib/mailboxAdmin";

// Testar o envio e a leitura de uma caixa pode levar alguns segundos.
export const maxDuration = 60;

// Lista, cadastra, testa, pausa ou aposenta as caixas de envio de UM cliente (?client=). Chamado só pelo backoffice (ver lib/ops.ts).
export const GET = (request: Request) => opsRun(request, async () => NextResponse.json({ mailboxes: await listMailboxes() }));
export const POST = (request: Request) => opsRun(request, () => handlePOST(request));
async function handlePOST(request: Request) {
  if (!opsAuthorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as ({ action?: string; id?: string } & Partial<MailboxInput>) | null;
  if (body?.action === "add") return NextResponse.json(await addMailbox(body as MailboxInput));
  if (body?.action === "test" && body.id) return NextResponse.json(await testMailbox(String(body.id)));
  if ((body?.action === "pause" || body?.action === "resume" || body?.action === "retire") && body.id) {
    const status = body.action === "pause" ? "PAUSED" : body.action === "resume" ? "ACTIVE" : "RETIRED";
    return NextResponse.json(await setMailboxStatus(String(body.id), status));
  }
  return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
}
