import {
  appointmentNotStartedMessage,
  isAppointmentStarted,
  type Appointment,
  type AppointmentStatus,
} from "@crm/contracts";
import { MoreHorizontal } from "lucide-react";
import { useAuthorization } from "../../authorization-context";
import { VisitTypeBadge } from "../../shared/components/VisitTypeBadge";
import { timeLabel } from "../../shared/lib/formatting";
import { appointmentStatusClass } from "./model";
import { PendingFinalizationBadge } from "./PendingFinalizationBadge";
import { professionalColorStyle } from "../../tag-colors";

export function AgendaCard({
  appointment,
  onOpen,
  onStatus,
  onHistory,
  highlighted = false,
}: {
  appointment: Appointment;
  /** Recém-salvo: realce temporário (a agenda tira depois de 2 s). */
  highlighted?: boolean;
  onOpen: () => void;
  /** Sem `onStatus` (agenda só de consulta) o status fica desabilitado. */
  onStatus?: ((status: AppointmentStatus) => void) | undefined;
  onHistory: () => void;
}) {
  const { can } = useAuthorization();
  // Finalizado/falta só a partir de 15 min antes do início (a API também recusa).
  const availability = isAppointmentStarted(appointment)
    ? undefined
    : appointmentNotStartedMessage(appointment.startsAt);
  return (
    <article
      className={`agenda-card ${appointmentStatusClass(appointment.status)}${highlighted ? " agenda-just-saved" : ""}`}
      style={professionalColorStyle(appointment.professionalColor)}
      role="button"
      tabIndex={0}
      aria-label={`Detalhes de ${appointment.patientName}`}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, select")) onOpen();
      }}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="agenda-time">
        <strong>{timeLabel.format(new Date(appointment.startsAt))}</strong>
        <span>{timeLabel.format(new Date(appointment.endsAt))}</span>
      </div>
      <div className="agenda-main">
        <div>
          <span className="service-name">
            <i className="pro-dot" aria-hidden="true" />
            {appointment.serviceName}
          </span>
          <h3>{appointment.patientName}</h3>
          <p>
            {appointment.professionalName} · {appointment.roomName}
          </p>
          <VisitTypeBadge appointment={appointment} />
          <PendingFinalizationBadge appointment={appointment} />
        </div>
        <div className="agenda-actions">
          <select
            className={`agenda-status-select agenda-status-${appointment.status}`}
            value={appointment.status}
            onChange={(event) =>
              onStatus?.(event.target.value as AppointmentStatus)
            }
            disabled={!onStatus}
            title={
              onStatus ? undefined : "Seu acesso à Agenda é só de consulta."
            }
            aria-label="Status do atendimento"
          >
            {(appointment.status === "scheduled" ||
              can("agenda.attendance")) && (
              <option value="scheduled">Agendado</option>
            )}
            {(appointment.status === "confirmed" ||
              can("agenda.attendance")) && (
              <option value="confirmed">Confirmado</option>
            )}
            {(appointment.status === "completed" ||
              can("agenda.attendance")) && (
              <option
                value="completed"
                disabled={Boolean(availability)}
                title={availability}
              >
                Finalizado
              </option>
            )}
            {(appointment.status === "no_show" || can("agenda.attendance")) && (
              <option
                value="no_show"
                disabled={Boolean(availability)}
                title={availability}
              >
                Não compareceu
              </option>
            )}
            {(appointment.status === "excused_absence" ||
              can("agenda.attendance")) && (
              <option value="excused_absence">Ausência justificada</option>
            )}
            {(appointment.status === "professional_absence" ||
              can("agenda.attendance")) && (
              <option value="professional_absence">
                Ausência profissional
              </option>
            )}
            {(appointment.status === "cancelled" || can("agenda.cancel")) && (
              <option value="cancelled">Cancelado</option>
            )}
          </select>
          <button
            className="icon-button button-sm"
            aria-label={`Histórico de ${appointment.patientName}`}
            title="Histórico de reagendamentos"
            onClick={onHistory}
          >
            <MoreHorizontal size={19} />
          </button>
        </div>
      </div>
    </article>
  );
}
