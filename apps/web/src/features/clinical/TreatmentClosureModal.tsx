import type { TreatmentClosureInput } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";

export function TreatmentClosureModal({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState<TreatmentClosureInput>({
    patientId,
    kind: "discharge",
    summary: "",
    recommendations: "",
    occurredAt: new Date().toISOString(),
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createTreatmentClosure(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Encerramento do tratamento"
      subtitle="O registro é permanente e compõe a linha do tempo clínica."
      busy={saving}
      onClose={onClose}
    >
      {can("clinical.closures_create") && (
        <form className="clinical-form" onSubmit={submit}>
          <label>
            Motivo
            <select
              value={form.kind}
              onChange={(e) =>
                setForm({
                  ...form,
                  kind: e.target.value as TreatmentClosureInput["kind"],
                })
              }
            >
              <option value="discharge">Alta</option>
              <option value="referral">Encaminhamento</option>
              <option value="abandonment">Abandono</option>
            </select>
          </label>
          <label>
            Resumo clínico
            <textarea
              required
              minLength={10}
              rows={5}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </label>
          <label>
            Recomendações
            <textarea
              rows={4}
              value={form.recommendations}
              onChange={(e) =>
                setForm({ ...form, recommendations: e.target.value })
              }
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button className="primary-button" disabled={saving}>
              Registrar encerramento
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
