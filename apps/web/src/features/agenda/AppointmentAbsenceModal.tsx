import type { Appointment, AppointmentStatus } from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
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
        reason.trim().length >= 2 ? "" : "Informe o motivo da ausência."
      }
      onClose={onClose}
      onConfirm={() => onConfirm(reason.trim())}
    >
      <label>
        Motivo da ausência
        <textarea
          required
          minLength={2}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
