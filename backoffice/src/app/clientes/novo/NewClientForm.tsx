"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CopyLink } from "@/components/Bits";
import { PlanFields } from "@/components/PlanFields";
import { createClientAction } from "./actions";

export function NewClientForm() {
  const [state, action, pending] = useActionState(createClientAction, undefined);

  if (state?.created) {
    const c = state.created;
    return (
      <div className="card">
        <h2>Cliente criado: {c.name}</h2>
        <p>
          Envie o link abaixo para a primeira pessoa. Ela escolhe a própria senha e entra com o login <strong>{c.login}</strong>.
        </p>
        <CopyLink link={c.inviteLink} />
        <p className="hint">O link vale por 7 dias e só uma vez. Se vencer, gere outro na página do cliente.</p>
        <p style={{ marginTop: 16 }}>
          <Link href={`/clientes/${c.clientId}`} className="btn primary">Abrir o cliente</Link>
        </p>
        <div className="notice ok">O cliente começa com a automação pausada e em modo de aprovação: nada sai sozinho até ele conectar os canais e ligar.</div>
      </div>
    );
  }

  return (
    <form action={action} className="card">
      <h2>Dados do cliente</h2>
      <label htmlFor="name">Nome do cliente (empresa)</label>
      <input id="name" name="name" required maxLength={120} autoFocus />
      <div className="row">
        <div>
          <label htmlFor="ownerName">Primeira pessoa (nome)</label>
          <input id="ownerName" name="ownerName" required maxLength={80} />
        </div>
        <div>
          <label htmlFor="login">Login dela (opcional)</label>
          <input id="login" name="login" maxLength={40} placeholder="Se vazio, usa o primeiro nome" autoCapitalize="none" />
        </div>
      </div>
      <h2 style={{ marginTop: 24 }}>Plano</h2>
      <PlanFields />
      {state?.error && <p className="notice err" role="alert">{state.error}</p>}
      <p style={{ marginTop: 16 }}>
        <button className="primary" type="submit" disabled={pending}>{pending ? "Criando…" : "Criar cliente"}</button>
      </p>
    </form>
  );
}
