"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action}>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="username" autoFocus required />
      <label htmlFor="password">Senha</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={state?.error ? true : undefined} />
      {state?.error && <p className="notice err" role="alert">{state.error}</p>}
      <p style={{ marginTop: 16 }}>
        <button className="primary" type="submit" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      </p>
    </form>
  );
}
