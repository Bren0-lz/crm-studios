import {
  type Appointment,
  isAppointmentPendingFinalization,
  pendingFinalizationLabel,
} from "@crm/contracts";

/**
 * Selo de atendimento que já terminou e continua agendado/confirmado. `compact` usa o texto
 * curto nos blocos estreitos (Semana, Mês, grade do Dia).
 */
export function PendingFinalizationBadge({
  appointment,
  compact = false,
}: {
  appointment: Pick<Appointment, "status" | "endsAt">;
  compact?: boolean;
}) {
  if (!isAppointmentPendingFinalization(appointment)) return null;
  return (
    <span
      className="pending-finalization-badge"
      title={compact ? pendingFinalizationLabel : undefined}
    >
      {compact ? "A finalizar" : pendingFinalizationLabel}
    </span>
  );
}
