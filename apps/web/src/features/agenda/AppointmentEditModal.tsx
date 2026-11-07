import type { Appointment, Room, Service } from "@crm/contracts";
import { serviceAvailableFor } from "@crm/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useMissingFields } from "../../shared/components/MissingFields";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { AppointmentPlanField } from "./AppointmentPlanField";

/**
 * Editar atendimento (QM6): serviço, plano, sala e observação. Data, horário e profissional
 * ficam com "Remarcar". Só aparecem serviços do profissional do atendimento e salas
 * do serviço escolhido (QM3).
 */
export function AppointmentEditModal({
  appointment,
  onClose,
  onSaved,
}: {
  appointment: Appointment;
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
}) {
  const [resources, setResources] = useState<{
    services: Service[];
    rooms: Room[];
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [form, setForm] = useState({
    serviceId: appointment.serviceId,
    roomId: appointment.roomId,
    notes: appointment.notes ?? "",
    planId: appointment.planId ?? "",
  });
  const [nested, setNested] = useState(false);
  const choosePlan = useCallback(
    (planId: string) => setForm((current) => ({ ...current, planId })),
    [],
  );
  // Atendimento de cliente fora da experimental sai de um plano (AP4).
  const usesPlan =
    Boolean(appointment.patientId) && appointment.visitType !== "trial";
  const serviceChanged = form.serviceId !== appointment.serviceId;
  // Agendado antes da exigência (sem vínculo): segue sem plano enquanto o serviço não mudar.
  const legacy = usesPlan && !appointment.planId && !serviceChanged;
  const missing = useMissingFields(
    usesPlan && !legacy && !form.planId ? ["Plano"] : [],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty(form);

  useEffect(() => {
    let active = true;
    Promise.all([api.services(), api.rooms()])
      .then(([services, rooms]) => {
        if (active) setResources({ services, rooms });
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar serviços e salas.",
          );
      });
    return () => {
      active = false;
    };
  }, [retry]);

  const services = (resources?.services ?? []).filter(
    (item) =>
      item.id === appointment.serviceId ||
      serviceAvailableFor(item, appointment.professionalId, ""),
  );
  const selectedService = services.find((item) => item.id === form.serviceId);
  const rooms = (resources?.rooms ?? []).filter(
    (item) =>
      !selectedService || serviceAvailableFor(selectedService, "", item.id),
  );

  function chooseService(serviceId: string) {
    const service = services.find((item) => item.id === serviceId);
    setForm((current) => ({
      ...current,
      serviceId,
      // A sala atual pode não atender o novo serviço: vai para a primeira que atende.
      roomId:
        !service ||
        serviceAvailableFor(service, "", current.roomId) ||
        !resources
          ? current.roomId
          : (resources.rooms.find((item) =>
              serviceAvailableFor(service, "", item.id),
            )?.id ?? current.roomId),
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      onSaved(
        await api.updateAppointment(appointment.id, {
          serviceId: form.serviceId,
          roomId: form.roomId,
          notes: form.notes.trim(),
          ...(usesPlan &&
          form.planId &&
          (serviceChanged || form.planId !== (appointment.planId ?? ""))
            ? { planId: form.planId }
            : {}),
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o atendimento.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Editar atendimento"
      subtitle={`${appointment.patientName} · ${appointment.professionalName}. Para mudar data, horário ou profissional, use Remarcar.`}
      busy={saving}
      dirty={dirty}
      inactive={nested}
      onClose={onClose}
    >
      {!resources ? (
        loadError ? (
          <>
            <ErrorBanner error={loadError} />
            <button
              className="secondary-button"
              onClick={() => {
                setLoadError("");
                setRetry((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
          </>
        ) : (
          <LoadingBlock />
        )
      ) : (
        <form className="form-grid" onSubmit={submit}>
          <label>
            Serviço
            <select
              required
              value={form.serviceId}
              disabled={saving}
              onChange={(event) => chooseService(event.target.value)}
            >
              {!selectedService && (
                <option value={appointment.serviceId}>
                  {appointment.serviceName}
                </option>
              )}
              {services.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sala
            <select
              required
              value={form.roomId}
              disabled={saving}
              onChange={(event) =>
                setForm({ ...form, roomId: event.target.value })
              }
            >
              {!rooms.some((item) => item.id === form.roomId) && (
                <option value={form.roomId}>
                  {form.roomId === appointment.roomId
                    ? appointment.roomName
                    : "Selecione"}
                </option>
              )}
              {rooms.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {usesPlan && appointment.patientId && (
            <AppointmentPlanField
              patient={{
                id: appointment.patientId,
                fullName: appointment.patientName,
                tags: [],
              }}
              serviceId={form.serviceId}
              startsAt={appointment.startsAt}
              value={form.planId}
              onChange={choosePlan}
              disabled={saving}
              noneLabel={legacy ? "Sem plano vinculado" : undefined}
              onNestedModalChange={setNested}
            />
          )}
          <label className="span-2">
            Observação
            <textarea
              rows={3}
              maxLength={1000}
              value={form.notes}
              disabled={saving}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
            />
          </label>
          {error && <div className="form-error span-2">{error}</div>}
          {missing.hint}
          <div className="modal-actions span-2">
            <ModalCancelButton disabled={saving}>Voltar</ModalCancelButton>
            <button
              className="primary-button"
              disabled={saving || missing.blocked}
              aria-describedby={missing.describedBy}
            >
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
