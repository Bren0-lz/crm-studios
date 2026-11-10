import { PatientPlanModal } from "../features/patients/PatientPlanModal";
import type { PlanSaleRequest } from "../shared/workflows/PlanSaleContext";

/**
 * Venda do plano avulso a partir do agendamento (sem marcar sessões na contratação) ou do
 * recorrente com turma a partir da Lista de espera.
 */
export function renderPlanSale(request: PlanSaleRequest) {
  return (
    <PatientPlanModal
      patient={request.patient}
      kind={request.kind ?? "single"}
      initialTemplateId={request.planTemplateId}
      initialServiceId={request.initialServiceId}
      initialGroupId={request.initialGroupId}
      scheduleSessions={false}
      onClose={request.onClose}
      onSaved={request.onSaved}
    />
  );
}
