import { q } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requireAdmin();
  const rows = await q<{ id: string; at: Date; admin_name: string | null; action: string; target: string | null; detail: string | null }>("SELECT id, at, admin_name, action, target, detail FROM bo_audit ORDER BY at DESC LIMIT 300");
  return (
    <main className="wrap">
      <div className="head">
        <div>
          <h1>Registro de ações</h1>
          <p className="muted">Quem fez o quê nesta central (as últimas 300). Senhas e links nunca ficam aqui.</p>
        </div>
      </div>
      <div className="card scroll">
        <table>
          <thead>
            <tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Sobre</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="small">{new Date(r.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                <td className="small">{r.admin_name ?? <span className="muted">—</span>}</td>
                <td>{r.action}</td>
                <td className="small">{[r.target, r.detail].filter(Boolean).join(" · ")}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="muted">Nada registrado ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
