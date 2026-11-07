import {
  OVERDUE_PAYMENT_TAG,
  type PatientOption,
  patientTagKey,
} from "@crm/contracts";
import { AlertTriangle, Eye } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuthorization } from "../../authorization-context";
import { OverduePaymentDetailsModal } from "./OverduePaymentDetailsModal";

/** Etiquetas que pedem atenção antes de agendar (comparadas sem acento/maiúsculas). */
const attentionTags = ["Assinatura cancelada", OVERDUE_PAYMENT_TAG];

/**
 * Avisos (sem bloquear) ao escolher o cliente do agendamento: etiqueta de pendência. O plano
 * tem campo próprio no agendamento (AP4).
 */
export function AppointmentPatientWarnings({
  patient,
  onNestedModalChange,
}: {
  patient: PatientOption | undefined;
  /** Abre/fecha o modal de detalhes sobre o formulário (o de baixo fica inativo). */
  onNestedModalChange?: ((open: boolean) => void) | undefined;
}) {
  const { can, canView } = useAuthorization();
  const canSeeFinance = canView("finance") && can("finance.view");
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (!patient) return null;
  const keys = new Set((patient.tags ?? []).map(patientTagKey));
  const warnings: { title: string; detail: string; overdue?: boolean }[] =
    attentionTags
      .filter((tag) => keys.has(patientTagKey(tag)))
      .map((tag) => ({
        title: `Cliente com a etiqueta “${tag}”`,
        detail: "Confirme a situação com o cliente antes de agendar.",
        overdue: tag === OVERDUE_PAYMENT_TAG,
      }));
  if (warnings.length === 0) return null;
  function toggleDetails(open: boolean) {
    setDetailsOpen(open);
    onNestedModalChange?.(open);
  }
  return (
    <div className="appointment-patient-warnings span-2" role="status">
      <AlertTriangle size={18} aria-hidden="true" />
      <ul>
        {warnings.map((warning) => (
          <li key={warning.title}>
            <strong>{warning.title}</strong>
            <span>{warning.detail}</span>
            {warning.overdue && canSeeFinance && (
              <button
                type="button"
                className="secondary-button button-sm"
                onClick={() => toggleDetails(true)}
              >
                <Eye size={15} aria-hidden="true" />
                Ver detalhes do pagamento
              </button>
            )}
          </li>
        ))}
      </ul>
      {detailsOpen &&
        createPortal(
          <OverduePaymentDetailsModal
            patientId={patient.id}
            patientName={patient.fullName}
            onClose={() => toggleDetails(false)}
          />,
          document.body,
        )}
    </div>
  );
}
