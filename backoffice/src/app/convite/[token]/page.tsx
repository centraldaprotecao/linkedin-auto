import { MIN_PASSWORD, fingerprint, readInviteToken } from "@/lib/auth";
import { q } from "@/lib/db";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = readInviteToken(token);
  const [admin] = invite ? await q<{ name: string; password_hash: string | null; active: boolean }>("SELECT name, password_hash, active FROM bo_admin WHERE id = $1", [invite.adminId]) : [];
  if (!invite || !admin || !admin.active || fingerprint(admin.password_hash) !== invite.fp) {
    return (
      <main className="solo">
        <div className="card">
          <h1>Link vencido</h1>
          <p className="muted">Este link já foi usado ou passou do prazo. Peça um novo a quem administra.</p>
        </div>
      </main>
    );
  }
  return (
    <main className="solo">
      <div className="card">
        <h1>Olá, {admin.name.split(" ")[0]}</h1>
        <p className="muted">Escolha a sua senha para entrar na Central de clientes.</p>
        <InviteForm token={token} min={MIN_PASSWORD} />
      </div>
    </main>
  );
}
