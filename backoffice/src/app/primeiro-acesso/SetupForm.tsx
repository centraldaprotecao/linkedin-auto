"use client";

import { useActionState } from "react";
import { createFirstAdmin } from "./actions";

export function SetupForm({ min }: { min: number }) {
  const [state, action, pending] = useActionState(createFirstAdmin, undefined);
  return (
    <form action={action}>
      <label htmlFor="key">Código de instalação</label>
      <input id="key" name="key" type="password" autoComplete="off" required />
      <label htmlFor="name">Seu nome</label>
      <input id="name" name="name" autoComplete="name" required />
      <label htmlFor="email">Seu e-mail</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">Senha</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={min} required />
      <p className="hint">Pelo menos {min} caracteres.</p>
      <label htmlFor="again">Repita a senha</label>
      <input id="again" name="again" type="password" autoComplete="new-password" minLength={min} required />
      {state?.error && <p className="notice err" role="alert">{state.error}</p>}
      <p style={{ marginTop: 16 }}>
        <button className="primary" type="submit" disabled={pending}>{pending ? "Criando…" : "Criar e entrar"}</button>
      </p>
    </form>
  );
}
