// Exporta o CONTEÚDO de configuração de um sistema antigo (campanhas, cadência, manual da assistente e ajustes) para um
// arquivo, para começar o cliente novo já com isso. NÃO leva contatos, mensagens, acessos, caixas de e-mail nem conexões
// (LinkedIn, WhatsApp, Google, voz), que pertencem a quem criou. Só LÊ o banco de origem.
// Uso: node scripts/exportar-conteudo.mjs   (lê DATABASE_URL de .env.local; grava entrega/conteudo-dors.json, fora do git)
import fs from "node:fs";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const url = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Sem DATABASE_URL de origem.");
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
await db.connect();
await db.query("SET default_transaction_read_only = on");

const rows = async (sql) => (await db.query(sql)).rows;
const out = {
  exportadoEm: new Date().toISOString(),
  campaigns: await rows(`SELECT id, name, description, audience, instructions, "maxLeads", "followUpMaxCount", "followUpDelayHours", status, "captureTitle", "captureText", "captureChannel" FROM "Campaign" ORDER BY "createdAt"`),
  campaignSteps: await rows(`SELECT "campaignId", position, day, channel, text, notify FROM "CampaignStep" ORDER BY "campaignId", position`),
  knowledge: await rows(`SELECT position, title, content, mode FROM "KnowledgeSection" ORDER BY position`),
  settings: (await rows(`SELECT * FROM "Settings" LIMIT 1`))[0] ?? null,
};
await db.end();

// Ajustes: só o que é jeito de trabalhar. Fora: conexões, plano, voz, dono, estado do robô e tudo que aponta para contas do Lucas.
const KEEP = [
  "meetingRemindersEnabled", "reminderDayText", "reminder5hText", "reminder1hText", "noShowText",
  "campaignReview", "campaignReviewDays", "campaignReviewMessages", "meetingMinutes",
  "dailyInviteLimit", "dailyMessageLimit", "dailyEmailLimit", "dailyWhatsappLimit",
  "agentInstructions", "writingStyle", "targetAudience", "agentModel",
  "followUpMaxCount", "followUpDelayHours", "workStartHour", "workEndHour", "workWeekdaysOnly", "replyAnytime",
  "assistantName", "assistantDiscloseAi", "exclusionList",
  "acceptInvitesEnabled", "withdrawInvitesEnabled", "withdrawAfterDays", "warmupEnabled", "archiveLostEnabled",
  "emailChannelEnabled", "whatsappChannelEnabled", "dailySummaryEnabled", "emailInviteFallbackDays",
];
if (out.settings) out.settings = Object.fromEntries(KEEP.filter((k) => k in out.settings).map((k) => [k, out.settings[k]]));

fs.mkdirSync("entrega", { recursive: true });
fs.writeFileSync("entrega/conteudo-dors.json", JSON.stringify(out, null, 2));
console.log(`campanhas ${out.campaigns.length}, passos ${out.campaignSteps.length}, trechos do manual ${out.knowledge.length}, ajustes ${out.settings ? Object.keys(out.settings).length + " campos" : "nenhum"}`);
console.log("gravado em entrega/conteudo-dors.json (essa pasta não vai para o git)");
