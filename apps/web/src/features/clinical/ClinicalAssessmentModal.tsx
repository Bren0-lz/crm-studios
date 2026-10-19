import { ClinicalFieldInputs } from "../../shared/components/ClinicalFieldInputs";
import type {
  AssessmentTemplate,
  ClinicalAssessmentInput,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { AssessmentTemplateModal } from "./AssessmentTemplateModal";

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
  const toast = useToast();
  const [created, setCreated] = useState<AssessmentTemplate[]>([]);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateNotice, setTemplateNotice] = useState("");
  const templates = [...allTemplates, ...created].filter(
    (item) => item.status !== "draft",
  );
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [values, setValues] = useState<
    Record<string, string | number | boolean | string[]>
  >({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty({ templateId, values, notes });
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
      dirty={dirty}
      onClose={onClose}
    >
      {can("clinical.assessments_create") && (
        <form className="clinical-form" onSubmit={submit}>
          {templates.length === 0 ? (
            <div className="assessment-template-empty">
              <strong>Nenhum modelo de avaliação</strong>
              <span>
                {can("clinical.templates_create")
                  ? "Crie um modelo com os campos da avaliação; ele fica disponível aqui assim que for publicado."
                  : "Peça a quem gerencia os modelos para publicar um modelo de avaliação."}
              </span>
              {can("clinical.templates_create") && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCreatingTemplate(true)}
                >
                  Criar modelo
                </button>
              )}
            </div>
          ) : (
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
          )}
          {templateNotice && (
            <p className="muted-copy" role="status">
              {templateNotice}
            </p>
          )}
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
            <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
            <button className="primary-button" disabled={!templateId || saving}>
              Registrar avaliação
            </button>
          </div>
        </form>
      )}
      {creatingTemplate && (
        <AssessmentTemplateModal
          onClose={() => setCreatingTemplate(false)}
          onSaved={(saved) => {
            setCreatingTemplate(false);
            setCreated((items) => [...items, saved]);
            if (saved.status === "draft") {
              setTemplateNotice(
                `O modelo "${saved.name}" foi salvo como rascunho. Publique-o para usar nesta avaliação.`,
              );
            } else {
              setTemplateNotice("");
              toast.success(`Modelo “${saved.name}” publicado.`);
              setTemplateId(saved.id);
              setValues({});
            }
          }}
        />
      )}
    </Modal>
  );
}
