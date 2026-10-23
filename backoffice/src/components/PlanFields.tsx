import type { PlanView } from "@/lib/sistema";

// Campos do plano (nome e limites). Vazio = sem limite naquele item.
export function PlanFields({ plan, ceilings }: { plan?: PlanView | null; ceilings?: boolean }) {
  return (
    <>
      <label htmlFor="planName">Nome do plano</label>
      <input id="planName" name="planName" defaultValue={plan?.name ?? ""} placeholder="Ex.: Início" maxLength={60} />
      <div className="row">
        <div>
          <label htmlFor="planUsers">Pessoas com acesso</label>
          <input id="planUsers" name="planUsers" inputMode="numeric" defaultValue={plan?.users ?? ""} placeholder="sem limite" />
        </div>
        <div>
          <label htmlFor="planMailboxes">Caixas de e-mail</label>
          <input id="planMailboxes" name="planMailboxes" inputMode="numeric" defaultValue={plan?.mailboxes ?? ""} placeholder="sem limite" />
        </div>
        <div>
          <label htmlFor="planConversations">Conversas por mês</label>
          <input id="planConversations" name="planConversations" inputMode="numeric" defaultValue={plan?.conversations ?? ""} placeholder="sem limite" />
        </div>
        <div>
          <label htmlFor="planAiBudgetUsd">Orçamento de IA (US$/mês)</label>
          <input id="planAiBudgetUsd" name="planAiBudgetUsd" inputMode="decimal" defaultValue={plan?.aiBudgetUsd ?? ""} placeholder="sem limite" />
        </div>
      </div>
      {ceilings && (
        <>
          <div className="row">
            <div>
              <label htmlFor="dailyInviteMax">Teto diário de convites no LinkedIn</label>
              <input id="dailyInviteMax" name="dailyInviteMax" inputMode="numeric" defaultValue={plan?.dailyInviteMax ?? 25} required />
            </div>
            <div>
              <label htmlFor="dailyMessageMax">Teto diário de mensagens no LinkedIn</label>
              <input id="dailyMessageMax" name="dailyMessageMax" inputMode="numeric" defaultValue={plan?.dailyMessageMax ?? 40} required />
            </div>
          </div>
          <p className="hint">O cliente escolhe o limite dele em Ajustes, mas nunca acima destes tetos.</p>
        </>
      )}
    </>
  );
}
