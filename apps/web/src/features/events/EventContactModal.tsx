import {
  LEAD_NOTES_MAX,
  inferLeadContactChannel,
  leadContactChannelLabels,
  type EventParticipant,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { EventConvertModal } from "./EventConvertModal";
import { eventDateTime, eventStartsAt } from "./model";

const channels = [
  leadContactChannelLabels.phone,
  leadContactChannelLabels.whatsapp,
  leadContactChannelLabels.email,
  leadContactChannelLabels.in_person,
];

/** Registro de contato do participante (grava em `lead_contacts`). */
export function EventContactModal({
  participant,
  timezone,
  canConvert = false,
  onClose,
  onSaved,
  onConverted,
}: {
  participant: EventParticipant;
  timezone: string;
  /** Mostra "Se tornou cliente" (cadastro de cliente na frente deste modal). */
  canConvert?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onConverted?: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    reached: "yes" as "yes" | "no",
    channel: leadContactChannelLabels.phone,
    occurredAt: eventDateTime(new Date().toISOString(), timezone),
    notes: "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState(
    Boolean(participant.convertedPatientId),
  );
  const dirty = useFormDirty(draft);
  const missing = useMissingFields(
    [
      !draft.occurredAt && "Data e hora",
      draft.notes.trim().length < 2 && "Observação (pelo menos 2 caracteres)",
    ].filter((item): item is string => Boolean(item)),
  );
  function update<K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError("");
    try {
      const occurredAt = eventStartsAt(draft.occurredAt, timezone);
      setSaving(true);
      await api.createLeadContact(participant.id, {
        channel: inferLeadContactChannel(draft.channel),
        contactMethod: draft.channel,
        direction: "outbound",
        notes: draft.notes,
        occurredAt,
        reached: draft.reached === "yes",
      });
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível registrar o contato.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Modal
        title="Registrar contato"
        subtitle={participant.fullName}
        onClose={onClose}
        busy={saving}
        dirty={dirty}
      >
        <form className="form-grid" onSubmit={(e) => void submit(e)}>
          <label>
            Contato feito?
            <select
              value={draft.reached}
              disabled={saving}
              onChange={(e) =>
                update("reached", e.target.value as "yes" | "no")
              }
            >
              <option value="yes">Sim</option>
              <option value="no">Não (tentativa sem resposta)</option>
            </select>
          </label>
          <label>
            Canal
            <select
              value={draft.channel}
              disabled={saving}
              onChange={(e) => update("channel", e.target.value)}
            >
              {channels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            Data e hora
            <input
              type="datetime-local"
              required
              value={draft.occurredAt}
              disabled={saving}
              onChange={(e) => update("occurredAt", e.target.value)}
            />
            <small className="field-hint">Fuso da clínica: {timezone}</small>
          </label>
          <label className="span-2">
            Observação
            <textarea
              required
              minLength={2}
              maxLength={LEAD_NOTES_MAX}
              rows={6}
              value={draft.notes}
              disabled={saving}
              onChange={(e) => update("notes", e.target.value)}
            />
            <small className="field-hint">
              {draft.notes.length}/{LEAD_NOTES_MAX} caracteres
            </small>
          </label>
          {error && (
            <div className="form-error span-2" role="alert">
              {error}
            </div>
          )}
          {missing.hint}
          <div className="modal-actions span-2">
            {converted ? (
              <span className="status-pill completed">Cliente</span>
            ) : (
              canConvert && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => setConverting(true)}
                >
                  Se tornou cliente
                </button>
              )
            )}
            <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
            <button
              className="primary-button"
              disabled={saving || missing.blocked}
              aria-describedby={missing.describedBy}
            >
              {saving ? "Salvando…" : "Salvar contato"}
            </button>
          </div>
        </form>
      </Modal>
      {converting && (
        <EventConvertModal
          participant={participant}
          onClose={() => setConverting(false)}
          onConverted={() => {
            setConverting(false);
            setConverted(true);
            onConverted?.();
          }}
        />
      )}
    </>
  );
}
