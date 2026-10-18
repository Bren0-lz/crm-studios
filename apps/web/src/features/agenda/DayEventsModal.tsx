import type { Appointment, GroupSession, ScheduleBlock } from "@crm/contracts";
import { Modal } from "../../shared/components/Modal";
import { VisitTypeBadge } from "../../shared/components/VisitTypeBadge";
import { statusLabel, timeLabel } from "../../shared/lib/formatting";
import { professionalColorStyle } from "../../tag-colors";
import { sortAgendaEntries } from "./model";

export function DayEventsModal({
  day,
  holidayName,
  appointments,
  groupSessions,
  blocks,
  onClose,
  onOpenAppointment,
  onOpenDay,
}: {
  day: Date;
  holidayName: string | undefined;
  appointments: Appointment[];
  groupSessions: GroupSession[];
  blocks: ScheduleBlock[];
  onClose: () => void;
  onOpenAppointment: (id: string) => void;
  onOpenDay: () => void;
}) {
  const events = sortAgendaEntries({ appointments, groupSessions, blocks }).map(
    (entry) =>
      entry.kind === "appointment"
        ? {
            kind: entry.kind,
            id: entry.appointment.id,
            startsAt: entry.startsAt,
            endsAt: entry.appointment.endsAt,
            title: entry.appointment.patientName,
            detail: `${entry.appointment.serviceName} · ${entry.appointment.professionalName} · ${statusLabel(entry.appointment.status)}`,
            color: entry.appointment.professionalColor,
            appointment: entry.appointment,
          }
        : entry.kind === "group"
          ? {
              kind: entry.kind,
              id: entry.session.id,
              startsAt: entry.startsAt,
              endsAt: entry.session.endsAt,
              title: entry.session.groupName,
              detail: `${entry.session.professionalName} · ${entry.session.roomName}`,
              color: undefined,
              appointment: undefined,
            }
          : {
              kind: entry.kind,
              id: entry.block.id,
              startsAt: entry.startsAt,
              endsAt: entry.block.endsAt,
              title: entry.block.reason,
              detail: `Bloqueio · ${[entry.block.professionalName, entry.block.roomName].filter(Boolean).join(" · ")}`,
              color: undefined,
              appointment: undefined,
            },
  );
  const count = events.filter(
    (event) => event.appointment?.status !== "cancelled",
  ).length;
  return (
    <Modal
      eyebrow="Agenda do dia"
      title={day.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}
      subtitle={
        count === 0
          ? "Nenhum evento neste dia."
          : `${count} ${count === 1 ? "evento" : "eventos"} neste dia.`
      }
      onClose={onClose}
    >
      <div className="day-events">
        {holidayName && (
          <p className="holiday-notice">Feriado: {holidayName}</p>
        )}
        {count > 0 && (
          <ul className="day-events-list">
            {events.map((event) => {
              const content = (
                <>
                  <time>
                    {timeLabel.format(new Date(event.startsAt))}–
                    {timeLabel.format(new Date(event.endsAt))}
                  </time>
                  <span>
                    <strong>
                      {event.color && (
                        <i
                          className="pro-dot"
                          style={professionalColorStyle(event.color)}
                          aria-hidden="true"
                        />
                      )}
                      {event.title}
                    </strong>
                    <small>{event.detail}</small>
                    {event.appointment && (
                      <VisitTypeBadge appointment={event.appointment} />
                    )}
                  </span>
                </>
              );
              return (
                <li key={`${event.kind}-${event.id}`}>
                  {event.kind === "appointment" ? (
                    <button
                      type="button"
                      className={`day-event appointment ${event.appointment?.status === "cancelled" ? "is-cancelled" : ""}`}
                      onClick={() => onOpenAppointment(event.id)}
                      aria-label={`Detalhes de ${event.title}`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className={`day-event ${event.kind}`}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onOpenDay}
          >
            Abrir dia na agenda
          </button>
        </div>
      </div>
    </Modal>
  );
}
