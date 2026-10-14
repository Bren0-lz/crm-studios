import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import type {
  AssessmentTemplateInput,
  AssessmentTemplate,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { ClinicalFormBuilder } from "../../shared/components/ClinicalFormBuilder";
import { ClinicalFieldInputs } from "../../shared/components/ClinicalFieldInputs";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
export function AssessmentTemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template?: AssessmentTemplate | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState<AssessmentTemplateInput>(() =>
      template
        ? structuredClone(template)
        : {
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
          },
    ),
    [preview, setPreview] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const [savedForm] = useState(() => JSON.stringify(form));
  async function save(status: "draft" | "published" = "draft") {
    setError("");
    setSaving(true);
    try {
      await api.saveAssessmentTemplate({ ...form, status }, template?.id);
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  const prompt = useUnsavedChangesPrompt({
      section: "Modelo de avaliação",
      dirty: JSON.stringify(form) !== savedForm,
      busy: saving,
      save: () => save(),
      discard: () => {},
    }),
    close = () => prompt.confirmLeave(onClose);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const button = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    try {
      await save(button?.value === "draft" ? "draft" : "published");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <>
      {" "}
      <Modal
        title={
          template ? "Editar modelo de avaliação" : "Novo modelo de avaliação"
        }
        subtitle="Modelos publicados permanecem versionados. Editá-los cria uma versão independente."
        busy={saving || Boolean(prompt.modal)}
        inactive={Boolean(prompt.modal)}
        onClose={close}
      >
        {can("clinical.templates_create") && (
          <form className="clinical-form" onSubmit={submit}>
            {error && <ErrorBanner error={error} />}
            <fieldset className="form-fields" disabled={saving}>
              <div className="form-grid">
                <label>
                  Nome do modelo
                  <input
                    required
                    minLength={3}
                    maxLength={120}
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
                    minLength={2}
                    maxLength={100}
                    value={form.specialty}
                    onChange={(event) =>
                      setForm({ ...form, specialty: event.target.value })
                    }
                  />
                </label>
              </div>
              <ClinicalFormBuilder
                fields={form.fields}
                onChange={(fields) => setForm({ ...form, fields })}
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPreview((value) => !value)}
              >
                Prévia do formulário
              </button>
              {preview && (
                <fieldset disabled>
                  <legend>Prévia</legend>
                  <ClinicalFieldInputs
                    fields={form.fields}
                    values={{}}
                    onChange={() => {}}
                  />
                </fieldset>
              )}
            </fieldset>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={close}
              >
                Cancelar
              </button>
              <button
                className="secondary-button"
                disabled={saving}
                value="draft"
              >
                Salvar rascunho
              </button>
              <button
                className="primary-button"
                disabled={saving}
                value="published"
              >
                Publicar modelo
              </button>
            </div>
          </form>
        )}
      </Modal>
      {prompt.modal}
    </>
  );
}
