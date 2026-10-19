import type { Appointment, Professional, Room, Service } from "@crm/contracts";
import { serviceAvailableFor } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { AppointmentDateTimePicker } from "../../AppointmentDateTimePicker";
import { useAuthorization } from "../../authorization-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { toLocalDateTimeInput } from "../../shared/lib/formatting";

export function AppointmentRescheduleModal({
  appointment,
  service,
  professionals: allProfessionals,
  rooms: allRooms,
  onClose,
  onSaved,
}: {
  appointment: Appointment;
  /** Serviço do atendimento: só profissionais e salas que o atendem (QM3). */
  service: Service | undefined;
  professionals: Professional[];
  rooms: Room[];
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
}) {
  const { can } = useAuthorization();
  const professionals = service
    ? allProfessionals.filter((item) =>
        serviceAvailableFor(service, item.id, ""),
      )
    : allProfessionals;
  const rooms = service
    ? allRooms.filter((item) => serviceAvailableFor(service, "", item.id))
    : allRooms;
  const [form, setForm] = useState({
    professionalId:
      professionals.some((item) => item.id === appointment.professionalId) ||
      !professionals[0]
        ? appointment.professionalId
        : professionals[0].id,
    roomId:
      rooms.some((item) => item.id === appointment.roomId) || !rooms[0]
        ? appointment.roomId
        : rooms[0].id,
    startsAt: toLocalDateTimeInput(new Date(appointment.startsAt)),
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dirty = useFormDirty(form);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onSaved(
        await (
          ["no_show", "excused_absence", "professional_absence"].includes(
            appointment.status,
          )
            ? api.createAbsenceSuccessor
            : api.rescheduleAppointment
        )(appointment.id, {
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
      subtitle={
        ["no_show", "excused_absence", "professional_absence"].includes(
          appointment.status,
        )
          ? `${appointment.patientName} · ${appointment.serviceName}. Será criado outro atendimento, preservando esta ausência.`
          : `${appointment.patientName} · ${appointment.serviceName}. Esta alteração afeta somente esta ocorrência.`
      }
      busy={loading}
      dirty={dirty}
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
            <ModalCancelButton disabled={loading}>Cancelar</ModalCancelButton>
            <button className="primary-button" disabled={loading}>
              {loading ? "Salvando…" : "Confirmar reagendamento"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
