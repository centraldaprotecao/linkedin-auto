// Isolamento entre clientes: dois clientes de teste usam o sistema ao mesmo tempo e nenhum enxerga ou altera o outro.
// Roda SÓ contra um banco local/de teste (recusa qualquer outro). Uso:
//   DATABASE_URL=postgresql://postgres@localhost:<porta>/<banco> npx tsx scripts/test-isolation.ts
import assert from "node:assert/strict";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Este teste só roda em banco local (DATABASE_URL com localhost).");
  process.env.SESSION_SECRET ||= "x".repeat(32); // valor só do teste

  const { prisma, prismaSystem } = await import("../src/lib/prisma");
  const { runAsClient } = await import("../src/lib/tenant");

  const tag = `iso${Date.now()}`;
  const A = await prismaSystem.client.create({ data: { name: `${tag}-A` } });
  const B = await prismaSystem.client.create({ data: { name: `${tag}-B` } });
  const as = <T>(c: { id: string }, fn: () => Promise<T>) => runAsClient(c.id, fn);

  try {
    // Settings: cada cliente tem a sua; o apelido antigo { id: "singleton" } cai na linha do cliente da requisição.
    await as(A, () => prisma.settings.create({ data: { ownerName: "Ana" } }));
    await as(B, () => prisma.settings.create({ data: { ownerName: "Beto" } }));
    assert.equal((await as(A, () => prisma.settings.findUniqueOrThrow({ where: { id: "singleton" } }))).ownerName, "Ana");
    assert.equal((await as(B, () => prisma.settings.findUniqueOrThrow({ where: { id: "singleton" } }))).ownerName, "Beto");
    await as(A, () => prisma.settings.update({ where: { id: "singleton" }, data: { ownerName: "Ana 2" } }));
    assert.equal((await as(B, () => prisma.settings.findUniqueOrThrow({ where: { id: "singleton" } }))).ownerName, "Beto", "update de A não pode mexer em B");

    // O mesmo perfil do LinkedIn pode ser lead dos dois clientes; repetido dentro do mesmo cliente, não.
    const url1 = `https://www.linkedin.com/in/${tag}`;
    const leadA = await as(A, () => prisma.lead.create({ data: { linkedinProfileUrl: url1, firstName: "Lead de A", messages: { create: { sender: "LEAD", content: "oi A", deliveredAt: new Date() } } } }));
    const leadB = await as(B, () => prisma.lead.create({ data: { linkedinProfileUrl: url1, firstName: "Lead de B" } }));
    await assert.rejects(() => as(A, () => prisma.lead.create({ data: { linkedinProfileUrl: url1 } })), "perfil repetido no mesmo cliente deve falhar");

    // Dono gravado, inclusive em filhos criados junto e pelo gatilho do banco.
    assert.equal(leadA.clientId, A.id);
    assert.equal((await as(A, () => prisma.message.findFirstOrThrow({ where: { leadId: leadA.id } }))).clientId, A.id, "filho criado junto herda o dono");
    const events = await prismaSystem.leadStageEvent.findMany({ where: { leadId: leadA.id } });
    assert.ok(events.length > 0 && events.every((e) => e.clientId === A.id), "gatilho do histórico grava o dono da ficha");

    // Entrada "com relações" (lead: { connect }) também ganha o dono.
    const msg = await as(A, () => prisma.message.create({ data: { lead: { connect: { id: leadA.id } }, sender: "AGENT", content: "resposta", deliveredAt: new Date() } }));
    assert.equal(msg.clientId, A.id);

    // Leitura: nenhum cliente enxerga o outro, de nenhuma forma.
    assert.equal((await as(A, () => prisma.lead.findMany())).length, 1);
    assert.equal(await as(B, () => prisma.lead.count()), 1);
    assert.equal(await as(B, () => prisma.lead.findUnique({ where: { id: leadA.id } })), null, "findUnique pelo id de outro cliente");
    assert.equal(await as(B, () => prisma.lead.findFirst({ where: { id: leadA.id } })), null);
    assert.equal(await as(B, () => prisma.message.count()), 0, "mensagens de A invisíveis para B");
    assert.equal((await as(B, () => prisma.lead.groupBy({ by: ["status"], _count: true }))).reduce((n, g) => n + g._count, 0), 1);
    assert.equal((await as(B, () => prisma.lead.aggregate({ _count: true })))._count, 1);
    const withMsgs = await as(B, () => prisma.lead.findUniqueOrThrow({ where: { id: leadB.id }, include: { messages: true } }));
    assert.equal(withMsgs.messages.length, 0);

    // Escrita: nenhum cliente altera ou apaga dados do outro.
    await assert.rejects(() => as(B, () => prisma.lead.update({ where: { id: leadA.id }, data: { firstName: "invadido" } })));
    assert.equal((await as(B, () => prisma.lead.updateMany({ where: { id: leadA.id }, data: { firstName: "invadido" } }))).count, 0);
    assert.equal((await as(B, () => prisma.lead.deleteMany({ where: { id: leadA.id } }))).count, 0);
    await assert.rejects(() => as(B, () => prisma.lead.delete({ where: { id: leadA.id } })));
    assert.equal((await as(A, () => prisma.lead.findUniqueOrThrow({ where: { id: leadA.id } }))).firstName, "Lead de A");

    // Trocar o dono pelo próprio código não funciona.
    await as(A, () => prisma.lead.update({ where: { id: leadA.id }, data: { clientId: B.id } as never }));
    assert.equal((await prismaSystem.lead.findUniqueOrThrow({ where: { id: leadA.id } })).clientId, A.id);

    // createMany, upsert e criação com dono falso.
    await as(A, () => prisma.inviteScheduled.createMany({ data: [{ profileUrl: `${url1}-1` }, { profileUrl: `${url1}-2` }] }));
    assert.equal(await as(A, () => prisma.inviteScheduled.count()), 2);
    assert.equal(await as(B, () => prisma.inviteScheduled.count()), 0);
    const up = await as(B, () => prisma.inviteScheduled.upsert({ where: { clientId_profileUrl: { clientId: "ignorado", profileUrl: `${url1}-1` } }, create: { profileUrl: `${url1}-1` }, update: {} }));
    assert.equal(up.clientId, B.id, "upsert em B não pode reaproveitar a linha de A");
    const fake = await as(B, () => prisma.campaign.create({ data: { name: "c", clientId: A.id } as never }));
    assert.equal(fake.clientId, B.id, "dono vem do contexto, não do dado enviado");

    // Ids vindos do navegador e gravados como campo (leadId, campaignId): a conferência de dono recusa id de outro cliente.
    const { ownsLead, ownsCampaign } = await import("../src/lib/ownership");
    const campA = await as(A, () => prisma.campaign.create({ data: { name: "camp de A" } }));
    assert.equal(await as(A, () => ownsLead(leadA.id)), true);
    assert.equal(await as(B, () => ownsLead(leadA.id)), false, "lead de A não pode ser usado por B");
    assert.equal(await as(A, () => ownsCampaign(campA.id)), true);
    assert.equal(await as(B, () => ownsCampaign(campA.id)), false, "campanha de A não pode ser usada por B");

    // Transação interativa também é filtrada.
    const inTx = await as(A, () => prisma.$transaction(async (tx) => tx.lead.count()));
    assert.equal(inTx, 1);

    // Sem cliente no contexto: falha, nunca devolve tudo.
    await assert.rejects(() => prisma.lead.findMany(), /Sem cliente no contexto/);

    // Contextos simultâneos não se misturam.
    const counts = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => as(i % 2 ? A : B, () => prisma.lead.findMany().then((l) => l.map((x) => x.firstName)))));
    counts.forEach((names, i) => assert.deepEqual(names, [(i + 1) % 2 ? "Lead de A" : "Lead de B"]));

    console.log("ok: isolamento entre clientes");
  } finally {
    await prismaSystem.client.deleteMany({ where: { id: { in: [A.id, B.id] } } });
    await prismaSystem.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
