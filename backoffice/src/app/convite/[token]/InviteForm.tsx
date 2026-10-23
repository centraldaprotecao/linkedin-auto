"use client";

import { useActionState } from "react";
import { acceptInvite } from "./actions";

export function InviteForm({ token, min }: { token: string; min: number }) {
  const [state, action, pending] = useActionState(acceptInvite.bind(null, token), undefined);
  return (
    <form action={action}>
      <label htmlFor="password">Nova senha</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={min} autoFocus required />
      <p className="hint">Pelo menos {min} caracteres.</p>
      <label htmlFor="again">Repita a senha</label>
      <input id="again" name="again" type="password" autoComplete="new-password" minLength={min} required />
      {state?.error && <p className="notice err" role="alert">{state.error}</p>}
      <p style={{ marginTop: 16 }}>
        <button className="primary" type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar e entrar"}</button>
      </p>
    </form>
  );
}
