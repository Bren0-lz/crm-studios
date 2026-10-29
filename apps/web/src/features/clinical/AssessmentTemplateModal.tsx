import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import type {
  AssessmentTemplateInput,
  AssessmentTemplate,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { AssessmentTemplateFields } from "./AssessmentTemplateFields";
import {
  blankAssessmentTemplate,
  missingTemplateFields,
} from "./assessment-forms";

export function AssessmentTemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template?: AssessmentTemplate | undefined;
  onClose: () => void;
  onSaved: (template: AssessmentTemplate) => void;
}) {
  const { can } = useAuthorization();
  const [form, setForm] = useState<AssessmentTemplateInput>(() =>
      template
        ? {
            name: template.name,
            specialty: template.specialty,
            fields: structuredClone(template.fields),
          }
        : structuredClone(blankAssessmentTemplate),
    ),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const [savedForm] = useState(() => JSON.stringify(form));
  const missing = useMissingFields(missingTemplateFields(form), "field-hint");
  async function save(status: "draft" | "published" = "draft") {
    setError("");
    setSaving(true);
    try {
      onSaved(
        await api.saveAssessmentTemplate({ ...form, status }, template?.id),
      );
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
        subtitle={
          template && template.status !== "draft"
            ? `Publicar cria a versão ${template.version + 1}. As avaliações já registradas continuam com a versão em que foram preenchidas.`
            : "Modelos publicados permanecem versionados. Editá-los cria uma versão independente."
        }
        busy={saving || Boolean(prompt.modal)}
        inactive={Boolean(prompt.modal)}
        onClose={close}
        wide
      >
        {can("clinical.templates_create") && (
          <form className="clinical-form" onSubmit={submit}>
            {error && <ErrorBanner error={error} />}
            <fieldset className="form-fields" disabled={saving}>
              <AssessmentTemplateFields form={form} onChange={setForm} />
            </fieldset>
            {missing.hint}
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
                disabled={saving || missing.blocked}
                aria-describedby={missing.describedBy}
                value="draft"
              >
                Salvar rascunho
              </button>
              <button
                className="primary-button"
                disabled={saving || missing.blocked}
                aria-describedby={missing.describedBy}
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
