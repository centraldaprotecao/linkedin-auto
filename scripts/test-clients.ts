// Gestão de clientes (o que o backoffice usa): criar, duplicidade de login, pausar, pessoas, link de convite e uso.
// Só roda em banco local. Uso: DATABASE_URL=postgresql://postgres@localhost:<porta>/<banco> npx tsx scripts/test-clients.ts
import assert from "node:assert/strict";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Este teste só roda em banco local.");
  process.env.SESSION_SECRET ||= "x".repeat(32);
  process.env.APP_URL = "https://sistema.exemplo.com";
  const { prismaSystem } = await import("../src/lib/prisma");
  const { createClientWithOwner, listClients, updateClient, addClientUser, setClientUserActive, newInviteLink, listClientUsers } = await import("../src/lib/clients");
  const tag = `t${Date.now()}`;
  const ids: string[] = [];
  try {
    const a = await createClientWithOwner({ name: `Cliente ${tag}`, ownerName: "Ana Paula", login: `ana${tag}`, plan: { planName: "Início", planMailboxes: 3 } });
    assert.ok(!("error" in a), "cria o cliente");
    if ("error" in a) return;
    ids.push(a.clientId);
    assert.match(a.inviteLink, /^https:\/\/sistema\.exemplo\.com\/convite\//);

    const dup = await createClientWithOwner({ name: "Outro", ownerName: "Ana", login: `ana${tag}` });
    assert.ok("error" in dup && /já está em uso/.test(dup.error), "login é único em todo o sistema");

    const s = await prismaSystem.settings.findUniqueOrThrow({ where: { clientId: a.clientId } });
    assert.equal(s.automationPaused, true, "cliente novo nasce com a automação pausada");
    assert.equal(s.approvalMode, true, "e em modo piloto");
    assert.equal(s.planMailboxes, 3);

    const b = await createClientWithOwner({ name: `Cliente B ${tag}`, ownerName: "Bia", login: `bia${tag}` });
    assert.ok(!("error" in b));
    if ("error" in b) return;
    ids.push(b.clientId);

    const added = await addClientUser(a.clientId, { name: "Caio", login: `caio${tag}` });
    assert.ok(!("error" in added));
    if ("error" in added) return;
    assert.equal((await listClientUsers(a.clientId)).length, 2);
    assert.equal((await listClientUsers(b.clientId)).length, 1, "pessoas de um cliente não aparecem no outro");

    // Não dá para mexer na pessoa de outro cliente.
    const wrong = await setClientUserActive(b.clientId, added.id, false);
    assert.ok("error" in wrong);
    assert.ok("error" in (await newInviteLink(b.clientId, added.id)));
    assert.ok(!("error" in (await setClientUserActive(a.clientId, added.id, false))));
    assert.ok("error" in (await newInviteLink(a.clientId, added.id)), "pessoa desativada não ganha link");

    assert.ok(!("error" in (await updateClient(a.clientId, { status: "PAUSED", plan: { planUsers: 5 } }))));
    const row = (await listClients()).find((c) => c.id === a.clientId)!;
    assert.equal(row.status, "PAUSED");
    assert.equal(row.plan?.users, 5);
    assert.equal(row.usage.users, 1);
    assert.equal(row.health?.whatsappConfigured, false);
    assert.ok("error" in (await updateClient("inexistente", { name: "x" })));

    console.log("ok: gestão de clientes");
  } finally {
    await prismaSystem.client.deleteMany({ where: { id: { in: ids } } });
    await prismaSystem.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
