import { robotAgeMs, type ClientView } from "@/lib/sistema";

const ROBOT_STALE_MS = 45 * 60 * 1000;

export function HealthBadges({ h }: { h: ClientView["health"] }) {
  if (!h) return <span className="badge warn">sem configuração</span>;
  const robotAge = robotAgeMs(h.lastRobotRunAt);
  return (
    <span className="badges">
      {h.automationPaused && <span className="badge warn">automação pausada</span>}
      {h.linkedinNeedsReconnect ? <span className="badge bad">LinkedIn: reconectar</span> : h.linkedinConnected ? <span className="badge ok">LinkedIn</span> : <span className="badge warn">LinkedIn: não conectado</span>}
      {h.whatsappConfigured ? <span className="badge ok">WhatsApp</span> : <span className="badge warn">WhatsApp: sem chave</span>}
      {h.googleConnected ? <span className="badge ok">Google</span> : <span className="badge warn">Google: não conectado</span>}
      {robotAge === null ? <span className="badge warn">robô: sem rodada</span> : robotAge > ROBOT_STALE_MS ? <span className="badge bad">robô parado</span> : null}
    </span>
  );
}

export function StatusBadge({ status }: { status: "ACTIVE" | "PAUSED" }) {
  return status === "ACTIVE" ? <span className="badge ok">Ativo</span> : <span className="badge warn">Pausado</span>;
}
