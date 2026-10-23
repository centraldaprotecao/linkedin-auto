import { q } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { AdminsPanel } from "./AdminsPanel";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const me = await requireAdmin();
  const rows = await q<{ id: string; name: string; email: string; active: boolean; password_hash: string | null }>("SELECT id, name, email, active, password_hash FROM bo_admin ORDER BY created_at");
  return (
    <main className="wrap" style={{ maxWidth: 860 }}>
      <div className="head">
        <div>
          <h1>Administradores</h1>
          <p className="muted">Quem pode entrar nesta Central de clientes. Todos têm o mesmo poder.</p>
        </div>
      </div>
      <AdminsPanel admins={rows.map((r) => ({ id: r.id, name: r.name, email: r.email, active: r.active, hasPassword: Boolean(r.password_hash), isMe: r.id === me.id }))} />
    </main>
  );
}
