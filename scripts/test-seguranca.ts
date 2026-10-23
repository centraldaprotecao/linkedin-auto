// Provas das correções da auditoria: validade da sessão, "Sair", bloqueio de login no banco e CSV sem fórmula.
// Precisa de um Postgres de TESTE com as migrações aplicadas (nunca o banco de verdade):
//   DATABASE_URL=postgresql://postgres@localhost:54329/central DATABASE_SCHEMA=public \
//   BACKOFFICE_DATABASE_URL=postgresql://postgres@localhost:54329/backoffice BACKOFFICE_DB_SCHEMA=backoffice \
//   npx tsx scripts/test-seguranca.ts
import assert from "node:assert/strict";

process.env.SESSION_SECRET = "x".repeat(32);
process.env.BACKOFFICE_SECRET = "y".repeat(32);

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Recuso rodar: DATABASE_URL não é um banco local de teste.");
  process.exit(1);
}

async function main() {
  const T0 = 1_800_000_000_000;
  const H = 3_600_000;
  const DAY = 24 * H;

  // ---- Sistema: validade e "Sair"
  const sys = await import("../src/lib/auth");
  const tok = sys.createUserToken("cli1", "u1", "fp", T0);
  assert.ok(sys.parseUserToken(tok, T0 + 29 * DAY), "vale dentro dos 30 dias");
  assert.equal(sys.parseUserToken(tok, T0 + 31 * DAY), null, "vencido depois de 30 dias");
  assert.equal(sys.parseUserToken(tok, T0 - 10 * 60_000), null, "emitido no futuro não vale");
  const forged = tok.replace(/\.\d+\.([0-9a-f]+)$/, `.${Math.floor((T0 + 20 * DAY) / 1000)}.$1`);
  assert.equal(sys.parseUserToken(forged, T0 + 31 * DAY), null, "trocar a data invalida a assinatura");
  assert.equal(sys.issuedBeforeLogout(Math.floor(T0 / 1000), new Date(T0 + 1000)), true, "emitido antes do Sair");
  assert.equal(sys.issuedBeforeLogout(Math.floor(T0 / 1000), new Date(T0 - 5000)), false, "entrou depois do Sair");
  assert.equal(sys.issuedBeforeLogout(Math.floor(T0 / 1000), null), false);
  console.log("ok  sessão do sistema: validade de 30 dias e Sair");

  // ---- Painel: validade (12 h) e "Sair"
  const bo = await import("../backoffice/src/lib/auth");
  const btok = bo.createSessionToken("a1", "fp", T0);
  assert.ok(bo.parseSessionToken(btok, T0 + 11 * H));
  assert.equal(bo.parseSessionToken(btok, T0 + 13 * H), null, "vencido depois de 12 horas");
  assert.equal(bo.parseSessionToken(btok.replace(/\.\d+\.([0-9a-f]+)$/, `.${Math.floor((T0 + 12 * H) / 1000)}.$1`), T0 + 13 * H), null);
  assert.equal(bo.parseSessionToken("b.a1.fp.sig", T0), null, "formato antigo não vale");
  console.log("ok  sessão do painel: validade de 12 horas");

  // ---- CSV
  const { csvCell } = await import("../src/lib/csv");
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell("+5511999999999"), "'+5511999999999");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("\t=x"), "'\t=x");
  assert.equal(csvCell("Maria"), "Maria");
  assert.equal(csvCell("a;b"), '"a;b"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(42), "42");
  console.log("ok  CSV: células com fórmula viram texto");

  // ---- Bloqueio de login no banco do sistema (instâncias diferentes enxergam a mesma contagem)
  const { prismaSystem } = await import("../src/lib/prisma");
  const lim = await import("../src/lib/loginLimit");
  await prismaSystem.loginAttempt.deleteMany({});
  const t = Date.now();
  for (let i = 0; i < 4; i++) await lim.loginFailed("maria", "1.1.1.1", t);
  assert.equal(await lim.loginBlocked("maria", "1.1.1.1", t), false, "4 erros ainda não bloqueiam");
  await lim.loginFailed("maria", "1.1.1.1", t);
  assert.equal(await lim.loginBlocked("maria", "1.1.1.1", t), true, "5 erros bloqueiam login+aparelho");
  assert.equal(await lim.loginBlocked("maria", "9.9.9.9", t), false, "outro aparelho ainda tenta");
  assert.equal(await lim.loginBlocked("maria", "1.1.1.1", t + 16 * 60_000), false, "libera depois de 15 minutos");
  // Atacante trocando de aparelho: a conta por login (15) o pega.
  await prismaSystem.loginAttempt.deleteMany({});
  for (let i = 0; i < 15; i++) await lim.loginFailed("diretor", `10.0.0.${i}`, t);
  assert.equal(await lim.loginBlocked("diretor", "10.0.0.99", t), true, "15 erros no mesmo login, de aparelhos diferentes, bloqueiam o login");
  // Atacante varrendo logins de um aparelho só: a conta por aparelho (40) o pega.
  await prismaSystem.loginAttempt.deleteMany({});
  for (let i = 0; i < 40; i++) await lim.loginFailed(`pessoa${i}`, "2.2.2.2", t);
  assert.equal(await lim.loginBlocked("outra", "2.2.2.2", t), true, "40 erros do mesmo aparelho bloqueiam o aparelho");
  // Entrar zera a conta de login+aparelho.
  await prismaSystem.loginAttempt.deleteMany({});
  for (let i = 0; i < 4; i++) await lim.loginFailed("ana", "3.3.3.3", t);
  await lim.loginSucceeded("ana", "3.3.3.3");
  await lim.loginFailed("ana", "3.3.3.3", t);
  assert.equal(await lim.loginBlocked("ana", "3.3.3.3", t), false);
  await prismaSystem.loginAttempt.deleteMany({});
  console.log("ok  bloqueio de login do sistema, contado no banco");

  // ---- Mesma coisa no painel
  const blim = await import("../backoffice/src/lib/loginLimit");
  const { q } = await import("../backoffice/src/lib/db");
  await q("DELETE FROM bo_login_fail");
  for (let i = 0; i < 4; i++) await blim.loginFailed("adm@teste.local", "4.4.4.4");
  assert.equal(await blim.loginBlocked("adm@teste.local", "4.4.4.4"), false);
  await blim.loginFailed("adm@teste.local", "4.4.4.4");
  assert.equal(await blim.loginBlocked("adm@teste.local", "4.4.4.4"), true);
  assert.equal(await blim.loginBlocked("adm@teste.local", "5.5.5.5"), false);
  await q("UPDATE bo_login_fail SET at = now() - interval '16 minutes'");
  assert.equal(await blim.loginBlocked("adm@teste.local", "4.4.4.4"), false, "libera depois de 15 minutos");
  await q("DELETE FROM bo_login_fail");
  for (let i = 0; i < 15; i++) await blim.loginFailed("chefe@teste.local", `10.1.0.${i}`);
  assert.equal(await blim.loginBlocked("chefe@teste.local", "10.1.0.99"), true);
  await q("DELETE FROM bo_login_fail");
  console.log("ok  bloqueio de login do painel, contado no banco");

  // ---- Baixas: OPS sem fallback, Client fechado no acesso filtrado, SESSION_SECRET curto, login sem usuário
  const { opsAuthorized } = await import("../src/lib/ops");
  process.env.CRON_SECRET = "c".repeat(40);
  delete process.env.OPS_SECRET;
  const asCron = new Request("http://x/api/ops/status", { headers: { authorization: `Bearer ${"c".repeat(40)}` } });
  assert.equal(opsAuthorized(asCron), false, "sem OPS_SECRET a chave do robô não abre /api/ops");
  process.env.OPS_SECRET = "o".repeat(40);
  assert.equal(opsAuthorized(asCron), false, "CRON_SECRET não abre /api/ops");
  assert.equal(opsAuthorized(new Request("http://x", { headers: { authorization: `Bearer ${"o".repeat(40)}` } })), true);
  const { prisma } = await import("../src/lib/prisma");
  const { runAsClient } = await import("../src/lib/tenant");
  await assert.rejects(() => runAsClient("qualquer", async () => prisma.client.findMany()), /prismaSystem/, "o acesso filtrado não enxerga a tabela de clientes");
  const { verifyPassword } = await import("../src/lib/panelUsers");
  assert.equal(verifyPassword("qualquer-coisa", null), false);
  const { seal } = await import("../src/lib/secretBox");
  process.env.SESSION_SECRET = "curto";
  assert.throws(() => seal("x"), /mínimo 32/);
  assert.throws(() => sys.createUserToken("c", "u", "f"), /mínimo 32/);
  process.env.SESSION_SECRET = "x".repeat(32);
  console.log("ok  baixas: OPS_SECRET exclusivo, Client fechado, segredo mínimo");

  console.log("\nTudo certo: correções da auditoria.");
  process.exit(0);
}

main().catch((e) => {
  console.error("FALHOU:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
