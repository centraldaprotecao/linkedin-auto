"use client";

import { useActionState } from "react";
import { CopyLink } from "@/components/Bits";
import { addAdminAction, adminLinkAction, toggleAdminAction, type AdminFormState } from "./actions";

export type AdminView = { id: string; name: string; email: string; active: boolean; hasPassword: boolean; isMe: boolean };

function Feedback({ state }: { state: AdminFormState }) {
  if (!state) return null;
  return (
    <>
      {state.error && <p className="notice err" role="alert">{state.error}</p>}
      {state.ok && <p className="notice ok" role="status">{state.ok}</p>}
      {state.link && <CopyLink link={state.link} />}
    </>
  );
}

function AdminRow({ a }: { a: AdminView }) {
  const [state, action, pending] = useActionState(adminLinkAction.bind(null, a.id), undefined);
  return (
    <tr>
      <td>
        <strong>{a.name}</strong> {a.isMe && <span className="badge">você</span>}
        <div className="muted small">{a.email}</div>
      </td>
      <td>{!a.active ? <span className="badge warn">desativado</span> : a.hasPassword ? <span className="badge ok">ativo</span> : <span className="badge warn">aguardando senha</span>}</td>
      <td>
        <div className="badges">
          {a.active && (
            <form action={action}>
              <button type="submit" className="linkbtn" disabled={pending}>{a.hasPassword ? "Gerar link para trocar a senha" : "Gerar link de acesso"}</button>
            </form>
          )}
          {!a.isMe && (
            <form action={toggleAdminAction.bind(null, a.id, !a.active)}>
              <button type="submit" className={`linkbtn ${a.active ? "danger" : ""}`}>{a.active ? "Desativar" : "Reativar"}</button>
            </form>
          )}
        </div>
        <Feedback state={state} />
      </td>
    </tr>
  );
}

export function AdminsPanel({ admins }: { admins: AdminView[] }) {
  const [state, action, pending] = useActionState(addAdminAction, undefined);
  return (
    <>
      <div className="card scroll">
        <table>
          <thead>
            <tr><th>Administrador</th><th>Situação</th><th>Ações</th></tr>
          </thead>
          <tbody>{admins.map((a) => <AdminRow key={a.id} a={a} />)}</tbody>
        </table>
      </div>
      <form action={action} className="card">
        <h2>Adicionar administrador</h2>
        <div className="row">
          <div>
            <label htmlFor="aname">Nome</label>
            <input id="aname" name="name" required maxLength={80} />
          </div>
          <div>
            <label htmlFor="aemail">E-mail</label>
            <input id="aemail" name="email" type="email" required />
          </div>
        </div>
        <Feedback state={state} />
        <p style={{ marginTop: 12 }}>
          <button className="primary" type="submit" disabled={pending}>{pending ? "Adicionando…" : "Adicionar"}</button>
        </p>
      </form>
    </>
  );
}
