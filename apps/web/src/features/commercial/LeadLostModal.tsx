import { CatalogInput } from "../../shared/components/CatalogInput";
import type { Lead } from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

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
  const dirty = useFormDirty(reason);
  return (
    <ActionModal
      eyebrow="CRM comercial"
      title="Marcar lead como perdido"
      subtitle={lead.fullName}
      effect={`${lead.fullName} sai das oportunidades abertas e vai para a coluna Perdidos, com o motivo registrado no cartão.`}
      danger
      validate={() => (reason.trim() ? "" : "Informe o motivo da perda.")}
      onConfirm={() => onConfirm(reason.trim())}
      dirty={dirty}
      onClose={onClose}
    >
      <CatalogInput
        autoFocus
        kind="lead_lost_reason"
        label="Motivo da perda"
        value={reason}
        onChange={setReason}
        required
        maxLength={500}
      />
    </ActionModal>
  );
}
