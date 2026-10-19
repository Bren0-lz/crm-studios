import {
  appointmentNotStartedMessage,
  isAppointmentStarted,
  type Appointment,
} from "@crm/contracts";
import { CheckCircle2 } from "lucide-react";
import { useAuthorization } from "../../authorization-context";
import { statusLabel, timeLabel } from "../lib/formatting";
import type { ActionMenuItem, DashboardAppointmentAction } from "../lib/types";
import { ActionMenu } from "./ActionMenu";
import { professionalColorStyle } from "../lib/tag-colors";

export function AppointmentRow({
  appointment,
  disabled,
  onAction,
  onStatus,
}: {
  appointment: Appointment;
  disabled: boolean;
  onAction: (kind: DashboardAppointmentAction["kind"]) => void;
  onStatus: (status: "confirmed" | "completed") => void;
}) {
  const { can, canView } = useAuthorization();
  const pending =
    appointment.status === "scheduled" || appointment.status === "confirmed";
  // Realizado só a partir de 15 min antes do início (a API também recusa).
  const started = isAppointmentStarted(appointment);
  const items: ActionMenuItem[] = [
    { label: "Ver detalhes", onSelect: () => onAction("details") },
    ...(appointment.status === "scheduled"
      ? [
          {
            label: "Confirmar atendimento",
            permission: "agenda.attendance" as const,
            onSelect: () => onStatus("confirmed"),
          },
        ]
      : []),
    ...(pending && started
      ? [
          {
            label: "Finalizar atendimento",
            permission: "agenda.attendance" as const,
            onSelect: () => onStatus("completed"),
          },
        ]
      : []),
    ...(pending
      ? [
          {
            label: "Editar atendimento",
            permission: "agenda.reschedule" as const,
            onSelect: () => onAction("edit"),
          },
          {
            label: "Remarcar atendimento",
            permission: "agenda.reschedule" as const,
            onSelect: () => onAction("reschedule"),
          },
          {
            label: "Cancelar atendimento",
            permission: "agenda.cancel" as const,
            danger: true,
            onSelect: () => onAction("cancel"),
          },
        ]
      : []),
    {
      label: "Histórico de reagendamentos",
      onSelect: () => onAction("history"),
    },
  ];
  return (
    <div className="appointment-row">
      <span className="time">
        {timeLabel.format(new Date(appointment.startsAt))}
      </span>
      <span
        className="appointment-line"
        style={professionalColorStyle(appointment.professionalColor)}
      />
      <div className="appointment-copy">
        <strong>{appointment.patientName}</strong>
        <span>
          {appointment.serviceName} · {appointment.professionalName}
        </span>
      </div>
      <span className={`status-pill ${appointment.status}`}>
        {statusLabel(appointment.status)}
      </span>
      <div className="appointment-row-actions">
        {pending && canView("agenda") && can("agenda.attendance") && (
          <button
            type="button"
            className="icon-button appointment-complete-button"
            title={
              started
                ? "Marcar como realizado"
                : appointmentNotStartedMessage(appointment.startsAt)
            }
            aria-label={`Marcar ${appointment.patientName} como realizado`}
            disabled={disabled || !started}
            onClick={() => onStatus("completed")}
          >
            <CheckCircle2 size={18} />
          </button>
        )}
        {canView("agenda") && (
          <ActionMenu
            label={`Ações de ${appointment.patientName}`}
            items={items}
            iconOnly
            align="end"
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
