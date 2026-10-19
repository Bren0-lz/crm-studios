import type { Appointment, AppointmentStatus } from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
export function AppointmentAbsenceModal({
  appointment,
  status,
  onClose,
  onConfirm,
}: {
  appointment: Appointment;
  status: AppointmentStatus;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(appointment.absenceReason ?? "");
  const dirty = useFormDirty(reason);
  // Na falta do cliente o motivo é opcional; nas ausências justificadas, obrigatório.
  const optional = status === "no_show";
  return (
    <ActionModal
      eyebrow="Agenda"
      title="Registrar ausência"
      subtitle={`${appointment.patientName} · ${appointment.serviceName}`}
      effect={
        status === "professional_absence"
          ? "Registre a indisponibilidade do profissional. A remarcação preservará este atendimento de origem."
          : "A falta não consome sessão. Uma correção de presença restitui o débito original."
      }
      confirmLabel="Registrar ausência"
      validate={() =>
        reason.trim().length >= 2 || (optional && reason.trim().length === 0)
          ? ""
          : "Informe o motivo da ausência."
      }
      dirty={dirty}
      onClose={onClose}
      onConfirm={() => onConfirm(reason.trim())}
    >
      <label>
        {optional ? "Motivo da ausência (opcional)" : "Motivo da ausência"}
        <textarea
          required={!optional}
          minLength={2}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
