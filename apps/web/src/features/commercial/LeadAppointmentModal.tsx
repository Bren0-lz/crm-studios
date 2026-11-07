import type {
  Appointment,
  Lead,
  Professional,
  Room,
  Service,
} from "@crm/contracts";
import { serviceAvailableFor } from "@crm/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { AppointmentDateTimePicker } from "../../AppointmentDateTimePicker";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import {
  isCompleteDateTime,
  useMissingFields,
} from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { toLocalDateTimeInput } from "../../shared/lib/formatting";

type ScheduleOptions = {
  services: Service[];
  professionals: Professional[];
  rooms: Room[];
};

/** Profissionais e salas que atendem o serviço escolhido (vínculos do serviço; vazio = todos). */
function resourcesFor(options: ScheduleOptions, serviceId: string) {
  const service = options.services.find((item) => item.id === serviceId);
  return {
    professionals: service
      ? options.professionals.filter((item) =>
          serviceAvailableFor(service, item.id, ""),
        )
      : options.professionals,
    rooms: service
      ? options.rooms.filter((item) =>
          serviceAvailableFor(service, "", item.id),
        )
      : options.rooms,
  };
}

/** Troca profissional/sala que não atendem o serviço pelo primeiro que atende. */
function keepResources<
  T extends { serviceId: string; professionalId: string; roomId: string },
>(options: ScheduleOptions, form: T): T {
  const { professionals, rooms } = resourcesFor(options, form.serviceId);
  return {
    ...form,
    professionalId: professionals.some(
      (item) => item.id === form.professionalId,
    )
      ? form.professionalId
      : (professionals[0]?.id ?? ""),
    roomId: rooms.some((item) => item.id === form.roomId)
      ? form.roomId
      : (rooms[0]?.id ?? ""),
  };
}

export function LeadAppointmentModal({
  lead,
  onClose,
  onCreated,
}: {
  lead: Lead;
  onClose: () => void;
  onCreated: (appointment: Appointment) => void;
}) {
  const { can } = useAuthorization();
  const initialTime = new Date();
  initialTime.setDate(initialTime.getDate() + 1);
  initialTime.setHours(9, 0, 0, 0);
  const [options, setOptions] = useState<ScheduleOptions | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({
    serviceId: "",
    professionalId: "",
    roomId: "",
    startsAt: toLocalDateTimeInput(initialTime),
    notes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty(form, options !== null);
  const missing = useMissingFields(
    [
      !form.serviceId && "Serviço",
      !form.professionalId && "Profissional",
      !form.roomId && "Sala",
      !isCompleteDateTime(form.startsAt) && "Data e horário",
    ].filter((item): item is string => Boolean(item)),
  );
  useEffect(() => {
    let active = true;
    Promise.all([api.services(), api.professionals(), api.rooms()])
      .then(([services, professionals, rooms]) => {
        if (!active) return;
        setOptions({ services, professionals, rooms });
        setForm((current) =>
          keepResources(
            { services, professionals, rooms },
            {
              ...current,
              serviceId: current.serviceId || (services[0]?.id ?? ""),
            },
          ),
        );
      })
      .catch((cause: Error) => {
        if (active) setLoadError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      onCreated(
        await api.createLeadAppointment(lead.id, {
          professionalId: form.professionalId,
          roomId: form.roomId,
          serviceId: form.serviceId,
          startsAt: new Date(form.startsAt).toISOString(),
          notes: form.notes,
          visitType: "trial",
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível agendar.",
      );
      setSaving(false);
    }
  }
  const resources = options
    ? resourcesFor(options, form.serviceId)
    : { professionals: [], rooms: [] };
  const missingOptions =
    options !== null &&
    (options.services.length === 0 ||
      options.professionals.length === 0 ||
      options.rooms.length === 0);
  return (
    <Modal
      eyebrow="Lead"
      title="Agendar experimental"
      subtitle={`${lead.fullName} · o atendimento entra na agenda sem criar cadastro de cliente.`}
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      {loadError ? (
        <ErrorBanner error={loadError} />
      ) : options === null ? (
        <LoadingBlock />
      ) : missingOptions ? (
        <EmptyState
          title="Agenda incompleta"
          copy="Cadastre serviço, profissional e sala antes de agendar a experimental."
        />
      ) : (
        can("crm.appointments_create", "agenda.create") && (
          <form className="form-grid" onSubmit={(event) => void submit(event)}>
            <p className="field-hint span-2">
              Lead agenda só aula experimental. Para avaliação ou atendimento
              com plano, converta o lead em cliente.
            </p>
            <label>
              Serviço
              <select
                required
                value={form.serviceId}
                onChange={(e) =>
                  setForm(
                    keepResources(options, {
                      ...form,
                      serviceId: e.target.value,
                    }),
                  )
                }
              >
                {options.services.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Profissional
              <select
                required
                value={form.professionalId}
                onChange={(e) =>
                  setForm({ ...form, professionalId: e.target.value })
                }
              >
                {resources.professionals.map((item) => (
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
                {resources.rooms.map((item) => (
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
                disabled={saving}
              />
            </div>
            <label className="span-2">
              Observação
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            {error && <div className="form-error span-2">{error}</div>}
            {missing.hint}
            <div className="modal-actions span-2">
              <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
              <button
                className="primary-button"
                disabled={saving || missing.blocked}
                aria-describedby={missing.describedBy}
              >
                {saving ? "Agendando…" : "Confirmar agendamento"}
              </button>
            </div>
          </form>
        )
      )}
    </Modal>
  );
}
