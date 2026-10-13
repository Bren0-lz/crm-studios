import type { ClinicalAddendumInput, ClinicalRecord } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { shortDate } from "../../shared/lib/formatting";

export function ClinicalAddendumModal({
  records,
  onClose,
  onSaved,
}: {
  records: ClinicalRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState<ClinicalAddendumInput>({
    clinicalRecordId: records[0]?.id ?? "",
    reason: "",
    content: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.createClinicalAddendum(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Adendo ao prontuário"
      subtitle="O texto original não será alterado. O adendo ficará permanentemente vinculado à evolução."
      busy={loading}
      onClose={onClose}
    >
      {can("clinical.addenda_create") && (
        <form className="clinical-form" onSubmit={submit}>
          <label>
            Evolução finalizada
            <select
              required
              value={form.clinicalRecordId}
              onChange={(event) =>
                setForm({ ...form, clinicalRecordId: event.target.value })
              }
            >
              {records.map((record) => (
                <option key={record.id} value={record.id}>
                  {shortDate.format(new Date(record.appointmentStartsAt))} ·{" "}
                  {record.professionalName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Motivo do adendo
            <input
              required
              minLength={5}
              value={form.reason}
              onChange={(event) =>
                setForm({ ...form, reason: event.target.value })
              }
            />
          </label>
          <label>
            Conteúdo complementar
            <textarea
              required
              minLength={10}
              rows={5}
              value={form.content}
              onChange={(event) =>
                setForm({ ...form, content: event.target.value })
              }
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button className="primary-button" disabled={loading}>
              {loading ? "Salvando…" : "Registrar adendo"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
