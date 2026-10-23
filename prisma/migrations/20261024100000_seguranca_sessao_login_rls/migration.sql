-- Auditoria de segurança (F-02, F-04, F-06): bloqueio de login no banco, "Sair" que derruba o cookie e RLS.

-- "Sair" grava a hora; cookies emitidos antes dela deixam de valer.
ALTER TABLE "PanelUser" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);

-- Tentativas de entrada erradas (contadas no banco: a memória de cada instância da Vercel não serve).
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LoginAttempt_key_at_idx" ON "LoginAttempt"("key", "at");

-- Defesa em profundidade no Supabase: sem RLS e sem permissão para os papéis públicos (anon/authenticated),
-- ligar a exposição do esquema na API não abre os dados. O sistema conecta como dono das tabelas, que ignora o RLS.
-- Toda migração nova que criar tabela precisa repetir este bloco (scripts/test-rls.ts avisa se esquecer).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', current_schema(), r.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM anon', current_schema());
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', current_schema());
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM anon', current_schema());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM authenticated', current_schema());
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM authenticated', current_schema());
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM authenticated', current_schema());
  END IF;
END $$;
