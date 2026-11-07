import type { Appointment, Professional, Room, Service } from "@crm/contracts";
import { serviceAvailableFor } from "@crm/contracts";
import { useCallback, useState, type FormEvent } from "react";
import { api } from "../../api";
import { AppointmentDateTimePicker } from "../../AppointmentDateTimePicker";
import { useAuthorization } from "../../authorization-context";
import {
  isCompleteDateTime,
  useMissingFields,
} from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { toLocalDateTimeInput } from "../../shared/lib/formatting";
import { AppointmentPlanField } from "./AppointmentPlanField";

const absenceStatuses = ["no_show", "excused_absence", "professional_absence"];

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
    planId: appointment.planId ?? "",
  });
  const [nested, setNested] = useState(false);
  const choosePlan = useCallback(
    (planId: string) => setForm((current) => ({ ...current, planId })),
    [],
  );
  const absence = absenceStatuses.includes(appointment.status);
  // Atendimento de cliente fora da experimental sai de um plano (AP4). Remarcar o agendado
  // antes da exigência (sem vínculo) não pede plano; a reposição de ausência pede.
  const usesPlan =
    Boolean(appointment.patientId) && appointment.visitType !== "trial";
  const legacy = usesPlan && !appointment.planId && !absence;
  const newStartsAt = isCompleteDateTime(form.startsAt)
    ? new Date(form.startsAt).toISOString()
    : undefined;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dirty = useFormDirty(form);
  const missing = useMissingFields(
    [
      !form.professionalId && "Profissional",
      !form.roomId && "Sala",
      !isCompleteDateTime(form.startsAt) && "Nova data e horário",
      usesPlan && !legacy && !form.planId && "Plano",
    ].filter((item): item is string => Boolean(item)),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onSaved(
        await (
          absence ? api.createAbsenceSuccessor : api.rescheduleAppointment
        )(appointment.id, {
          professionalId: form.professionalId,
          roomId: form.roomId,
          startsAt: new Date(form.startsAt).toISOString(),
          ...(usesPlan && form.planId ? { planId: form.planId } : {}),
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
        absence
          ? `${appointment.patientName} · ${appointment.serviceName}. Será criado outro atendimento, preservando esta ausência.`
          : `${appointment.patientName} · ${appointment.serviceName}. Esta alteração afeta somente esta ocorrência.`
      }
      busy={loading}
      dirty={dirty}
      inactive={nested}
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
          {usesPlan && appointment.patientId && (
            <AppointmentPlanField
              patient={{
                id: appointment.patientId,
                fullName: appointment.patientName,
                tags: [],
              }}
              serviceId={appointment.serviceId}
              startsAt={newStartsAt}
              value={form.planId}
              onChange={choosePlan}
              disabled={loading}
              noneLabel={legacy ? "Sem plano vinculado" : undefined}
              onNestedModalChange={setNested}
            />
          )}
          {error && <div className="form-error span-2">{error}</div>}
          {missing.hint}
          <div className="modal-actions span-2">
            <ModalCancelButton disabled={loading}>Cancelar</ModalCancelButton>
            <button
              className="primary-button"
              disabled={loading || missing.blocked}
              aria-describedby={missing.describedBy}
            >
              {loading ? "Salvando…" : "Confirmar reagendamento"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
