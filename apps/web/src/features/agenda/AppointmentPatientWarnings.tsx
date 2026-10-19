import {
  type PatientOption,
  type PatientPlan,
  patientTagKey,
} from "@crm/contracts";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { localIsoDate } from "../../shared/lib/formatting";

/** Etiquetas que pedem atenção antes de agendar (comparadas sem acento/maiúsculas). */
const attentionTags = ["Assinatura cancelada", "Pagamento atrasado"];

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
}: {
  patient: PatientOption | undefined;
  /** Atendimento regular consome sessão; experimental/avaliação não precisa de plano. */
  checkPlan: boolean;
}) {
  const { canView } = useAuthorization();
  const canSeePlans = canView("plans");
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
  const warnings = attentionTags
    .filter((tag) => keys.has(patientTagKey(tag)))
    .map((tag) => `Cliente com a etiqueta “${tag}”.`);
  if (
    checkPlan &&
    plans?.patientId === patientId &&
    !hasCurrentPlan(plans.items, localIsoDate())
  )
    warnings.push(
      "Cliente sem plano vigente com saldo: o atendimento não terá sessão para descontar.",
    );
  if (warnings.length === 0) return null;
  return (
    <div className="appointment-patient-warnings span-2" role="status">
      <AlertTriangle size={17} aria-hidden="true" />
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}
