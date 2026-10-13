import type { Lead } from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";

export function LeadLostModal({
  lead,
  onClose,
  onConfirm,
}: {
  lead: Lead;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  return (
    <ActionModal
      eyebrow="CRM comercial"
      title="Marcar lead como perdido"
      subtitle={lead.fullName}
      effect={`${lead.fullName} sai das oportunidades abertas e vai para a coluna Perdidos, com o motivo registrado no cartão.`}
      danger
      validate={() => (reason.trim() ? "" : "Informe o motivo da perda.")}
      onConfirm={() => onConfirm(reason.trim())}
      onClose={onClose}
    >
      <label className="span-2">
        Motivo da perda
        <input
          autoFocus
          maxLength={500}
          placeholder="Ex.: achou o valor acima do orçamento"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
