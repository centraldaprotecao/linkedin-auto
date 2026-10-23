"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wrap">
      <div className="card">
        <h1>Algo deu errado</h1>
        <p className="muted">A ação não foi concluída. Tente de novo; se repetir, avise quem cuida do sistema.</p>
        <button className="primary" onClick={reset}>Tentar de novo</button>
      </div>
    </main>
  );
}
