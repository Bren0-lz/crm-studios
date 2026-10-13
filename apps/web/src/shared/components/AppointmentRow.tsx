import type { Appointment } from "@crm/contracts";
import { useAuthorization } from "../../authorization-context";
import { statusLabel, timeLabel } from "../lib/formatting";
import type { ActionMenuItem, DashboardAppointmentAction } from "../lib/types";
import { ActionMenu } from "./ActionMenu";

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
  const { canView } = useAuthorization();
  const pending =
    appointment.status === "scheduled" || appointment.status === "confirmed";
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
    ...(pending
      ? [
          {
            label: "Finalizar atendimento",
            permission: "agenda.attendance" as const,
            onSelect: () => onStatus("completed"),
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
        style={{ backgroundColor: appointment.professionalColor }}
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
  );
}
