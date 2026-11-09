import {
  eventInputSchema,
  EVENT_NAME_MAX,
  EVENT_LOCATION_MAX,
  EVENT_NOTES_MAX,
  EVENT_ATTENDEES_MAX,
  type Branch,
  type CommercialEvent,
  type Service,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { eventDateTime, eventStartsAt } from "./model";

export function EventModal({
  event,
  branches,
  services,
  timezone,
  onClose,
  onSaved,
}: {
  event?: CommercialEvent | undefined;
  branches: Branch[];
  services: Service[];
  timezone: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    name: event?.name ?? "",
    location: event?.location ?? "",
    attendeeCount: event?.attendeeCount?.toString() ?? "",
    startsAt: event ? eventDateTime(event.startsAt, timezone) : "",
    notes: event?.notes ?? "",
    branchId: event?.branchId ?? "",
    serviceId: event?.serviceId ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = useFormDirty(draft);
  function update(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError("");
    try {
      const parsed = eventInputSchema.safeParse({
        ...draft,
        attendeeCount:
          draft.attendeeCount === "" ? undefined : Number(draft.attendeeCount),
        startsAt: eventStartsAt(draft.startsAt, timezone),
      });
      if (!parsed.success) {
        setError(
          parsed.error.issues[0]?.message ?? "Revise os dados do evento.",
        );
        return;
      }
      const input = parsed.data;
      setSaving(true);
      if (event) await api.updateEvent(event.id, input);
      else await api.createEvent(input);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o evento.",
      );
    } finally {
      setSaving(false);
    }
  }
  // A filial vinculada pode ter sido desativada; preservá-la na edição evita mover o evento.
  const currentBranchAvailable =
    !draft.branchId || branches.some((branch) => branch.id === draft.branchId);
  // Serviços ativos; o já vinculado continua na lista mesmo se foi desativado.
  const serviceOptions = services.filter(
    (service) => service.active || service.id === draft.serviceId,
  );
  const currentServiceListed =
    !draft.serviceId ||
    serviceOptions.some((service) => service.id === draft.serviceId);
  return (
    <Modal
      title={event ? "Editar evento" : "Novo evento"}
      subtitle="Informe os dados do evento comercial."
      onClose={onClose}
      busy={saving}
      dirty={dirty}
    >
      <form className="form-grid" onSubmit={(e) => void submit(e)}>
        <label className="span-2">
          Nome do evento
          <input
            required
            minLength={2}
            maxLength={EVENT_NAME_MAX}
            value={draft.name}
            disabled={saving}
            onChange={(e) => update("name", e.target.value)}
          />
        </label>
        <label>
          Data e horário
          <input
            type="datetime-local"
            required
            value={draft.startsAt}
            disabled={saving}
            onChange={(e) => update("startsAt", e.target.value)}
          />
          <small className="field-hint">Fuso da clínica: {timezone}</small>
        </label>
        <label>
          Unidade
          <select
            value={draft.branchId}
            disabled={saving}
            onChange={(e) => update("branchId", e.target.value)}
          >
            <option value="">Toda a rede</option>
            {!currentBranchAvailable && (
              <option value={draft.branchId}>
                Unidade vinculada (indisponível)
              </option>
            )}
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Serviço
          <select
            value={draft.serviceId}
            disabled={saving}
            onChange={(e) => update("serviceId", e.target.value)}
          >
            <option value="">Sem serviço</option>
            {!currentServiceListed && (
              <option value={draft.serviceId}>
                {event?.serviceName ?? "Serviço vinculado"}
              </option>
            )}
            {serviceOptions.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
                {service.active ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Local ou cidade
          <input
            maxLength={EVENT_LOCATION_MAX}
            value={draft.location}
            disabled={saving}
            onChange={(e) => update("location", e.target.value)}
          />
        </label>
        <label>
          Público estimado
          <input
            type="number"
            min={0}
            max={EVENT_ATTENDEES_MAX}
            step={1}
            value={draft.attendeeCount}
            disabled={saving}
            onChange={(e) => update("attendeeCount", e.target.value)}
          />
        </label>
        <label className="span-2">
          Observações
          <textarea
            maxLength={EVENT_NOTES_MAX}
            rows={5}
            value={draft.notes}
            disabled={saving}
            onChange={(e) => update("notes", e.target.value)}
          />
          <small className="field-hint">
            {draft.notes.length}/{EVENT_NOTES_MAX} caracteres
          </small>
        </label>
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
          <button className="primary-button" disabled={saving}>
            {saving ? "Salvando…" : "Salvar evento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
