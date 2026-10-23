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
const qualify = (sql: string) => sql.replace(/bo_(admin|audit)(?!_)/g, `"${SCHEMA}".bo_$1`);

async function migrate() {
  await pool().query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
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
  `));
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await (g.boReady ??= migrate().catch((e) => {
    g.boReady = undefined;
    throw e;
  }));
  return (await pool().query(qualify(sql), params)).rows as T[];
}
