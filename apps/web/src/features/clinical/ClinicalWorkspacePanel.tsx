import { ClinicalAudioPlayer } from "./ClinicalAudioPlayer";
import { ClinicalResourcesPanel } from "./ClinicalResourcesPanel";
import type {
  AssessmentTemplate,
  ClinicalWorkspace,
  PatientOption,
} from "@crm/contracts";
import { Download, Paperclip, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { ActionMenu } from "../../shared/components/ActionMenu";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { professionalWithCrefito } from "../contracts/index";
import { AssessmentTemplateModal } from "./AssessmentTemplateModal";
import { ClinicalAddendumModal } from "./ClinicalAddendumModal";
import { ClinicalAssessmentModal } from "./ClinicalAssessmentModal";
import { ClinicalAttachmentModal } from "./ClinicalAttachmentModal";
import { ClinicalMeasurementModal } from "./ClinicalMeasurementModal";
import { TherapeuticGoalModal } from "./TherapeuticGoalModal";
import { TreatmentClosureModal } from "./TreatmentClosureModal";
import { goalStatusLabels } from "./model";

export function ClinicalWorkspacePanel({
  patients,
  editable,
  initialPatientId,
}: {
  patients: PatientOption[];
  /** Cliente aberto ao montar (ex.: o da evolução recém-salva). */
  initialPatientId?: string | undefined;
  /** Sem edição de Prontuários: só consulta, impressão e exportação. */
  editable: boolean;
}) {
  const { can } = useAuthorization();
  const [patientId, setPatientId] = useState(
    initialPatientId ?? patients[0]?.id ?? "",
  );
  const [workspace, setWorkspace] = useState<ClinicalWorkspace | null>(null);
  const [templateEditing, setTemplateEditing] = useState<
    AssessmentTemplate | undefined
  >();
  const [editor, setEditor] = useState<
    | "template"
    | "assessment"
    | "goal"
    | "measurement"
    | "closure"
    | "attachment"
    | "addendum"
    | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  function load() {
    setWorkspace(null);
    setLoading(true);
    setError("");
    setWorkspaceVersion((version) => version + 1);
  }

  useEffect(() => {
    if (!patientId) return;
    let active = true;
    api
      .clinicalWorkspace(patientId)
      .then((data) => {
        if (active) setWorkspace(data);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [patientId, workspaceVersion]);

  async function exportRecord(print = false) {
    setError("");
    try {
      const data = await api.exportClinicalWorkspace(patientId);
      if (print) {
        window.print();
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `prontuario-${data.patient.recordNumber}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function downloadAttachment(attachmentId: string) {
    setError("");
    try {
      const attachment = await api.clinicalAttachmentContent(attachmentId);
      const link = document.createElement("a");
      link.href = `data:${attachment.mimeType};base64,${attachment.contentBase64}`;
      link.download = attachment.fileName;
      link.click();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const timeline: Array<{
    id: string;
    date: string;
    kind: string;
    title: string;
    author: string;
    draft?: boolean;
  }> = workspace
    ? [
        ...workspace.records.map((item) => ({
          id: `record-${item.id}`,
          date: item.appointmentStartsAt,
          kind: "Evolução SOAP",
          title: item.assessment || item.subjective || "Evolução clínica",
          author: item.authorName,
          draft: item.status === "draft",
        })),
        ...workspace.assessments.map((item) => ({
          id: `assessment-${item.id}`,
          date: item.createdAt,
          kind: "Avaliação",
          title: item.templateName,
          author: item.authorName,
        })),
        ...workspace.measurements.map((item) => ({
          id: `measurement-${item.id}`,
          date: item.measuredAt,
          kind: "Medição",
          title: `${item.name}: ${item.value} ${item.unit}`,
          author: item.authorName,
        })),
        ...workspace.closures.map((item) => ({
          id: `closure-${item.id}`,
          date: item.occurredAt,
          kind:
            item.kind === "discharge"
              ? "Alta"
              : item.kind === "referral"
                ? "Encaminhamento"
                : "Abandono",
          title: item.summary,
          author: item.authorName,
        })),
        ...(workspace.addenda ?? []).map((item) => ({
          id: `addendum-${item.id}`,
          date: item.createdAt,
          kind: "Adendo imutável",
          title: `${item.reason}: ${item.content}`,
          author: item.authorName,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date))
    : [];

  return (
    <section className="panel clinical-workspace-panel">
      {workspace && (
        <ClinicalResourcesPanel
          key={patientId}
          patientId={patientId}
          patients={patients}
        />
      )}
      <div className="panel-head clinical-workspace-head">
        <div>
          <span className="eyebrow">Visão longitudinal</span>
          <h2>Acompanhamento terapêutico</h2>
        </div>
        <PatientPicker
          patients={patients}
          value={patientId}
          onChange={(id) => {
            setWorkspace(null);
            setEditor(null);
            setLoading(Boolean(id));
            setError("");
            setPatientId(id);
          }}
        />
      </div>
      {error && <ErrorBanner error={error} />}
      {!patientId ? (
        <p className="muted-copy">
          Busque e selecione um cliente para consultar o prontuário.
        </p>
      ) : error ? null : loading || !workspace ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="clinical-workspace-actions">
            {editable && (
              <div className="clinical-workspace-main-actions">
                {can("clinical.assessments_create") && (
                  <button
                    className="secondary-button"
                    onClick={() => setEditor("assessment")}
                  >
                    Nova avaliação
                  </button>
                )}
                {can("clinical.measurements_create") && (
                  <button
                    className="secondary-button"
                    onClick={() => setEditor("measurement")}
                  >
                    Nova medição
                  </button>
                )}
                {can("clinical.addenda_create") && (
                  <button
                    className="secondary-button"
                    onClick={() => setEditor("addendum")}
                    disabled={workspace.records.every(
                      (item) => item.status !== "finalized",
                    )}
                  >
                    Adicionar adendo
                  </button>
                )}
                <ActionMenu
                  label="Mais ações"
                  items={[
                    {
                      label: "Novo modelo",
                      permission: "clinical.templates_create",
                      onSelect: () => {
                        setTemplateEditing(undefined);
                        setEditor("template");
                      },
                    },
                    {
                      label: "Novo objetivo",
                      permission: "clinical.goals_create",
                      onSelect: () => setEditor("goal"),
                    },
                    {
                      label: "Anexar arquivo",
                      icon: <Paperclip size={15} />,
                      permission: "clinical.attachments_create",
                      onSelect: () => setEditor("attachment"),
                    },
                    {
                      label: "Encerrar tratamento",
                      danger: true,
                      permission: "clinical.closures_create",
                      onSelect: () => setEditor("closure"),
                    },
                  ]}
                />
              </div>
            )}
            <div className="clinical-workspace-output-actions">
              {can("clinical.export") && (
                <button
                  className="secondary-button"
                  onClick={() => void exportRecord(true)}
                >
                  <Printer size={15} /> Imprimir
                </button>
              )}
              {can("clinical.export") && (
                <button
                  className="secondary-button"
                  onClick={() => void exportRecord()}
                >
                  <Download size={15} /> Exportar
                </button>
              )}
            </div>
          </div>
          <div className="clinical-workspace-grid">
            <div className="clinical-goals">
              <div className="panel-head compact">
                <div>
                  <span className="eyebrow">Objetivos</span>
                  <h3>Plano terapêutico</h3>
                </div>
              </div>
              {workspace.goals.length === 0 ? (
                <p className="muted-copy">Nenhum objetivo registrado.</p>
              ) : (
                workspace.goals.map((goal) => {
                  const latest = workspace.measurements.find(
                    (item) => item.goalId === goal.id,
                  );
                  return (
                    <article className="clinical-goal-card" key={goal.id}>
                      <div>
                        <span className={`status-pill ${goal.status}`}>
                          {goalStatusLabels[goal.status]}
                        </span>
                        <h4>{goal.title}</h4>
                        <p>{goal.description || "Sem descrição adicional."}</p>
                        {(latest || goal.targetValue !== undefined) && (
                          <small>
                            Atual:{" "}
                            {latest ? `${latest.value} ${latest.unit}` : "—"}
                            {goal.targetValue !== undefined
                              ? ` · Meta: ${goal.targetValue} ${goal.unit ?? ""}`
                              : ""}
                          </small>
                        )}
                      </div>
                      {editable &&
                        goal.status === "active" &&
                        can("clinical.goals_status") && (
                          <button
                            className="text-button button-sm"
                            onClick={async () => {
                              try {
                                await api.updateTherapeuticGoalStatus(
                                  goal.id,
                                  "achieved",
                                );
                                await load();
                              } catch (cause) {
                                setError((cause as Error).message);
                              }
                            }}
                          >
                            Marcar alcançado
                          </button>
                        )}
                    </article>
                  );
                })
              )}
            </div>
            <div className="clinical-timeline">
              <div className="panel-head compact">
                <div>
                  <span className="eyebrow">Histórico integrado</span>
                  <h3>Linha do tempo</h3>
                </div>
              </div>
              {timeline.length === 0 ? (
                <p className="muted-copy">Nenhum evento clínico registrado.</p>
              ) : (
                timeline.map((event) => (
                  <article key={event.id}>
                    <span>
                      {event.kind}
                      {event.draft && (
                        <span className="status-pill draft">Rascunho</span>
                      )}
                    </span>
                    <strong>{event.title}</strong>
                    <small>
                      {new Date(event.date).toLocaleString("pt-BR")} ·{" "}
                      {event.author}
                    </small>
                  </article>
                ))
              )}
            </div>
          </div>
          <div className="clinical-attachments">
            <div className="panel-head compact">
              <div>
                <span className="eyebrow">Arquivos protegidos</span>
                <h3>Anexos clínicos</h3>
              </div>
            </div>
            {(workspace.attachments ?? []).length === 0 ? (
              <p className="muted-copy">Nenhum anexo clínico.</p>
            ) : (
              (workspace.attachments ?? []).map((attachment) => (
                <article key={attachment.id}>
                  <Paperclip size={17} />
                  <div>
                    <strong>{attachment.fileName}</strong>
                    <small>
                      {(attachment.sizeInBytes / 1024).toFixed(1)} KB ·{" "}
                      {attachment.authorName}
                    </small>
                  </div>
                  {attachment.mimeType.startsWith("audio/") &&
                    can("clinical.attachments_read") && (
                      <ClinicalAudioPlayer attachmentId={attachment.id} />
                    )}
                  {can("clinical.attachments_read") && (
                    <button
                      className="text-button button-sm"
                      onClick={() => void downloadAttachment(attachment.id)}
                    >
                      Baixar
                    </button>
                  )}
                </article>
              ))
            )}
          </div>
          <div className="clinical-print-summary">
            <header>
              <span>Prontuário longitudinal</span>
              <h1>{workspace.patient.fullName}</h1>
              <p>
                Registro {workspace.patient.recordNumber} · Emitido em{" "}
                {new Date().toLocaleString("pt-BR")}
              </p>
            </header>
            <h2>Evoluções SOAP</h2>
            {workspace.records.map((record) => (
              <article key={record.id}>
                <h3>
                  {new Date(record.appointmentStartsAt).toLocaleString("pt-BR")}
                </h3>
                <p>
                  <strong>S:</strong> {record.subjective}
                </p>
                <p>
                  <strong>O:</strong> {record.objective}
                </p>
                <p>
                  <strong>A:</strong> {record.assessment}
                </p>
                <p>
                  <strong>P:</strong> {record.plan}
                </p>
                <small>
                  {professionalWithCrefito(
                    record.professionalName,
                    record.professionalCrefito,
                  )}{" "}
                  · Registrado por {record.authorName} · versão {record.version}
                </small>
              </article>
            ))}
            <h2>Avaliações estruturadas</h2>
            {workspace.assessments.map((assessment) => (
              <article key={assessment.id}>
                <h3>{assessment.templateName}</h3>
                {Object.entries(assessment.values).map(([key, value]) => (
                  <p key={key}>
                    <strong>{key}:</strong> {String(value)}
                  </p>
                ))}
                <small>
                  {assessment.authorName} ·{" "}
                  {new Date(assessment.createdAt).toLocaleString("pt-BR")}
                </small>
              </article>
            ))}
            <h2>Objetivos e medidas</h2>
            {workspace.goals.map((goal) => (
              <article key={goal.id}>
                <h3>
                  {goal.title} · {goalStatusLabels[goal.status]}
                </h3>
                <p>{goal.description}</p>
                {workspace.measurements
                  .filter((measurement) => measurement.goalId === goal.id)
                  .map((measurement) => (
                    <p key={measurement.id}>
                      {new Date(measurement.measuredAt).toLocaleDateString(
                        "pt-BR",
                      )}
                      : {measurement.value} {measurement.unit}
                    </p>
                  ))}
              </article>
            ))}
            {(workspace.addenda ?? []).length > 0 && <h2>Adendos</h2>}
            {(workspace.addenda ?? []).map((addendum) => (
              <article key={addendum.id}>
                <h3>{addendum.reason}</h3>
                <p>{addendum.content}</p>
                <small>
                  {addendum.authorName} ·{" "}
                  {new Date(addendum.createdAt).toLocaleString("pt-BR")}
                </small>
              </article>
            ))}
            {workspace.closures.length > 0 && <h2>Encerramentos</h2>}
            {workspace.closures.map((closure) => (
              <article key={closure.id}>
                <h3>{closure.kind}</h3>
                <p>{closure.summary}</p>
                <p>{closure.recommendations}</p>
              </article>
            ))}
          </div>
        </>
      )}
      {workspace && can("clinical.templates_create") && (
        <details className="clinical-resource-panel">
          <summary>Modelos de avaliação</summary>
          {workspace.templates.map((template) => (
            <div className="table-row" key={template.id}>
              <strong>{template.name}</strong>
              <span>
                Versão {template.version} ·{" "}
                {template.status === "draft" ? "Rascunho" : "Publicado"}
              </span>
              <button
                className="secondary-button"
                onClick={() => {
                  setTemplateEditing(template);
                  setEditor("template");
                }}
              >
                Editar modelo
              </button>
            </div>
          ))}
        </details>
      )}
      {editor === "template" && (
        <AssessmentTemplateModal
          template={templateEditing}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "assessment" && workspace && (
        <ClinicalAssessmentModal
          patientId={patientId}
          templates={workspace.templates}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "goal" && (
        <TherapeuticGoalModal
          patientId={patientId}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "measurement" && workspace && (
        <ClinicalMeasurementModal
          patientId={patientId}
          goals={workspace.goals.filter((item) => item.status === "active")}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "closure" && (
        <TreatmentClosureModal
          patientId={patientId}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "attachment" && (
        <ClinicalAttachmentModal
          patientId={patientId}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {editor === "addendum" && workspace && (
        <ClinicalAddendumModal
          records={workspace.records.filter(
            (item) => item.status === "finalized",
          )}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
    </section>
  );
}
