import type {
  ClinicalMeasurementInput,
  ClinicalWorkspace,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { toLocalDateTimeInput } from "../../shared/lib/formatting";

export function ClinicalMeasurementModal({
  patientId,
  goals,
  onClose,
  onSaved,
}: {
  patientId: string;
  goals: ClinicalWorkspace["goals"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState<ClinicalMeasurementInput>({
    patientId,
    goalId: goals[0]?.id ?? "",
    name: "",
    value: 0,
    unit: "",
    measuredAt: new Date().toISOString(),
    notes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createClinicalMeasurement(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Nova medição clínica"
      subtitle="Registre medidas comparáveis para acompanhar a evolução ao longo do tempo."
      busy={saving}
      onClose={onClose}
    >
      {can("clinical.measurements_create") && (
        <form className="clinical-form" onSubmit={submit}>
          <label>
            Objetivo relacionado
            <select
              value={form.goalId}
              onChange={(e) => setForm({ ...form, goalId: e.target.value })}
            >
              <option value="">Sem objetivo específico</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </label>
          <div className="clinical-form-row">
            <label>
              Medida
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Valor
              <input
                required
                type="number"
                step="any"
                value={form.value}
                onChange={(e) =>
                  setForm({ ...form, value: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Unidade
              <input
                required
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </label>
            <label>
              Data e hora
              <input
                required
                type="datetime-local"
                value={toLocalDateTimeInput(new Date(form.measuredAt))}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setForm({
                    ...form,
                    measuredAt: new Date(e.target.value).toISOString(),
                  });
                }}
              />
            </label>
          </div>
          <label>
            Observações
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
              Registrar medição
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
