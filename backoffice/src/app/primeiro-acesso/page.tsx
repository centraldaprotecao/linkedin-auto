import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { MIN_PASSWORD } from "@/lib/auth";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function FirstAccessPage() {
  const [{ n }] = await q<{ n: string }>("SELECT count(*)::text AS n FROM bo_admin");
  if (n !== "0") redirect("/login");
  return (
    <main className="solo">
      <div className="card">
        <h1>Primeiro acesso</h1>
        <p className="muted">Crie o primeiro administrador. O código de instalação foi entregue por quem montou o sistema.</p>
        <SetupForm min={MIN_PASSWORD} />
      </div>
    </main>
  );
}
