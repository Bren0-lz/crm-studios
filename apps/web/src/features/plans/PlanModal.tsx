import { useState } from "react";
import { api } from "../../api";
import { Modal } from "../../shared/components/Modal";
import { PlanForm } from "./PlanForm";
import type { PlanModalProps } from "./types";

export function PlanModal({
  patients,
  services,
  renewing,
  onClose,
  onSaved,
}: PlanModalProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={renewing ? "Renovar plano" : "Novo plano"}
      subtitle={
        renewing
          ? `${renewing.patientName} ? ${renewing.serviceName}. O novo per?odo recebe saldo e parcelas pr?prios; as sess?es restantes do plano atual n?o s?o transferidas.`
          : "O saldo e as contas a receber serão criados na mesma operação."
      }
      busy={busy}
      onClose={onClose}
    >
      <PlanForm
        patients={patients}
        services={services}
        renewing={renewing}
        onCancel={onClose}
        onBusyChange={setBusy}
        onSubmit={async (input) => {
          const plan = renewing
            ? await api.renewPlan(renewing.id, {
                name: input.name,
                services: input.services,
                validFrom: input.validFrom,
                validUntil: input.validUntil,
                totalValueInCents: input.totalValueInCents,
                installments: input.installments,
                firstDueDate: input.firstDueDate,
                autoRenew: Boolean(input.autoRenew),
              })
            : await api.createPlan(input);
          onSaved(plan);
        }}
      />
    </Modal>
  );
}
