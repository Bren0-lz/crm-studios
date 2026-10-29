import { ClinicalFieldInputs } from "../../shared/components/ClinicalFieldInputs";
import {
  assessmentTemplateFamilyId,
  isBlankAssessmentValue,
  latestAssessmentTemplates,
  patientTagKey,
  previousAssessmentAnswers,
  type AssessmentTemplate,
  type ClinicalAssessment,
  type ClinicalAssessmentInput,
} from "@crm/contracts";
import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { shortDate } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { AssessmentTemplateModal } from "./AssessmentTemplateModal";

/**
 * Registrar avaliação: primeiro escolhe o formulário (modelos publicados), depois preenche.
 * Se o cliente já respondeu aquele formulário, cada campo mostra a última resposta só para
 * consulta; a nova avaliação é um registro à parte e as anteriores continuam no prontuário.
 */
export function ClinicalAssessmentModal({
  patientId,
  templates: allTemplates,
  assessments = [],
  onClose,
  onSaved,
}: {
  patientId: string;
  templates: AssessmentTemplate[];
  /** Avaliações já registradas do cliente (para mostrar as respostas anteriores). */
  assessments?: ClinicalAssessment[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuthorization();
  const toast = useToast();
  const [created, setCreated] = useState<AssessmentTemplate[]>([]);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateNotice, setTemplateNotice] = useState("");
  const knownTemplates = [...allTemplates, ...created];
  const templates = latestAssessmentTemplates(knownTemplates, {
    publishedOnly: true,
  });
  const [templateId, setTemplateId] = useState(
    templates.length === 1 ? templates[0]!.id : "",
  );
  const [step, setStep] = useState<"choose" | "fill">("choose");
  const [search, setSearch] = useState("");
  const [values, setValues] = useState<ClinicalAssessmentInput["values"]>({});
  const [notes, setNotes] = useState("");
  const [showPrevious, setShowPrevious] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty({ values, notes });
  const template = templates.find((item) => item.id === templateId);
  const history = (familyId: string) =>
    previousAssessmentAnswers(assessments, knownTemplates, familyId);
  const previous = template
    ? history(assessmentTemplateFamilyId(template))
    : undefined;
  const term = patientTagKey(search);
  const visibleTemplates = templates.filter(
    (item) =>
      !term || patientTagKey(`${item.name} ${item.specialty}`).includes(term),
  );
  // Formulário e campos obrigatórios: o botão fica desativado listando o que falta.
  const missing = useMissingFields(
    step === "choose"
      ? templateId
        ? []
        : ["Formulário"]
      : (template?.fields ?? [])
          .filter((field) => field.type !== "section" && field.required)
          .filter((field) => isBlankAssessmentValue(values[field.key]))
          .map((field) => field.label),
    "field-hint",
  );

  function choose(id: string) {
    if (id !== templateId) {
      setTemplateId(id);
      setValues({});
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step === "choose") {
      if (template) setStep("fill");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const input: ClinicalAssessmentInput = {
        patientId,
        templateId,
        values: Object.fromEntries(
          Object.entries(values).filter(
            ([, value]) => !isBlankAssessmentValue(value),
          ),
        ),
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
      title="Registrar avaliação"
      subtitle={
        step === "fill" && template
          ? `${template.name} · ${template.specialty}`
          : "Escolha o formulário que será preenchido para este cliente."
      }
      busy={saving}
      dirty={dirty}
      onClose={onClose}
      wide={step === "fill"}
    >
      {can("clinical.assessments_create") && (
        <form className="clinical-form" onSubmit={submit}>
          {step === "choose" ? (
            templates.length === 0 ? (
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
              <>
                {templates.length > 6 && (
                  <label className="chart-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      type="search"
                      aria-label="Buscar formulário"
                      placeholder="Buscar formulário"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                )}
                <fieldset className="assessment-picker">
                  <legend>Formulário</legend>
                  {visibleTemplates.map((item) => {
                    const past = history(assessmentTemplateFamilyId(item));
                    const questions = item.fields.filter(
                      (field) => field.type !== "section",
                    ).length;
                    return (
                      <label key={item.id}>
                        <input
                          type="radio"
                          name="assessment-template"
                          checked={templateId === item.id}
                          onChange={() => choose(item.id)}
                        />
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {item.specialty} · {questions}{" "}
                            {questions === 1 ? "pergunta" : "perguntas"}
                            {past.last
                              ? ` · ${past.count === 1 ? "preenchida 1 vez" : `preenchida ${past.count} vezes`}, a última em ${shortDate.format(new Date(past.last.createdAt))}`
                              : " · ainda não preenchida para este cliente"}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                  {visibleTemplates.length === 0 && (
                    <p className="muted-copy">Nenhum formulário encontrado.</p>
                  )}
                </fieldset>
              </>
            )
          ) : (
            <>
              {previous?.last && (
                <div className="assessment-history-notice">
                  <p>
                    Última avaliação deste tipo em{" "}
                    {shortDate.format(new Date(previous.last.createdAt))} por{" "}
                    {previous.last.authorName}. As respostas anteriores aparecem
                    abaixo de cada campo só para consulta; esta avaliação é
                    registrada à parte e o histórico continua no prontuário.
                  </p>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={showPrevious}
                      onChange={(event) =>
                        setShowPrevious(event.target.checked)
                      }
                    />
                    Mostrar respostas anteriores
                  </label>
                </div>
              )}
              <ClinicalFieldInputs
                fields={template?.fields ?? []}
                values={values}
                onChange={setValues}
                disabled={saving}
                previous={showPrevious ? previous?.answers : undefined}
              />
              <label>
                Observações
                <textarea
                  rows={3}
                  value={notes}
                  disabled={saving}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </>
          )}
          {templateNotice && (
            <p className="muted-copy" role="status">
              {templateNotice}
            </p>
          )}
          {error && <div className="form-error">{error}</div>}
          {missing.hint}
          <div className="modal-actions">
            <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
            {step === "fill" && (
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={() => setStep("choose")}
              >
                Trocar formulário
              </button>
            )}
            <button
              className="primary-button"
              disabled={missing.blocked || saving}
              aria-describedby={missing.describedBy}
            >
              {step === "choose"
                ? "Preencher formulário"
                : "Registrar avaliação"}
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
              setStep("fill");
            }
          }}
        />
      )}
    </Modal>
  );
}
