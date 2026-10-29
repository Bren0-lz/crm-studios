import {
  assessmentAnswerGroups,
  clinicalAlertSeverityLabels,
  patientFirstName,
  type AssessmentTemplate,
  type ClinicalAlert,
  type ClinicalAppointmentOption,
  type ClinicalRecord,
  type ClinicalWorkspace,
} from "@crm/contracts";
import {
  AlertTriangle,
  CircleAlert,
  Download,
  FilePlus2,
  Info,
  Paperclip,
  Plus,
  Printer,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionMenu } from "../../shared/components/ActionMenu";
import { ActionModal } from "../../shared/components/ActionModal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useToast } from "../../shared/feedback/toast-context";
import { initials, shortDate, timeLabel } from "../../shared/lib/formatting";
import { professionalWithCrefito } from "../contracts/index";
import { AssessmentTemplateModal } from "./AssessmentTemplateModal";
import { ChartFilesTab } from "./ChartFilesTab";
import { ChartAssessmentsTab } from "./ChartAssessmentsTab";
import {
  ChartEvolutionsTab,
  ChartGoalsTab,
  ChartTimelineTab,
} from "./ChartTabs";
import { ClinicalAddendumModal } from "./ClinicalAddendumModal";
import { ClinicalAlertModal } from "./ClinicalAlertModal";
import { ClinicalAssessmentModal } from "./ClinicalAssessmentModal";
import { ClinicalAttachmentModal } from "./ClinicalAttachmentModal";
import { ClinicalHistoryModal } from "./ClinicalHistoryModal";
import { ClinicalMeasurementModal } from "./ClinicalMeasurementModal";
import { ClinicalRecordModal } from "./ClinicalRecordModal";
import { ClinicalResourcesPanel } from "./ClinicalResourcesPanel";
import { FinalizeRecordModal } from "./FinalizeRecordModal";
import { TherapeuticGoalModal } from "./TherapeuticGoalModal";
import { TreatmentClosureModal } from "./TreatmentClosureModal";
import {
  buildClinicalTimeline,
  closureKindLabels,
  goalStatusLabels,
  patientAge,
} from "./model";

const chartTabs = [
  ["timeline", "Linha do tempo"],
  ["evolutions", "Evoluções"],
  ["assessments", "Avaliações"],
  ["goals", "Plano e medições"],
  ["files", "Arquivos"],
  ["resources", "Treinos e documentos"],
] as const;

type ChartTab = (typeof chartTabs)[number][0];

type Editor =
  | {
      kind: "record";
      record?: ClinicalRecord;
      appointmentId?: string | undefined;
    }
  | { kind: "history"; record: ClinicalRecord }
  | { kind: "finalize"; record: ClinicalRecord }
  | { kind: "addendum"; record?: ClinicalRecord }
  | { kind: "template"; template?: AssessmentTemplate }
  | { kind: "archiveAlert"; alert: ClinicalAlert }
  | {
      kind:
        | "assessment"
        | "goal"
        | "measurement"
        | "closure"
        | "attachment"
        | "alert";
    };

const alertIcons = {
  critical: CircleAlert,
  warning: AlertTriangle,
  info: Info,
};

function dateTime(iso: string) {
  const date = new Date(iso);
  return `${shortDate.format(date)} · ${timeLabel.format(date)}`;
}

/**
 * Prontuário de um cliente: cabeçalho com resumo e alertas, pendências de evolução e abas
 * (linha do tempo, evoluções, avaliações, plano, arquivos e treinos). Usado na página
 * Prontuários e na aba "Prontuário" da ficha do cliente.
 */
