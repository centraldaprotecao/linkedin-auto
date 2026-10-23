import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/Badges";
import { pageAdmin } from "@/lib/session";
import { clientStatus, getClient, getWhatsapp, listMailboxes, listUsers } from "@/lib/sistema";
import { MailboxesPanel, WhatsappPanel } from "./Integrations";
import { ClientForm, RunNowButton, StatusButton, UsersPanel } from "./Panels";

export const dynamic = "force-dynamic";

const usd = (n: number) => `US$ ${n.toFixed(2).replace(".", ",")}`;

type Attention = { level: "alto" | "medio" | "info"; text: string; where: string };

// O retrato de saúde pergunta ao WhatsApp e ao banco do cliente e pode levar alguns segundos: carrega à parte.
async function Health({ id }: { id: string }) {
  const r = await clientStatus(id);
  if (!r.ok) return <p className="notice err" role="alert">Não consegui ler a saúde do cliente: {r.error}</p>;
  const s = r.data as { geral?: "ok" | "atencao" | "problema"; atencao?: Attention[]; ia?: { mes?: { conversas?: number; interacoes?: number }; projecaoDoMesUsd?: number }; plano?: { conversas?: { usado: number; limite: number } | null } };
  const items = s.atencao ?? [];
  return (
    <>
      <p>
        {s.geral === "ok" && <span className="badge ok">Tudo certo</span>}
        {s.geral === "atencao" && <span className="badge warn">Pede atenção</span>}
        {s.geral === "problema" && <span className="badge bad">Tem problema</span>}
        {s.ia?.mes && (
          <span className="muted small" style={{ marginLeft: 12 }}>
            {s.ia.mes.conversas ?? 0} conversas e {s.ia.mes.interacoes ?? 0} interações de IA no mês
            {s.ia.projecaoDoMesUsd != null ? ` · projeção de IA do mês: ${usd(s.ia.projecaoDoMesUsd)}` : ""}
          </span>
        )}
      </p>
      {items.length === 0 ? (
        <p className="muted">Nada pendente.</p>
      ) : (
        <ul className="clean">
          {items.map((a, i) => (
            <li key={i}>
              <span className={`badge ${a.level === "alto" ? "bad" : a.level === "medio" ? "warn" : ""}`}>{a.where}</span> {a.text}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// WhatsApp e caixas pedem coisas ao sistema (e o WhatsApp pergunta ao CRM): carregam à parte, sem segurar a página.
async function WhatsappSection({ id, name }: { id: string; name: string }) {
  const r = await getWhatsapp(id);
  return r.ok ? <WhatsappPanel clientId={id} clientName={name} wa={r.data} /> : <p className="notice err" role="alert">WhatsApp: {r.error}</p>;
}

async function MailboxesSection({ id, name, planLimit }: { id: string; name: string; planLimit: number | null | undefined }) {
  const r = await listMailboxes(id);
  return r.ok ? <MailboxesPanel clientId={id} clientName={name} mailboxes={r.data.mailboxes} planLimit={planLimit} /> : <p className="notice err" role="alert">Caixas: {r.error}</p>;
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await pageAdmin();
  const { id } = await params;
  const [c, u] = await Promise.all([getClient(id), listUsers(id)]);
  if (!c.ok && /não encontrado/i.test(c.error)) notFound();
  if (!c.ok) {
    return (
      <main className="wrap">
        <p><Link href="/">← Clientes</Link></p>
        <p className="notice err" role="alert">{c.error}</p>
      </main>
    );
  }
  const client = c.data;
  const stat = (n: string | number, label: string) => (
    <div className="stat">
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
  return (
    <main className="wrap">
      <p><Link href="/">← Clientes</Link></p>
      <div className="head">
        <div>
          <h1>{client.name}</h1>
          <p className="muted">
            <StatusBadge status={client.status} /> · criado em {new Date(client.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <RunNowButton id={client.id} name={client.name} />
          <StatusButton id={client.id} name={client.name} status={client.status} />
        </div>
      </div>

      {client.status === "PAUSED" && (
        <p className="notice err">Cliente pausado: as pessoas não conseguem entrar e o robô não roda para ele. Os dados continuam guardados.</p>
      )}

      <div className="card">
        <h2>Uso do mês</h2>
        <div className="stats">
          {stat(client.usage.leads, "contatos")}
          {stat(client.usage.messages30d, "mensagens (30 dias)")}
          {stat(client.usage.emailsMonth, "e-mails enviados no mês")}
          {stat(client.usage.mailboxes, "caixas de e-mail")}
          {stat(client.usage.aiInteractionsMonth, "interações de IA")}
          {stat(usd(client.usage.aiCostUsdMonth), "custo de IA")}
        </div>
      </div>

      <div className="card">
        <h2>Saúde</h2>
        <Suspense fallback={<p className="muted">Verificando…</p>}>
          <Health id={client.id} />
        </Suspense>
      </div>

      <div className="grid">
        <Suspense fallback={<p className="muted">Carregando o WhatsApp…</p>}>
          <WhatsappSection id={client.id} name={client.name} />
        </Suspense>
        <Suspense fallback={<p className="muted">Carregando as caixas…</p>}>
          <MailboxesSection id={client.id} name={client.name} planLimit={client.plan?.mailboxes} />
        </Suspense>
      </div>

      <div className="grid">
        <ClientForm id={client.id} name={client.name} plan={client.plan} />
        {u.ok ? <UsersPanel clientId={client.id} clientName={client.name} users={u.data.users} planLimit={client.plan?.users} /> : <p className="notice err" role="alert">{u.error}</p>}
      </div>
    </main>
  );
}
