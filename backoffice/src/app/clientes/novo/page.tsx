import Link from "next/link";
import { NewClientForm } from "./NewClientForm";

export default function NewClientPage() {
  return (
    <main className="wrap" style={{ maxWidth: 760 }}>
      <p><Link href="/">← Clientes</Link></p>
      <div className="head">
        <div>
          <h1>Novo cliente</h1>
          <p className="muted">Cria o cliente no sistema e gera o link de acesso da primeira pessoa.</p>
        </div>
      </div>
      <NewClientForm />
    </main>
  );
}
