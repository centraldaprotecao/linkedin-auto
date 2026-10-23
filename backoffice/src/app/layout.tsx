import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getAdmin } from "@/lib/session";
import { logout } from "./actions";

export const metadata: Metadata = { title: "DOR$ · Central de clientes", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin().catch(() => null);
  return (
    <html lang="pt-BR">
      <body>
        {admin && (
          <header className="top">
            <span className="brand">DOR$ · Clientes</span>
            <nav aria-label="Principal">
              <Link href="/">Clientes</Link>
              <Link href="/administradores">Administradores</Link>
              <Link href="/registro">Registro de ações</Link>
            </nav>
            <div className="who">
              <span className="muted small">{admin.name}</span>
              <form action={logout}>
                <button type="submit">Sair</button>
              </form>
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
