import {
  assessmentAnswerGroups,
  clinicalAlertSeverityLabels,
  type AssessmentTemplate,
  type ClinicalAlert,
  type ClinicalWorkspace,
} from "@crm/contracts";
import {
  AlertTriangle,
  CircleAlert,
  Download,
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
import { initials, shortDate } from "../../shared/lib/formatting";
import { AssessmentTemplateModal } from "./AssessmentTemplateModal";
import { ChartFilesTab } from "./ChartFilesTab";
import { ChartAssessmentsTab } from "./ChartAssessmentsTab";
import { ChartGoalsTab, ChartTimelineTab } from "./ChartTabs";
import { ClinicalAlertModal } from "./ClinicalAlertModal";
import { ClinicalAssessmentModal } from "./ClinicalAssessmentModal";
import { ClinicalAttachmentModal } from "./ClinicalAttachmentModal";
import { ClinicalMeasurementModal } from "./ClinicalMeasurementModal";
import { ClinicalResourcesPanel } from "./ClinicalResourcesPanel";
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
  ["assessments", "Avaliações"],
  ["goals", "Plano e medições"],
  ["files", "Arquivos"],
  ["resources", "Treinos e documentos"],
] as const;

type ChartTab = (typeof chartTabs)[number][0];

type Editor =
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

/**
 * Prontuário de um cliente: cabeçalho com resumo e alertas e abas (linha do tempo,
 * avaliações, plano, arquivos e treinos). Usado na página
 * Prontuários e na aba "Prontuário" da ficha do cliente.
 */
export function ClinicalChart({
  patientId,
  editable,
}: {
  patientId: string;
  /** Sem edição de Prontuários: só consulta, impressão e exportação. */
  editable: boolean;
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

  const { patient, assessments } = workspace;
  const alerts = workspace.alerts ?? [];
  const attachments = workspace.attachments ?? [];
  const age = patientAge(patient.birthDate || undefined);
  const lastAssessmentAt = assessments
    .map((assessment) => assessment.createdAt)
    .sort((a, b) => b.localeCompare(a))[0];
  const closure = workspace.closures[0];
  const activeGoals = workspace.goals.filter(
    (goal) => goal.status === "active",
  ).length;
  const counts: Partial<Record<ChartTab, number>> = {
    assessments: assessments.length,
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
              `${assessments.length} ${assessments.length === 1 ? "avaliação" : "avaliações"}`,
              lastAssessmentAt
                ? `última avaliação em ${shortDate.format(new Date(lastAssessmentAt))}`
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
          {editable && can("clinical.assessments_create") && (
            <button
              type="button"
              className="primary-button"
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
        {tab === "assessments" && (
          <ChartAssessmentsTab
            assessments={assessments}
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
