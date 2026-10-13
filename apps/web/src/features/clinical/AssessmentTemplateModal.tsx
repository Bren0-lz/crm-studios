import type { AssessmentTemplateInput } from "@crm/contracts";
import { Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";

export function AssessmentTemplateModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState<AssessmentTemplateInput>({
    name: "",
    specialty: "Fisioterapia",
    fields: [
      {
        key: "campo_1",
        label: "",
        type: "text",
        required: false,
        unit: "",
      },
    ],
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.createAssessmentTemplate(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }

  function updateField(
    index: number,
    patch: Partial<AssessmentTemplateInput["fields"][number]>,
  ) {
    setForm({
      ...form,
      fields: form.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    });
  }

  return (
    <Modal
      title="Novo modelo de avaliação"
      subtitle="Monte campos estruturados para uma especialidade. Modelos usados permanecem versionados."
      busy={saving}
      onClose={onClose}
    >
      {can("clinical.templates_create") && (
        <form className="clinical-form" onSubmit={submit}>
          <div className="clinical-form-row">
            <label>
              Nome do modelo
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <label>
              Especialidade
              <input
                required
                value={form.specialty}
                onChange={(event) =>
                  setForm({ ...form, specialty: event.target.value })
                }
              />
            </label>
          </div>
          <div className="assessment-field-builder">
            {form.fields.map((field, index) => (
              <div key={index}>
                <label>
                  Chave técnica
                  <input
                    required
                    pattern="[a-z][a-z0-9_]*"
                    value={field.key}
                    onChange={(event) =>
                      updateField(index, { key: event.target.value })
                    }
                  />
                </label>
                <label>
                  Rótulo
                  <input
                    required
                    value={field.label}
                    onChange={(event) =>
                      updateField(index, { label: event.target.value })
                    }
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={field.type}
                    onChange={(event) =>
                      updateField(index, {
                        type: event.target.value as typeof field.type,
                      })
                    }
                  >
                    <option value="text">Texto</option>
                    <option value="number">Número</option>
                    <option value="scale">Escala</option>
                    <option value="boolean">Sim/Não</option>
                  </select>
                </label>
                <label>
                  Unidade
                  <input
                    value={field.unit}
                    onChange={(event) =>
                      updateField(index, { unit: event.target.value })
                    }
                  />
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) =>
                      updateField(index, { required: event.target.checked })
                    }
                  />
                  Obrigatório
                </label>
                {form.fields.length > 1 && (
                  <button
                    type="button"
                    className="icon-button"
                    title="Remover campo"
                    onClick={() =>
                      setForm({
                        ...form,
                        fields: form.fields.filter(
                          (_, fieldIndex) => fieldIndex !== index,
                        ),
                      })
                    }
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setForm({
                  ...form,
                  fields: [
                    ...form.fields,
                    {
                      key: `campo_${form.fields.length + 1}`,
                      label: "",
                      type: "text",
                      required: false,
                      unit: "",
                    },
                  ],
                })
              }
            >
              <Plus size={15} /> Adicionar campo
            </button>
          </div>
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
              Salvar modelo
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
