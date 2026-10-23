"use client";

import { useActionState } from "react";
import { CopyLink } from "@/components/Bits";
import { PlanFields } from "@/components/PlanFields";
import type { PlanView, UserView } from "@/lib/sistema";
import { addUserAction, inviteLinkAction, runNowAction, saveClientAction, setStatusAction, toggleUserAction, type FormState } from "./actions";

function Feedback({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <>
      {state.error && <p className="notice err" role="alert">{state.error}</p>}
      {state.ok && <p className="notice ok" role="status">{state.ok}</p>}
    </>
  );
}

export function ClientForm({ id, name, plan }: { id: string; name: string; plan: PlanView | null }) {
  const [state, action, pending] = useActionState(saveClientAction.bind(null, id), undefined);
  return (
    <form action={action} className="card">
      <h2>Dados e plano</h2>
      <label htmlFor="name">Nome do cliente</label>
      <input id="name" name="name" defaultValue={name} required maxLength={120} />
      <PlanFields plan={plan} ceilings />
      <Feedback state={state} />
      <p style={{ marginTop: 16 }}>
        <button className="primary" type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
      </p>
    </form>
  );
}

export function StatusButton({ id, name, status }: { id: string; name: string; status: "ACTIVE" | "PAUSED" }) {
  const next = status === "ACTIVE" ? "PAUSED" : "ACTIVE";
  return (
    <form action={setStatusAction.bind(null, id, name, next)}>
      <button type="submit" className={status === "ACTIVE" ? "danger" : "primary"}>
        {status === "ACTIVE" ? "Pausar cliente" : "Reativar cliente"}
      </button>
    </form>
  );
}

export function RunNowButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(runNowAction.bind(null, id, name), undefined);
  return (
    <form action={action}>
      <button type="submit" disabled={pending}>{pending ? "Rodando…" : "Rodar o robô agora"}</button>
      <Feedback state={state} />
    </form>
  );
}

function UserRow({ clientId, clientName, user }: { clientId: string; clientName: string; user: UserView }) {
  const [state, action, pending] = useActionState(inviteLinkAction.bind(null, clientId, clientName, user.id, user.login), undefined);
  return (
    <tr>
      <td>
        <strong>{user.name}</strong>
        <div className="muted small">login: {user.login}</div>
      </td>
      <td>
        {!user.active ? <span className="badge warn">desativada</span> : user.hasPassword ? <span className="badge ok">ativa</span> : <span className="badge warn">aguardando senha</span>}
      </td>
      <td>
        <div className="badges">
          {user.active && (
            <form action={action}>
              <button type="submit" className="linkbtn" disabled={pending}>{user.hasPassword ? "Gerar link para trocar a senha" : "Gerar link de acesso"}</button>
            </form>
          )}
          <form action={toggleUserAction.bind(null, clientId, clientName, user.id, user.login, !user.active)}>
            <button type="submit" className={`linkbtn ${user.active ? "danger" : ""}`}>{user.active ? "Desativar" : "Reativar"}</button>
          </form>
        </div>
        <Feedback state={state} />
        {state?.link && <CopyLink link={state.link} />}
      </td>
    </tr>
  );
}

export function UsersPanel({ clientId, clientName, users, planLimit }: { clientId: string; clientName: string; users: UserView[]; planLimit: number | null | undefined }) {
  const [state, action, pending] = useActionState(addUserAction.bind(null, clientId, clientName), undefined);
  const active = users.filter((u) => u.active).length;
  return (
    <div className="card">
      <h2>Pessoas com acesso ({planLimit == null ? active : `${active} de ${planLimit}`})</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Pessoa</th><th>Situação</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {users.map((u) => <UserRow key={u.id} clientId={clientId} clientName={clientName} user={u} />)}
          </tbody>
        </table>
      </div>
      <form action={action} style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: "1rem" }}>Adicionar pessoa</h2>
        <div className="row">
          <div>
            <label htmlFor="uname">Nome</label>
            <input id="uname" name="name" required maxLength={80} />
          </div>
          <div>
            <label htmlFor="ulogin">Login (opcional)</label>
            <input id="ulogin" name="login" maxLength={40} placeholder="Se vazio, usa o primeiro nome" autoCapitalize="none" />
          </div>
        </div>
        <Feedback state={state} />
        {state?.link && <CopyLink link={state.link} />}
        <p style={{ marginTop: 12 }}>
          <button type="submit" disabled={pending}>{pending ? "Adicionando…" : "Adicionar"}</button>
        </p>
      </form>
    </div>
  );
}
