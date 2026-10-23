import { Pool } from "pg";

// Banco PRÓPRIO do backoffice (administradores e registro de ações). Fica separado do banco do sistema:
// quem entra aqui não tem acesso direto aos dados dos clientes, só às rotas /api/ops.
const g = globalThis as unknown as { boPool?: Pool; boReady?: Promise<void> };

function pool(): Pool {
  if (!g.boPool) {
    if (!process.env.BACKOFFICE_DATABASE_URL) throw new Error("BACKOFFICE_DATABASE_URL não configurado.");
    g.boPool = new Pool({ connectionString: process.env.BACKOFFICE_DATABASE_URL, max: 5 });
  }
  return g.boPool;
}

// Esquema do backoffice (BACKOFFICE_DB_SCHEMA): permite dividir o mesmo Postgres com o sistema sem misturar tabelas.
const SCHEMA = (process.env.BACKOFFICE_DB_SCHEMA ?? "public").replace(/[^a-z0-9_]/gi, "");
const qualify = (sql: string) => sql.replace(/bo_(admin|audit|login_fail)(?!_)/g, `"${SCHEMA}".bo_$1`);

async function migrate() {
  // O papel do painel (docs/instalacao-dors.md) não pode criar esquemas: se já existe, não tenta.
  const has = await pool().query("SELECT 1 FROM information_schema.schemata WHERE schema_name = $1", [SCHEMA]);
  if (!has.rowCount) await pool().query(`CREATE SCHEMA "${SCHEMA}"`);
  await pool().query(qualify(`
    CREATE TABLE IF NOT EXISTS bo_admin (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS bo_audit (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      admin_id TEXT,
      admin_name TEXT,
      action TEXT NOT NULL,
      target TEXT,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS bo_audit_at_idx ON bo_audit (at DESC);
    ALTER TABLE bo_admin ADD COLUMN IF NOT EXISTS sessions_valid_from TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS bo_login_fail (
      id BIGSERIAL PRIMARY KEY,
      key TEXT NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS bo_login_fail_key_idx ON bo_login_fail (key, at);
  `));
  // Defesa em profundidade no Supabase: RLS ligado e nada para os papéis públicos (o dono das tabelas ignora o RLS).
  await pool().query(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = '${SCHEMA}' LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', '${SCHEMA}', r.tablename);
      END LOOP;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL ON SCHEMA %I FROM anon', '${SCHEMA}');
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', '${SCHEMA}');
        EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM anon', '${SCHEMA}');
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE ALL ON SCHEMA %I FROM authenticated', '${SCHEMA}');
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM authenticated', '${SCHEMA}');
        EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM authenticated', '${SCHEMA}');
      END IF;
    END $$;
  `);
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await (g.boReady ??= migrate().catch((e) => {
    g.boReady = undefined;
    throw e;
  }));
  return (await pool().query(qualify(sql), params)).rows as T[];
}
