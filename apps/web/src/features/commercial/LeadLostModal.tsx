import { withPrefix } from "@crm/contracts";
import type { Lead } from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { LeadLostReasonField } from "./LeadLostReasonField";

export function LeadLostModal({
  lead,
  columnLabel = "Perdidos",
  onClose,
  onConfirm,
}: {
  lead: Lead;
  /** Nome atual da coluna de perdidos (a clínica pode renomear). */
  columnLabel?: string;
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
      effect={`${lead.fullName} sai das oportunidades abertas e vai para a ${withPrefix("coluna", columnLabel)}, com o motivo registrado no cartão.`}
      danger
      missing={reason.trim() ? [] : ["Motivo da perda"]}
      onConfirm={() => onConfirm(reason.trim())}
      dirty={dirty}
      onClose={onClose}
    >
      <LeadLostReasonField value={reason} onChange={setReason} />
    </ActionModal>
  );
}
