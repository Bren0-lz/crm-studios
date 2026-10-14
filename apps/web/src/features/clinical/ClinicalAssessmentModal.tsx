import { ClinicalFieldInputs } from "../../shared/components/ClinicalFieldInputs";
import type {
  AssessmentTemplate,
  ClinicalAssessmentInput,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";

export function ClinicalAssessmentModal({
  patientId,
  templates: allTemplates,
  onClose,
  onSaved,
}: {
  patientId: string;
  templates: AssessmentTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuthorization();
  const templates = allTemplates.filter((item) => item.status !== "draft");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [values, setValues] = useState<
    Record<string, string | number | boolean | string[]>
  >({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const template = templates.find((item) => item.id === templateId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const input: ClinicalAssessmentInput = {
        patientId,
        templateId,
        values,
        notes,
      };
      await api.createClinicalAssessment(input);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Nova avaliação configurável"
      subtitle="Os dados são preservados com o modelo e a autoria usados no registro."
      busy={saving}
      onClose={onClose}
    >
      {can("clinical.assessments_create") && (
        <form className="clinical-form" onSubmit={submit}>
          <label>
            Modelo
            <select
              required
              value={templateId}
              onChange={(event) => {
                setTemplateId(event.target.value);
                setValues({});
              }}
            >
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · v{item.version}
                </option>
              ))}
            </select>
          </label>
          <ClinicalFieldInputs
            fields={template?.fields ?? []}
            values={values}
            onChange={setValues}
            disabled={saving}
          />
          <label>
            Observações
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
            <button className="primary-button" disabled={!templateId || saving}>
              Registrar avaliação
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
