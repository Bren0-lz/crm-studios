import { PatientPlanModal } from "../features/patients/PatientPlanModal";
import type { PlanSaleRequest } from "../shared/workflows/PlanSaleContext";

/** Venda do plano avulso a partir do agendamento: sem marcar sessões na contratação. */
export function renderPlanSale(request: PlanSaleRequest) {
  return (
    <PatientPlanModal
      patient={request.patient}
      kind="single"
      initialTemplateId={request.planTemplateId}
      scheduleSessions={false}
      onClose={request.onClose}
      onSaved={request.onSaved}
    />
  );
}
