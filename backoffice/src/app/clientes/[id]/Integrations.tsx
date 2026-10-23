"use client";

import { useActionState } from "react";
import type { MailboxView, WhatsappView } from "@/lib/sistema";
import { addMailboxAction, removeWhatsappKeyAction, saveWhatsappKeyAction, setMailboxAction, testMailboxAction, type FormState } from "./actions";

function Feedback({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <>
      {state.error && <p className="notice err" role="alert">{state.error}</p>}
      {state.ok && <p className="notice ok" role="status">{state.ok}</p>}
    </>
  );
}

const LIVE: Record<string, { label: string; cls: string }> = {
  working: { label: "número conectado", cls: "ok" },
  down: { label: "número desconectado", cls: "bad" },
  "sem-chave": { label: "sem chave", cls: "warn" },
  unknown: { label: "não consegui consultar", cls: "warn" },
};

export function WhatsappPanel({ clientId, clientName, wa }: { clientId: string; clientName: string; wa: WhatsappView }) {
  const [state, action, pending] = useActionState(saveWhatsappKeyAction.bind(null, clientId, clientName), undefined);
  const live = LIVE[wa.live] ?? { label: wa.live, cls: "" };
  return (
    <div className="card">
      <h2>WhatsApp</h2>
      <p>
        {wa.hasKey ? <span className="badge ok">chave guardada</span> : <span className="badge warn">sem chave</span>} <span className={`badge ${live.cls}`}>{live.label}</span>
      </p>
      <p className="muted small">
        No CRM de WhatsApp (Deskcomm), crie a organização deste cliente e uma chave de acesso (permissões <b>mcp:read</b>, <b>mcp:write</b> e <b>role:manager</b>). Cole a chave aqui: o sistema testa e guarda cifrada. Depois o cliente lê o QR Code em Ajustes › WhatsApp.
      </p>
      <form action={action}>
        <label htmlFor="token">Chave do CRM (dsk_…)</label>
        <input id="token" name="token" type="password" autoComplete="off" required />
        <Feedback state={state} />
        <p style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="primary" type="submit" disabled={pending}>{pending ? "Testando…" : wa.hasKey ? "Trocar a chave" : "Guardar a chave"}</button>
        </p>
      </form>
      {wa.hasKey && (
        <form action={removeWhatsappKeyAction.bind(null, clientId, clientName)}>
          <button type="submit" className="linkbtn danger">Remover a chave</button>
        </form>
      )}
    </div>
  );
}

function MailboxRow({ clientId, clientName, m }: { clientId: string; clientName: string; m: MailboxView }) {
  const [state, action, pending] = useActionState(testMailboxAction.bind(null, clientId, m.id), undefined);
  const warming = m.status === "ACTIVE" && m.limitToday < m.dailyLimit;
  return (
    <tr>
      <td>
        <strong>{m.address}</strong>
        {m.displayName && <div className="muted small">{m.displayName}</div>}
        {m.lastError && <div className="small" style={{ color: "var(--bad)" }}>Erro: {m.lastError}</div>}
      </td>
      <td>
        {m.status === "ACTIVE" ? <span className="badge ok">ativa</span> : <span className="badge warn">pausada</span>} {warming && <span className="badge warn">aquecendo</span>}
        <div className="muted small">hoje até {m.limitToday} de {m.dailyLimit}</div>
      </td>
      <td>
        <div className="badges">
          <form action={action}>
            <button type="submit" className="linkbtn" disabled={pending}>Testar conexão</button>
          </form>
          <form action={setMailboxAction.bind(null, clientId, clientName, m.id, m.address, m.status === "ACTIVE" ? "pause" : "resume")}>
            <button type="submit" className="linkbtn">{m.status === "ACTIVE" ? "Pausar" : "Reativar"}</button>
          </form>
          <form action={setMailboxAction.bind(null, clientId, clientName, m.id, m.address, "retire")}>
            <button type="submit" className="linkbtn danger">Aposentar</button>
          </form>
        </div>
        <Feedback state={state} />
      </td>
    </tr>
  );
}

export function MailboxesPanel({ clientId, clientName, mailboxes, planLimit }: { clientId: string; clientName: string; mailboxes: MailboxView[]; planLimit: number | null | undefined }) {
  const [state, action, pending] = useActionState(addMailboxAction.bind(null, clientId, clientName), undefined);
  return (
    <div className="card">
      <h2>Caixas de e-mail de envio ({planLimit == null ? mailboxes.length : `${mailboxes.length} de ${planLimit}`})</h2>
      {mailboxes.length === 0 ? (
        <p className="muted">Nenhuma caixa ainda. Compre as caixas no InboxKit e cadastre abaixo.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Caixa</th><th>Situação</th><th>Ações</th></tr>
            </thead>
            <tbody>{mailboxes.map((m) => <MailboxRow key={m.id} clientId={clientId} clientName={clientName} m={m} />)}</tbody>
          </table>
        </div>
      )}
      <form action={action} style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: "1rem" }}>Cadastrar caixa</h2>
        <p className="muted small">Os dados de servidor vêm preenchidos para caixas Google (as do InboxKit). O sistema só guarda a caixa se conseguir enviar e ler com esses dados.</p>
        <div className="row">
          <div>
            <label htmlFor="mb-address">Endereço</label>
            <input id="mb-address" name="address" type="email" required autoCapitalize="none" />
          </div>
          <div>
            <label htmlFor="mb-password">Senha (ou senha de app)</label>
            <input id="mb-password" name="password" type="password" autoComplete="off" required />
          </div>
          <div>
            <label htmlFor="mb-name">Nome que aparece no “De:”</label>
            <input id="mb-name" name="displayName" maxLength={60} />
          </div>
          <div>
            <label htmlFor="mb-limit">E-mails por dia (depois do aquecimento)</label>
            <input id="mb-limit" name="dailyLimit" inputMode="numeric" defaultValue={30} />
          </div>
        </div>
        <div className="row">
          <div>
            <label htmlFor="mb-smtp">Servidor de envio (SMTP)</label>
            <input id="mb-smtp" name="smtpHost" defaultValue="smtp.gmail.com" required />
          </div>
          <div>
            <label htmlFor="mb-smtpp">Porta de envio</label>
            <input id="mb-smtpp" name="smtpPort" inputMode="numeric" defaultValue={465} required />
          </div>
          <div>
            <label htmlFor="mb-imap">Servidor de leitura (IMAP)</label>
            <input id="mb-imap" name="imapHost" defaultValue="imap.gmail.com" required />
          </div>
          <div>
            <label htmlFor="mb-imapp">Porta de leitura</label>
            <input id="mb-imapp" name="imapPort" inputMode="numeric" defaultValue={993} required />
          </div>
        </div>
        <Feedback state={state} />
        <p style={{ marginTop: 12 }}>
          <button className="primary" type="submit" disabled={pending}>{pending ? "Conferindo a caixa…" : "Conferir e cadastrar"}</button>
        </p>
      </form>
    </div>
  );
}
