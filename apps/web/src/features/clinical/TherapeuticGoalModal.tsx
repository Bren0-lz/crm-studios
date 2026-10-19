import type { TherapeuticGoalInput } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

export function TherapeuticGoalModal({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState<TherapeuticGoalInput>({
    patientId,
    title: "",
    description: "",
    unit: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty(form);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.createTherapeuticGoal(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Novo objetivo terapêutico"
      subtitle="Defina um resultado observável e, quando aplicável, uma meta numérica."
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      {can("clinical.goals_create") && (
        <form className="clinical-form" onSubmit={submit}>
          <label>
            Objetivo
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            Descrição
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <div className="clinical-form-row">
            <label>
              Valor inicial
              <input
                type="number"
                step="any"
                onChange={(e) =>
                  setForm({
                    ...form,
                    baselineValue: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </label>
            <label>
              Valor-alvo
              <input
                type="number"
                step="any"
                onChange={(e) =>
                  setForm({
                    ...form,
                    targetValue: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </label>
            <label>
              Unidade
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </label>
            <label>
              Data-alvo
              <input
                type="date"
                onChange={(e) =>
                  setForm({ ...form, targetDate: e.target.value })
                }
              />
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
            <button className="primary-button" disabled={saving}>
              Salvar objetivo
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
