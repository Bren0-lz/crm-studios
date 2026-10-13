import {
  saoPauloToday,
  type ContactActivityInput,
  type ContactOutcome,
  type ContactSuggestion,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import {
  addDaysToIsoDate,
  contactOutcomeLabels,
  contactReasonLabels,
} from "./model";

export function ContactActivityModal({
  suggestion,
  onClose,
  onSaved,
}: {
  suggestion: ContactSuggestion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuthorization();
  const today = saoPauloToday();
  const [outcome, setOutcome] = useState<ContactOutcome>("contacted");
  const [notes, setNotes] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState(() =>
    addDaysToIsoDate(today, 7),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const trimmedNotes = notes.trim();
      const input: ContactActivityInput = {
        patientId: suggestion.patientId,
        reason: suggestion.reason,
        referenceKey: suggestion.referenceKey,
        outcome,
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
        ...(outcome === "snoozed" ? { snoozeUntil } : {}),
      };
      await api.createContactActivity(input);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setLoading(false);
    }
  }

  return (
    <Modal
      eyebrow={contactReasonLabels[suggestion.reason]}
      title="Registrar contato"
      subtitle={`${suggestion.patientName} · ${suggestion.detail}`}
      busy={loading}
      onClose={onClose}
    >
      {can("relationship.activities_create") && (
        <form className="form-grid" onSubmit={submit}>
          <label className={outcome === "snoozed" ? undefined : "span-2"}>
            Resultado
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as ContactOutcome)}
            >
              {(Object.keys(contactOutcomeLabels) as ContactOutcome[]).map(
                (value) => (
                  <option value={value} key={value}>
                    {contactOutcomeLabels[value]}
                  </option>
                ),
              )}
            </select>
          </label>
          {outcome === "snoozed" && (
            <label>
              Adiar até
              <input
                required
                type="date"
                min={addDaysToIsoDate(today, 1)}
                value={snoozeUntil}
                onChange={(e) => setSnoozeUntil(e.target.value)}
              />
            </label>
          )}
          <label className="span-2">
            Observação
            <textarea
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
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
              {loading ? "Salvando…" : "Salvar contato"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
