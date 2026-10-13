import type { Appointment, Professional, Room } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { AppointmentDateTimePicker } from "../../AppointmentDateTimePicker";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { toLocalDateTimeInput } from "../../shared/lib/formatting";

export function AppointmentRescheduleModal({
  appointment,
  professionals,
  rooms,
  onClose,
  onSaved,
}: {
  appointment: Appointment;
  professionals: Professional[];
  rooms: Room[];
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState({
    professionalId: appointment.professionalId,
    roomId: appointment.roomId,
    startsAt: toLocalDateTimeInput(new Date(appointment.startsAt)),
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onSaved(
        await api.rescheduleAppointment(appointment.id, {
          professionalId: form.professionalId,
          roomId: form.roomId,
          startsAt: new Date(form.startsAt).toISOString(),
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível reagendar.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Reagendar atendimento"
      subtitle={`${appointment.patientName} · ${appointment.serviceName}. Esta alteração afeta somente esta ocorrência.`}
      busy={loading}
      onClose={onClose}
    >
      {can("agenda.reschedule") && (
        <form className="form-grid" onSubmit={submit}>
          <label>
            Profissional
            <select
              required
              value={form.professionalId}
              onChange={(e) =>
                setForm({ ...form, professionalId: e.target.value })
              }
            >
              {professionals.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sala
            <select
              required
              value={form.roomId}
              onChange={(e) => setForm({ ...form, roomId: e.target.value })}
            >
              {rooms.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="span-2">
            <AppointmentDateTimePicker
              value={form.startsAt}
              onChange={(startsAt) =>
                setForm((current) => ({ ...current, startsAt }))
              }
              professionalId={form.professionalId}
              roomId={form.roomId}
              disabled={loading}
              excludeAppointmentId={appointment.id}
              label="Nova data e horário"
            />
          </div>
          {error && <div className="form-error span-2">{error}</div>}
          <div className="modal-actions span-2">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button className="primary-button" disabled={loading}>
              {loading ? "Salvando…" : "Confirmar reagendamento"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
