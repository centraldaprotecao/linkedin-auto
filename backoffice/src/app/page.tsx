import Link from "next/link";
import { HealthBadges, StatusBadge } from "@/components/Badges";
import { listClients } from "@/lib/sistema";

export const dynamic = "force-dynamic";

const usd = (n: number) => `US$ ${n.toFixed(2).replace(".", ",")}`;
const of = (used: number, limit: number | null | undefined) => (limit == null ? String(used) : `${used} de ${limit}`);

export default async function ClientsPage() {
  const r = await listClients();
  return (
    <main className="wrap">
      <div className="head">
        <div>
          <h1>Clientes</h1>
          <p className="muted">Quem usa o sistema, o plano de cada um e como está a operação.</p>
        </div>
        <Link href="/clientes/novo" className="btn primary">Novo cliente</Link>
      </div>

      {!r.ok && <p className="notice err" role="alert">{r.error}</p>}
      {r.ok && r.data.clients.length === 0 && (
        <div className="card">
          <p>Nenhum cliente ainda.</p>
        </div>
      )}
      {r.ok && r.data.clients.length > 0 && (
        <div className="card scroll">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Plano</th>
                <th className="num">Pessoas</th>
                <th className="num">Contatos</th>
                <th className="num">Mensagens (30 dias)</th>
                <th className="num">E-mails (mês)</th>
                <th className="num">IA (mês)</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {r.data.clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/clientes/${c.id}`}><strong>{c.name}</strong></Link>
                    <div><StatusBadge status={c.status} /></div>
                  </td>
                  <td>{c.plan?.name ?? <span className="muted">sem plano</span>}</td>
                  <td className="num">{of(c.usage.users, c.plan?.users)}</td>
                  <td className="num">{c.usage.leads}</td>
                  <td className="num">{c.usage.messages30d}</td>
                  <td className="num">{c.usage.emailsMonth}</td>
                  <td className="num">{usd(c.usage.aiCostUsdMonth)}</td>
                  <td><HealthBadges h={c.health} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
