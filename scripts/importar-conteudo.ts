// Carrega num cliente do sistema novo o conteúdo exportado por scripts/exportar-conteudo.mjs (campanhas, cadência,
// manual da assistente e ajustes). Recusa se o cliente já tem campanhas ou manual (não duplica).
// Uso: npx tsx scripts/importar-conteudo.ts <id-do-cliente> [arquivo.json]
//   (usa DATABASE_URL e, se houver, DATABASE_SCHEMA do ambiente)
import fs from "node:fs";
import type { Prisma } from "@prisma/client";

type Dump = {
  campaigns: (Record<string, unknown> & { id: string })[];
  campaignSteps: (Record<string, unknown> & { campaignId: string })[];
  knowledge: Record<string, unknown>[];
  settings: Record<string, unknown> | null;
};

async function main() {
  const clientId = process.argv[2];
  const file = process.argv[3] ?? "entrega/conteudo-dors.json";
  if (!clientId) throw new Error("Informe o id do cliente.");
  process.env.SESSION_SECRET ||= "x".repeat(32);
  const { prisma, prismaSystem } = await import("../src/lib/prisma");
  const { runAsClient } = await import("../src/lib/tenant");
  const dump = JSON.parse(fs.readFileSync(file, "utf8")) as Dump;
  if (!(await prismaSystem.client.findUnique({ where: { id: clientId }, select: { id: true } }))) throw new Error("Cliente não encontrado.");

  const r = await runAsClient(clientId, async () => {
    if ((await prisma.campaign.count()) > 0 || (await prisma.knowledgeSection.count()) > 0) throw new Error("O cliente já tem campanhas ou manual; não vou duplicar.");
    const idMap = new Map<string, string>();
    for (const c of dump.campaigns) {
      const { id, ...rest } = c;
      // O formulário público (link/QR) não é levado: o endereço pertence ao sistema antigo.
      const created = await prisma.campaign.create({ data: { ...(rest as Prisma.CampaignCreateInput), captureOn: false, captureSlug: null } });
      idMap.set(id, created.id);
    }
    let steps = 0;
    for (const s of dump.campaignSteps) {
      const campaignId = idMap.get(s.campaignId);
      if (!campaignId) continue;
      const { campaignId: _old, ...rest } = s;
      void _old;
      await prisma.campaignStep.create({ data: { ...(rest as Omit<Prisma.CampaignStepUncheckedCreateInput, "campaignId">), campaignId } });
      steps++;
    }
    for (const k of dump.knowledge) await prisma.knowledgeSection.create({ data: k as unknown as Prisma.KnowledgeSectionCreateInput });
    if (dump.settings) {
      // O cliente novo continua pausado e em modo de aprovação, mesmo que o sistema antigo estivesse diferente.
      await prisma.settings.update({ where: { id: "singleton" }, data: { ...(dump.settings as Prisma.SettingsUpdateInput), automationPaused: true, approvalMode: true } });
    }
    return { campanhas: idMap.size, passos: steps, manual: dump.knowledge.length, ajustes: dump.settings ? Object.keys(dump.settings).length : 0 };
  });
  console.log("importado:", r);
  await prismaSystem.$disconnect();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
