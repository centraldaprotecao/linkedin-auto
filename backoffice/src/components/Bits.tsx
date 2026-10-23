"use client";

import { useState } from "react";

// Campo de link com botão "Copiar" (links de convite: valem para escolher a senha, por isso aparecem uma vez).
export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="linkbox">
      <input readOnly value={link} aria-label="Link de convite" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // sem permissão de área de transferência: a pessoa seleciona e copia à mão
          }
        }}
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
