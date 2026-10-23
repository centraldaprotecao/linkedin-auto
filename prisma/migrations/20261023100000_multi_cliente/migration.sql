-- Multi-cliente: todo dado passa a ter um dono (Client). Tudo que existe hoje vira do cliente 1 (DOR$).
-- Idempotente. Antes de aplicar em produção: ramo/backup do banco. Para desfazer: ver o fim deste arquivo.

DO $$ BEGIN
  CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'PAUSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Client" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Client" ("id", "name") VALUES ('cliente-dors', 'DOR$') ON CONFLICT ("id") DO NOTHING;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['Lead','Campaign','WebSearchLog','Draft','AgentFeedback','OutgoingAudio','PushSubscription','Message','Settings','Material','KnowledgeSection','CampaignStep','TeamMember','Mailbox','PanelUser','InviteScheduled','LeadStageEvent','LeadTask','AiUsage']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "clientId" TEXT', t);
    EXECUTE format('UPDATE %I SET "clientId" = %L WHERE "clientId" IS NULL', t, 'cliente-dors');
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "clientId" SET NOT NULL', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_clientId_fkey') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE', t, t || '_clientId_fkey');
    END IF;
    IF t <> 'Settings' THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("clientId")', t || '_clientId_idx', t);
    END IF;
  END LOOP;
END $$;

-- Settings: uma linha por cliente (antes: uma só, id fixo).
ALTER TABLE "Settings" ALTER COLUMN "id" DROP DEFAULT;
CREATE UNIQUE INDEX IF NOT EXISTS "Settings_clientId_key" ON "Settings"("clientId");

-- Únicos que passam a valer por cliente (o mesmo perfil pode ser lead de dois clientes).
DROP INDEX IF EXISTS "Lead_linkedinProfileUrl_key";
DROP INDEX IF EXISTS "Lead_linkedinThreadId_key";
DROP INDEX IF EXISTS "Lead_whatsappConversationId_key";
DROP INDEX IF EXISTS "Message_linkedinMessageId_key";
DROP INDEX IF EXISTS "Message_emailMessageId_key";
DROP INDEX IF EXISTS "Message_whatsappMessageId_key";
DROP INDEX IF EXISTS "InviteScheduled_profileUrl_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_clientId_linkedinProfileUrl_key" ON "Lead"("clientId", "linkedinProfileUrl");
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_clientId_linkedinThreadId_key" ON "Lead"("clientId", "linkedinThreadId");
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_clientId_whatsappConversationId_key" ON "Lead"("clientId", "whatsappConversationId");
CREATE UNIQUE INDEX IF NOT EXISTS "Message_clientId_linkedinMessageId_key" ON "Message"("clientId", "linkedinMessageId");
CREATE UNIQUE INDEX IF NOT EXISTS "Message_clientId_emailMessageId_key" ON "Message"("clientId", "emailMessageId");
CREATE UNIQUE INDEX IF NOT EXISTS "Message_clientId_whatsappMessageId_key" ON "Message"("clientId", "whatsappMessageId");
CREATE UNIQUE INDEX IF NOT EXISTS "InviteScheduled_clientId_profileUrl_key" ON "InviteScheduled"("clientId", "profileUrl");

-- Gatilho do histórico de etapas: o registro nasce com o dono da ficha.
CREATE OR REPLACE FUNCTION lead_stage_log() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "LeadStageEvent" ("clientId", "leadId", "kind", "toValue") VALUES (NEW."clientId", NEW."id", 'STATUS', NEW."status"::text);
    IF NEW."meetingAt" IS NOT NULL THEN
      INSERT INTO "LeadStageEvent" ("clientId", "leadId", "kind", "meetingAt") VALUES (NEW."clientId", NEW."id", 'MEETING', NEW."meetingAt");
    END IF;
    RETURN NULL;
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    INSERT INTO "LeadStageEvent" ("clientId", "leadId", "kind", "fromValue", "toValue")
    VALUES (NEW."clientId", NEW."id", 'STATUS', OLD."status"::text, NEW."status"::text);
  END IF;
  IF NEW."meetingAt" IS NOT NULL AND NEW."meetingAt" IS DISTINCT FROM OLD."meetingAt" THEN
    INSERT INTO "LeadStageEvent" ("clientId", "leadId", "kind", "meetingAt") VALUES (NEW."clientId", NEW."id", 'MEETING', NEW."meetingAt");
  END IF;
  IF NEW."dealStage" IS DISTINCT FROM OLD."dealStage" OR NEW."dealValueCents" IS DISTINCT FROM OLD."dealValueCents" THEN
    INSERT INTO "LeadStageEvent" ("clientId", "leadId", "kind", "fromValue", "toValue", "amountCents")
    VALUES (NEW."clientId", NEW."id", 'DEAL', OLD."dealStage"::text, NEW."dealStage"::text, NEW."dealValueCents");
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql SET search_path FROM CURRENT;

-- DESFAZER (só vale enquanto existir um único cliente; com dois, os índices únicos antigos podem não voltar):
--   restaurar o ramo/backup feito antes; ou remover as colunas "clientId", os índices novos, recriar os únicos antigos
--   e a versão anterior de lead_stage_log() (migração 20261020190000), e então DROP TABLE "Client"; DROP TYPE "ClientStatus".
