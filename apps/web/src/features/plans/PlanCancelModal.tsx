import type { PatientPlan } from "@crm/contracts";
import { ActionModal } from "../../shared/components/ActionModal";

export function PlanCancelModal({
  plan,
  onClose,
  onConfirm,
}: {
  plan: PatientPlan;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ActionModal
      eyebrow="Planos"
      title="Cancelar plano"
      subtitle={`${plan.patientName} · ${plan.name}`}
      effect={`As parcelas em aberto deste plano são canceladas no Financeiro${plan.remainingSessions === 1 ? " e a sessão restante não poderá mais ser usada" : plan.remainingSessions > 1 ? ` e as ${plan.remainingSessions} sessões restantes não poderão mais ser usadas` : ""}. Um plano cancelado não pode ser reativado.`}
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