export function ClinicalChart({
  patientId,
  editable,
  appointments,
  onRecordChanged,
}: {
  patientId: string;
  /** Sem edição de Prontuários: só consulta, impressão e exportação. */
  editable: boolean;
  /** Sessões já iniciadas do cliente ainda sem evolução. */
  appointments: ClinicalAppointmentOption[];
  onRecordChanged?: ((record: ClinicalRecord) => void) | undefined;
}) {
  const { can } = useAuthorization();
  const toast = useToast();
  const [workspace, setWorkspace] = useState<ClinicalWorkspace | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<ChartTab>("timeline");
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    let active = true;
    api
      .clinicalWorkspace(patientId)
      .then((data) => {
        if (active) setWorkspace(data);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [patientId, version]);

  function reload() {
    setError("");
    setVersion((current) => current + 1);
  }

  function saved(message: string) {
    toast.success(message);
    setEditor(null);
    reload();
  }

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

  if (!workspace)
    return error ? <ErrorBanner error={error} /> : <LoadingBlock />;

  const { patient, records } = workspace;
  const alerts = workspace.alerts ?? [];
  const addenda = workspace.addenda ?? [];
  const attachments = workspace.attachments ?? [];
  const drafts = records.filter((record) => record.status === "draft");
  const pending = appointments.filter(
    (appointment) =>
      !records.some((record) => record.appointmentId === appointment.id),
  );
  const canEvolve =
    editable && can("clinical.records_create") && pending.length > 0;
  const age = patientAge(patient.birthDate || undefined);
  const lastRecord = records[0];
  const closure = workspace.closures[0];
  const activeGoals = workspace.goals.filter(
    (goal) => goal.status === "active",
  ).length;
  const counts: Partial<Record<ChartTab, number>> = {
    evolutions: records.length,
    assessments: workspace.assessments.length,
    goals: workspace.goals.length,
    files: attachments.length,
  };

  return (
    <div className="clinical-chart">
      <header className="clinical-chart-head">
        <span className="clinical-chart-avatar" aria-hidden="true">
          {initials(patient.fullName)}
        </span>
        <div className="clinical-chart-title">
          <h2>{patient.fullName}</h2>
          <p className="panel-context">
            {[
              patient.recordNumber,
              age !== undefined ? `${age} anos` : null,
              `${records.length} ${records.length === 1 ? "evolução" : "evoluções"}`,
              lastRecord
                ? `última sessão em ${shortDate.format(new Date(lastRecord.appointmentStartsAt))}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="clinical-chart-badges">
            {closure ? (
              <span className="status-pill cancelled">
                {closureKindLabels[closure.kind]} em{" "}
                {shortDate.format(new Date(closure.occurredAt))}
              </span>
            ) : (
              <span className="status-pill finalized">Em tratamento</span>
            )}
            {activeGoals > 0 && (
              <span className="status-pill active">
                {activeGoals} {activeGoals === 1 ? "objetivo" : "objetivos"} em
                andamento
              </span>
            )}
          </div>
        </div>
        <div className="clinical-chart-actions">
          {canEvolve && (
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                setEditor({
                  kind: "record",
                  appointmentId: pending[0]?.id,
                })
              }
            >
              <FilePlus2 size={16} /> Evoluir sessão
            </button>
          )}
          {editable && can("clinical.assessments_create") && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setEditor({ kind: "assessment" })}
            >
              Registrar avaliação
            </button>
          )}
          {editable && (
            <ActionMenu
              label="Mais ações"
              align="end"
              items={[
                {
                  label: "Nova medição",
                  permission: "clinical.measurements_create",
                  onSelect: () => setEditor({ kind: "measurement" }),
                },
                {
                  label: "Novo objetivo",
                  permission: "clinical.goals_create",
                  onSelect: () => setEditor({ kind: "goal" }),
                },
                {
                  label: "Anexar arquivo",
                  icon: <Paperclip size={15} />,
                  permission: "clinical.attachments_create",
                  onSelect: () => setEditor({ kind: "attachment" }),
                },
                {
                  label: "Novo alerta clínico",
                  permission: "clinical.records_update",
                  onSelect: () => setEditor({ kind: "alert" }),
                },
                {
                  label: "Novo modelo",
                  permission: "clinical.templates_create",
                  onSelect: () => setEditor({ kind: "template" }),
                },
                {
                  label: "Encerrar tratamento",
                  danger: true,
                  permission: "clinical.closures_create",
                  onSelect: () => setEditor({ kind: "closure" }),
                },
              ]}
            />
          )}
          {can("clinical.export") && (
            <span className="clinical-chart-output">
              <button
                type="button"
                className="secondary-button"
                onClick={() => void exportRecord(true)}
              >
                <Printer size={15} /> Imprimir
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void exportRecord()}
              >
                <Download size={15} /> Exportar
              </button>
            </span>
          )}
        </div>
      </header>

      {error && <ErrorBanner error={error} />}

      {(alerts.length > 0 || (editable && can("clinical.records_update"))) && (
        <ul className="clinical-alerts" aria-label="Alertas clínicos">
          {alerts.map((alert) => {
            const Icon = alertIcons[alert.severity];
            return (
              <li key={alert.id} className={`clinical-alert ${alert.severity}`}>
                <Icon size={16} aria-hidden="true" />
                <span>
                  <strong>
                    {clinicalAlertSeverityLabels[alert.severity]}:
                  </strong>{" "}
                  {alert.text}
                </span>
                {editable && can("clinical.records_update") && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remover alerta: ${alert.text}`}
                    title="Remover alerta"
                    onClick={() => setEditor({ kind: "archiveAlert", alert })}
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            );
          })}
          {editable && can("clinical.records_update") && (
            <li>
              <button
                type="button"
                className="clinical-alert-add"
                onClick={() => setEditor({ kind: "alert" })}
              >
                <Plus size={14} /> Alerta
              </button>
            </li>
          )}
        </ul>
      )}

      {editable && (pending.length > 0 || drafts.length > 0) && (
        <section className="clinical-pending" aria-label="Pendências">
          <h3>Pendências</h3>
          <ul>
            {can("clinical.records_create") &&
              pending.slice(0, 4).map((appointment) => (
                <li key={appointment.id}>
                  <span>
                    <strong>Sessão sem evolução</strong>
                    <small>
                      {dateTime(appointment.startsAt)} ·{" "}
                      {appointment.professionalName}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="primary-button button-sm"
                    onClick={() =>
                      setEditor({
                        kind: "record",
                        appointmentId: appointment.id,
                      })
                    }
                  >
                    Evoluir
                  </button>
                </li>
              ))}
            {drafts.map((record) => (
              <li key={record.id}>
                <span>
                  <strong>Rascunho de evolução</strong>
                  <small>
                    {dateTime(record.appointmentStartsAt)} ·{" "}
                    {record.professionalName}
                  </small>
                </span>
                <span className="clinical-pending-actions">
                  {can("clinical.records_update") && (
                    <button
                      type="button"
                      className="secondary-button button-sm"
                      onClick={() => setEditor({ kind: "record", record })}
                    >
                      Editar
                    </button>
                  )}
                  {can("clinical.finalize") && (
                    <button
                      type="button"
                      className="primary-button button-sm"
                      onClick={() => setEditor({ kind: "finalize", record })}
                    >
                      Finalizar
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {can("clinical.records_create") && pending.length > 4 && (
            <p className="panel-context">
              E mais {pending.length - 4} sessões sem evolução.
            </p>
          )}
        </section>
      )}

      <div
        className="clinical-chart-tabs"
        role="tablist"
        aria-label="Seções do prontuário"
      >
        {chartTabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`chart-tab-${key}`}
            aria-selected={tab === key}
            aria-controls="chart-tab-panel"
            className={`tab-button ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
            {counts[key] ? (
              <small aria-hidden="true">{counts[key]}</small>
            ) : null}
          </button>
        ))}
      </div>
      <div
        className="clinical-chart-panel"
        id="chart-tab-panel"
        role="tabpanel"
        aria-labelledby={`chart-tab-${tab}`}
      >
        {tab === "timeline" && (
          <ChartTimelineTab events={buildClinicalTimeline(workspace)} />
        )}
        {tab === "evolutions" && (
          <ChartEvolutionsTab
            records={records}
            addenda={addenda}
            editable={editable}
            canEvolve={canEvolve}
            onEvolve={() =>
              setEditor({ kind: "record", appointmentId: pending[0]?.id })
            }
            onEdit={(record) => setEditor({ kind: "record", record })}
            onFinalize={(record) => setEditor({ kind: "finalize", record })}
            onHistory={(record) => setEditor({ kind: "history", record })}
            onAddendum={(record) => setEditor({ kind: "addendum", record })}
          />
        )}
        {tab === "assessments" && (
          <ChartAssessmentsTab
            assessments={workspace.assessments}
            templates={workspace.templates}
            editable={editable}
            onNew={() => setEditor({ kind: "assessment" })}
          />
        )}
        {tab === "goals" && (
          <ChartGoalsTab
            goals={workspace.goals}
            measurements={workspace.measurements}
            editable={editable}
            onNewGoal={() => setEditor({ kind: "goal" })}
            onNewMeasurement={() => setEditor({ kind: "measurement" })}
            onAchieve={async (goal) => {
              setError("");
              try {
                await api.updateTherapeuticGoalStatus(goal.id, "achieved");
                saved("Objetivo marcado como alcançado.");
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          />
        )}
        {tab === "files" && (
          <ChartFilesTab
            attachments={attachments}
            canAttach={editable && can("clinical.attachments_create")}
            onAttach={() => setEditor({ kind: "attachment" })}
          />
        )}
        {tab === "resources" && (
          <ClinicalResourcesPanel
            patientId={patientId}
            patients={[
              {
                id: patient.id,
                fullName: patient.fullName,
                tags: patient.tags,
              },
            ]}
          />
        )}
      </div>

      <ClinicalPrintSummary workspace={workspace} />

      {editor?.kind === "record" && (
        <ClinicalRecordModal
          record={editor.record}
          appointments={pending}
          initialAppointmentId={editor.appointmentId}
          previousRecord={editor.record ? undefined : lastRecord}
          onClose={() => setEditor(null)}
          onSaved={(record) => {
            onRecordChanged?.(record);
            saved(`Evolução de ${patientFirstName(record.patientName)} salva.`);
          }}
        />
      )}
      {editor?.kind === "history" && (
        <ClinicalHistoryModal
          record={editor.record}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.kind === "finalize" && (
        <FinalizeRecordModal
          record={editor.record}
          onClose={() => setEditor(null)}
          onConfirm={async () => {
            const record = await api.finalizeClinicalRecord(editor.record.id);
            onRecordChanged?.(record);
            saved(
              `Evolução de ${patientFirstName(record.patientName)} finalizada.`,
            );
          }}
        />
      )}
      {editor?.kind === "addendum" && (
        <ClinicalAddendumModal
          records={
            editor.record
              ? [editor.record]
              : records.filter((item) => item.status === "finalized")
          }
          onClose={() => setEditor(null)}
          onSaved={() => saved("Adendo registrado.")}
        />
      )}
      {editor?.kind === "template" && (
        <AssessmentTemplateModal
          template={editor.template}
          onClose={() => setEditor(null)}
          onSaved={() => saved("Modelo de avaliação salvo.")}
        />
      )}
      {editor?.kind === "assessment" && (
        <ClinicalAssessmentModal
          patientId={patientId}
          templates={workspace.templates}
          assessments={workspace.assessments}
          onClose={() => setEditor(null)}
          onSaved={() => saved("Avaliação registrada.")}
        />
      )}
      {editor?.kind === "goal" && (
        <TherapeuticGoalModal
          patientId={patientId}
          onClose={() => setEditor(null)}
          onSaved={() => saved("Objetivo terapêutico criado.")}
        />
      )}
      {editor?.kind === "measurement" && (
        <ClinicalMeasurementModal
          patientId={patientId}
          goals={workspace.goals.filter((item) => item.status === "active")}
          onClose={() => setEditor(null)}
          onSaved={() => saved("Medição registrada.")}
        />
      )}
      {editor?.kind === "closure" && (
        <TreatmentClosureModal
          patientId={patientId}
          onClose={() => setEditor(null)}
          onSaved={() => saved("Encerramento do tratamento registrado.")}
        />
      )}
      {editor?.kind === "attachment" && (
        <ClinicalAttachmentModal
          patientId={patientId}
          onClose={() => setEditor(null)}
          onSaved={() => saved("Anexo enviado.")}
        />
      )}
      {editor?.kind === "alert" && (
        <ClinicalAlertModal
          patientId={patientId}
          onClose={() => setEditor(null)}
          onSaved={() => saved("Alerta fixado no prontuário.")}
        />
      )}
      {editor?.kind === "archiveAlert" && (
        <ActionModal
          eyebrow="Prontuários"
          title="Remover alerta"
          subtitle={editor.alert.text}
          effect="O alerta sai do topo do prontuário. O registro de quem o criou continua no histórico."
          confirmLabel="Remover alerta"
          danger
          onClose={() => setEditor(null)}
          onConfirm={async () => {
            await api.archiveClinicalAlert(editor.alert.id);
            saved("Alerta removido.");
          }}
        />
      )}
    </div>
  );
}

/** Versão para impressão (oculta na tela; ver regras `@media print`). */
function ClinicalPrintSummary({ workspace }: { workspace: ClinicalWorkspace }) {
  const addenda = workspace.addenda ?? [];
  const alerts = workspace.alerts ?? [];
  return (
    <div className="clinical-print-summary">
      <header>
        <span>Prontuário longitudinal</span>
        <h1>{workspace.patient.fullName}</h1>
        <p>
          Registro {workspace.patient.recordNumber} · Emitido em{" "}
          {new Date().toLocaleString("pt-BR")}
        </p>
      </header>
      {alerts.length > 0 && <h2>Alertas clínicos</h2>}
      {alerts.map((alert) => (
        <p key={alert.id}>
          <strong>{clinicalAlertSeverityLabels[alert.severity]}:</strong>{" "}
          {alert.text}
        </p>
      ))}
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
          {assessmentAnswerGroups(
            workspace.templates.find(
              (template) => template.id === assessment.templateId,
            )?.fields ?? [],
            assessment.values,
          ).flatMap((group) =>
            group.answers.map((answer) => (
              <p key={answer.key}>
                <strong>
                  {group.title ? `${group.title} · ` : ""}
                  {answer.label}:
                </strong>{" "}
                {answer.value}
              </p>
            )),
          )}
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
                {new Date(measurement.measuredAt).toLocaleDateString("pt-BR")}:{" "}
                {measurement.value} {measurement.unit}
              </p>
            ))}
        </article>
      ))}
      {addenda.length > 0 && <h2>Adendos</h2>}
      {addenda.map((addendum) => (
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
          <h3>{closureKindLabels[closure.kind]}</h3>
          <p>{closure.summary}</p>
          <p>{closure.recommendations}</p>
        </article>
      ))}
    </div>
  );
}
