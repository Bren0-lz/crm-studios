import {
  OVERDUE_PAYMENT_TAG,
  type PatientOption,
  type PatientPlan,
  patientTagKey,
} from "@crm/contracts";
import { AlertTriangle, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { localIsoDate } from "../../shared/lib/formatting";
import { OverduePaymentDetailsModal } from "./OverduePaymentDetailsModal";

/** Etiquetas que pedem atenção antes de agendar (comparadas sem acento/maiúsculas). */
const attentionTags = ["Assinatura cancelada", OVERDUE_PAYMENT_TAG];

function hasCurrentPlan(plans: PatientPlan[], today: string) {
  return plans.some(
    (plan) =>
      plan.status === "active" &&
      plan.remainingSessions > 0 &&
      plan.validFrom <= today &&
      (!plan.validUntil || plan.validUntil >= today),
  );
}

/**
 * Avisos (sem bloquear) ao escolher o cliente do agendamento: etiqueta de pendência e
 * ausência de plano vigente com saldo.
 */
export function AppointmentPatientWarnings({
  patient,
  checkPlan,
  onNestedModalChange,
}: {
  patient: PatientOption | undefined;
  /** Atendimento regular consome sessão; experimental/avaliação não precisa de plano. */
  checkPlan: boolean;
  /** Abre/fecha o modal de detalhes sobre o formulário (o de baixo fica inativo). */
  onNestedModalChange?: ((open: boolean) => void) | undefined;
}) {
  const { can, canView } = useAuthorization();
  const canSeePlans = canView("plans");
  const canSeeFinance = canView("finance") && can("finance.view");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const patientId = patient?.id ?? "";
  const [plans, setPlans] = useState<{
    patientId: string;
    items: PatientPlan[];
  } | null>(null);
  useEffect(() => {
    if (!patientId || !canSeePlans) return;
    let active = true;
    api
      .plans(patientId)
      .then(
        (items) =>
          active &&
          setPlans({ patientId, items: Array.isArray(items) ? items : [] }),
      )
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [patientId, canSeePlans]);
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
  if (
    checkPlan &&
    plans?.patientId === patientId &&
    !hasCurrentPlan(plans.items, localIsoDate())
  )
    warnings.push({
      title: "Cliente sem plano com sessões disponíveis",
      detail:
        "Dá para agendar, mas esta sessão não será descontada de nenhum plano. Veja se o plano do cliente acabou ou venceu, ou combine o pagamento avulso.",
    });
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
