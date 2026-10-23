import { q } from "@/lib/db";
import type { Admin } from "@/lib/session";

// Registro de quem fez o quê (nunca grava senhas nem links de convite).
export async function audit(admin: Admin | null, action: string, target?: string, detail?: string) {
  await q("INSERT INTO bo_audit (admin_id, admin_name, action, target, detail) VALUES ($1, $2, $3, $4, $5)", [admin?.id ?? null, admin ? `${admin.name} <${admin.email}>` : null, action, target ?? null, detail ?? null]).catch((e) =>
    console.error("Falha ao registrar a ação", e),
  );
}
