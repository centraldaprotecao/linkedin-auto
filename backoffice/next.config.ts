import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem enxuta para o servidor (copia só o que o app usa).
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd()),
  // Cabeçalhos de segurança: ninguém embute o painel em outro site, e o navegador não "adivinha" tipos de arquivo.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
