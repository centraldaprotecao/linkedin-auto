// Prova dos papéis do banco (deploy/papeis-banco.sql) e do RLS (migração de segurança + tabelas do painel).
// Precisa de um Postgres local de teste (usuário postgres sem senha); cria e apaga o banco "papeis_test".
//   ADMIN_URL=postgresql://postgres@localhost:54329/postgres npx tsx scripts/test-papeis.ts
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { Client } from "pg";

const ADMIN = process.env.ADMIN_URL ?? "postgresql://postgres@localhost:54329/postgres";
const at = (db: string, user = "postgres") => ADMIN.replace(/\/\/[^@]*@/, `//${user}@`).replace(/\/[^/?]*$/, `/${db}`);
const DB = "papeis_test";

async function connect(url: string) {
  const c = new Client({ connectionString: url });
  await c.connect();
  return c;
}

// Não há psql na máquina de teste: roda o .sql como o psql faria (variáveis :'nome' e \gexec).
async function runPsqlFile(c: Client, file: string, vars: Record<string, string>) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => !l.trim().startsWith("--"));
  let buf = "";
  for (const raw of lines) {
    buf += raw + "\n";
    const gexec = /\\gexec\s*$/.test(raw);
    if (!gexec && !/;\s*$/.test(raw)) continue;
    const sql = buf.replace(/\\gexec\s*$/m, "").replace(/:'(\w+)'/g, (_, n) => `'${(vars[n] ?? "").replace(/'/g, "''")}'`).trim().replace(/;$/, "");
    buf = "";
    const res = await c.query(sql);
    if (gexec) for (const row of res.rows) await c.query(String(Object.values(row)[0]));
  }
}

const denied = async (c: Client, sql: string) => {
  await assert.rejects(() => c.query(sql), /permission denied|must be owner|does not exist/i, `deveria negar: ${sql}`);
};

async function main() {
  const admin = await connect(at("postgres"));
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  for (const r of ["sistema", "painel", "deskcomm"]) await admin.query(`DROP ROLE IF EXISTS ${r}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  // No Supabase estes três papéis já existem; aqui são simulados.
  for (const r of ["anon", "authenticated", "service_role"]) {
    if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [r])).rowCount) await admin.query(`CREATE ROLE ${r} NOLOGIN`);
  }
  await admin.end();

  const owner = await connect(at(DB));
  await runPsqlFile(owner, "deploy/papeis-banco.sql", { senha_sistema: "s1", senha_painel: "p1", senha_deskcomm: "d1" });
  console.log("ok  roteiro de papéis aplicado");

  // Deskcomm cria uma tabela dele em "public".
  const desk = await connect(at(DB, "deskcomm"));
  await desk.query("CREATE TABLE public.conversa (id int, texto text)");
  await desk.query("INSERT INTO public.conversa VALUES (1, 'segredo do whatsapp')");
  console.log("ok  deskcomm cria tabelas em public");

  // O sistema migra o próprio esquema SEM ser dono do banco (é assim que a DOR$ vai rodar).
  const env = { ...process.env, DIRECT_URL: `${at(DB, "sistema")}?schema=central`, DATABASE_URL: "" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  console.log("ok  prisma migrate deploy como papel 'sistema' (esquema central)");

  const sis = await connect(at(DB, "sistema"));
  await sis.query("SET search_path = central");
  await sis.query('SELECT count(*) FROM "Client"');
  assert.ok((await sis.query('SELECT 1 FROM "LoginAttempt" LIMIT 1')).rowCount === 0);
  await denied(sis, "SELECT * FROM public.conversa");
  await denied(sis, "CREATE TABLE public.intruso (id int)");
  await denied(desk, "CREATE SCHEMA novo");
  console.log("ok  sistema lê o central e NÃO lê nem escreve em public");

  // O painel cria as próprias tabelas (backoffice/src/lib/db.ts) sem poder criar esquema.
  process.env.BACKOFFICE_DATABASE_URL = at(DB, "painel");
  process.env.BACKOFFICE_DB_SCHEMA = "backoffice";
  const { q } = await import("../backoffice/src/lib/db");
  await q("INSERT INTO bo_admin (id, name, email) VALUES ('a1', 'Admin', 'a@teste.local')");
  assert.equal((await q("SELECT id FROM bo_admin")).length, 1);
  console.log("ok  painel cria e usa o esquema backoffice como papel 'painel'");

  const pai = await connect(at(DB, "painel"));
  await denied(pai, 'SELECT * FROM central."Client"');
  await denied(pai, "SELECT * FROM public.conversa");
  await denied(desk, 'SELECT * FROM central."Client"');
  await denied(desk, "SELECT * FROM backoffice.bo_admin");
  await denied(sis, "SELECT * FROM backoffice.bo_admin");
  console.log("ok  cada papel é barrado nos esquemas dos outros");

  // RLS: toda tabela de central e backoffice tem RLS ligado; os papéis públicos do Supabase não entram.
  const semRls = await owner.query("SELECT schemaname || '.' || tablename AS t FROM pg_tables WHERE schemaname IN ('central','backoffice') AND NOT rowsecurity");
  assert.deepEqual(semRls.rows, [], "tabela sem RLS: " + semRls.rows.map((r) => r.t).join(", "));
  for (const role of ["anon", "authenticated"]) {
    await owner.query(`SET ROLE ${role}`);
    await denied(owner, 'SELECT * FROM central."Client"');
    await denied(owner, "SELECT * FROM backoffice.bo_admin");
    await owner.query("RESET ROLE");
  }
  console.log("ok  RLS ligado em todas as tabelas; anon e authenticated barrados");

  await (globalThis as unknown as { boPool?: { end(): Promise<void> } }).boPool?.end();
  await Promise.all([desk.end(), sis.end(), pai.end()]);
  await owner.end();
  const cleanup = await connect(at("postgres"));
  await cleanup.query(`DROP DATABASE ${DB} WITH (FORCE)`);
  for (const r of ["sistema", "painel", "deskcomm"]) await cleanup.query(`DROP ROLE ${r}`);
  await cleanup.end();
  console.log("\nTudo certo: papéis do banco e RLS.");
  process.exit(0);
}

main().catch((e) => {
  console.error("FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
