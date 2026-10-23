import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { getAdmin } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getAdmin().catch(() => null)) redirect("/");
  // Sem nenhum administrador ainda: é a primeira vez, vai para a criação do primeiro.
  const [{ n }] = await q<{ n: string }>("SELECT count(*)::text AS n FROM bo_admin");
  if (n === "0") redirect("/primeiro-acesso");
  return (
    <main className="solo">
      <div className="card">
        <h1>Central de clientes</h1>
        <p className="muted">DOR$ · área restrita</p>
        <LoginForm />
      </div>
    </main>
  );
}
