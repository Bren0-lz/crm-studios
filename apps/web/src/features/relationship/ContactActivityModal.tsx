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

/** Registra o mesmo resultado para todos os motivos sugeridos do cliente. */
export function ContactActivityModal({
  suggestions,
  onClose,
  onSaved,
}: {
  suggestions: ContactSuggestion[];
  onClose: () => void;
  onSaved: (saved: ContactSuggestion[]) => void;
}) {
  const suggestion = suggestions[0]!;
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
    const saved: ContactSuggestion[] = [];
    try {
      const trimmedNotes = notes.trim();
      for (const item of suggestions) {
        const input: ContactActivityInput = {
          patientId: item.patientId,
          reason: item.reason,
          referenceKey: item.referenceKey,
          outcome,
          ...(trimmedNotes ? { notes: trimmedNotes } : {}),
          ...(outcome === "snoozed" ? { snoozeUntil } : {}),
        };
        await api.createContactActivity(input);
        saved.push(item);
      }
      onSaved(saved);
    } catch (cause) {
      setError(
        saved.length
          ? `${(cause as Error).message} (${saved.length} de ${suggestions.length} motivos já registrados.)`
          : (cause as Error).message,
      );
      setLoading(false);
    }
  }

  return (
    <Modal
      eyebrow={suggestions
        .map((item) => contactReasonLabels[item.reason])
        .join(" · ")}
      title="Registrar contato"
      subtitle={
        suggestions.length === 1
          ? `${suggestion.patientName} · ${suggestion.detail}`
          : `${suggestion.patientName} · vale para os ${suggestions.length} motivos`
      }
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
