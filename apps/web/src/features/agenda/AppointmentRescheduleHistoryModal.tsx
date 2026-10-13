import type { Appointment, AppointmentRescheduleEvent } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";

export function AppointmentRescheduleHistoryModal({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<AppointmentRescheduleEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api
      .appointmentReschedules(appointment.id)
      .then((data) => {
        if (active) setEvents(data);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appointment.id]);
  return (
    <Modal
      title="Histórico de reagendamentos"
      subtitle={appointment.patientName}
      onClose={onClose}
    >
      {error && <ErrorBanner error={error} />}
      {loading ? (
        <LoadingBlock />
      ) : events.length === 0 ? (
        <EmptyState
          title="Sem reagendamentos"
          copy="O horário deste atendimento ainda não foi alterado."
        />
      ) : (
        <div className="reschedule-history">
          {events.map((event) => (
            <article key={event.id}>
              <small>
                {event.actorName} ·{" "}
                {new Date(event.createdAt).toLocaleString("pt-BR")}
              </small>
              <div>
                <span>
                  {new Date(event.previousStartsAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
                <strong>→</strong>
                <span>
                  {new Date(event.startsAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <p className="report-definition">
                Receitas e despesas pela baixa. A classificação gerencial
                detalhada ainda precisa de conciliação.
              </p>
              <p>
                {event.previousProfessionalName} · {event.previousRoomName}
                {" → "}
                {event.professionalName} · {event.roomName}
              </p>
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}
