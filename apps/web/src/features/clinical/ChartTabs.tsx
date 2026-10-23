import type {
  AssessmentTemplate,
  ClinicalAddendum,
  ClinicalAssessment,
  ClinicalMeasurement,
  ClinicalRecord,
  TherapeuticGoal,
} from "@crm/contracts";
import {
  ClipboardList,
  FileClock,
  FilePlus2,
  History,
  LineChart,
  Search,
  Target,
} from "lucide-react";
import { useState } from "react";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { shortDate, timeLabel } from "../../shared/lib/formatting";
import { professionalWithCrefito } from "../contracts/index";
import { MeasurementChart } from "./MeasurementChart";
import {
  clinicalTimelineKindLabels,
  goalProgress,
  goalStatusLabels,
  measurementSeries,
  type ClinicalTimelineEvent,
  type ClinicalTimelineKind,
} from "./model";
import { patientTagKey } from "@crm/contracts";

function dateTime(iso: string) {
  const date = new Date(iso);
  return `${shortDate.format(date)} · ${timeLabel.format(date)}`;
}

export function ChartTimelineTab({
  events,
}: {
  events: ClinicalTimelineEvent[];
}) {
  const [kind, setKind] = useState<ClinicalTimelineKind | "all">("all");
  const [query, setQuery] = useState("");
  const term = patientTagKey(query);
  const kinds = (
    Object.keys(clinicalTimelineKindLabels) as ClinicalTimelineKind[]
  ).filter((item) => events.some((event) => event.kind === item));
  const visible = events.filter(
    (event) =>
      (kind === "all" || event.kind === kind) &&
      (!term ||
        patientTagKey(`${event.label} ${event.title} ${event.author}`).includes(
          term,
        )),
  );

  if (events.length === 0)
    return (
      <EmptyState
        icon={History}
        title="Nenhum evento clínico registrado"
        copy="Evoluções, avaliações, medições e arquivos aparecem aqui em ordem."
      />
    );
  return (
    <div className="chart-tab">
      <div className="chart-tab-toolbar">
        <div
          className="tag-filter-list"
          role="group"
          aria-label="Tipo de registro"
        >
          <button
            type="button"
            className="tag-filter"
            aria-pressed={kind === "all"}
            onClick={() => setKind("all")}
          >
            Tudo
          </button>
          {kinds.map((item) => (
            <button
              type="button"
              key={item}
              className="tag-filter"
              aria-pressed={kind === item}
              onClick={() => setKind(item)}
            >
              {clinicalTimelineKindLabels[item]}
            </button>
          ))}
        </div>
        <label className="chart-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar no histórico"
            placeholder="Buscar no histórico"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="muted-copy">Nada encontrado com esse filtro.</p>
      ) : (
        <ol className="chart-timeline">
          {visible.map((event) => (
            <li key={event.id} className={`timeline-${event.kind}`}>
              <span className="chart-timeline-dot" aria-hidden="true" />
              <div>
                <span className="chart-timeline-kind">
                  {event.label}
                  {event.draft && (
                    <span className="status-pill draft">Rascunho</span>
                  )}
                </span>
                <strong>{event.title}</strong>
                <small>
                  {dateTime(event.date)} · {event.author}
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const soapLabels = [
  ["subjective", "S", "Subjetivo"],
  ["objective", "O", "Objetivo"],
  ["assessment", "A", "Avaliação"],
  ["plan", "P", "Plano"],
] as const;

export function ChartEvolutionsTab({
  records,
  addenda,
  editable,
  canEvolve,
  onEvolve,
  onEdit,
  onFinalize,
  onHistory,
  onAddendum,
}: {
  records: ClinicalRecord[];
  addenda: ClinicalAddendum[];
  editable: boolean;
  /** Há sessão pendente e permissão para registrar. */
  canEvolve: boolean;
  onEvolve: () => void;
  onEdit: (record: ClinicalRecord) => void;
  onFinalize: (record: ClinicalRecord) => void;
  onHistory: (record: ClinicalRecord) => void;
  onAddendum: (record: ClinicalRecord) => void;
}) {
  const { can } = useAuthorization();
  if (records.length === 0)
    return (
      <EmptyState
        icon={FileClock}
        title="Nenhuma evolução registrada"
        copy="Registre a evolução a partir de uma sessão já iniciada na agenda."
        action={
          canEvolve ? (
            <button type="button" className="primary-button" onClick={onEvolve}>
              <FilePlus2 size={16} /> Evoluir sessão
            </button>
          ) : undefined
        }
      />
    );
  return (
    <div className="chart-tab chart-evolutions">
      {records.map((record) => {
        const recordAddenda = addenda.filter(
          (item) => item.clinicalRecordId === record.id,
        );
        return (
          <article className="chart-evolution" key={record.id}>
            <header>
              <div className="chart-evolution-date">
                <strong>
                  {new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(
                    new Date(record.appointmentStartsAt),
                  )}
                </strong>
                <span>
                  {new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(
                    new Date(record.appointmentStartsAt),
                  )}
                </span>
              </div>
              <div className="chart-evolution-meta">
                <h3>
                  Sessão de {dateTime(record.appointmentStartsAt)}
                  <span className={`status-pill ${record.status}`}>
                    {record.status === "finalized" ? "Finalizado" : "Rascunho"}
                  </span>
                </h3>
                <p>
                  {professionalWithCrefito(
                    record.professionalName,
                    record.professionalCrefito,
                  )}{" "}
                  · versão {record.version}
                </p>
              </div>
              {record.painScale !== undefined && (
                <span
                  className={`chart-pain pain-${record.painScale >= 7 ? "high" : record.painScale >= 4 ? "mid" : "low"}`}
                  title="Escala de dor"
                >
                  Dor {record.painScale}/10
                </span>
              )}
            </header>
            <dl className="chart-soap">
              {soapLabels.map(([key, letter, label]) => (
                <div key={key}>
                  <dt>
                    <span aria-hidden="true">{letter}</span> {label}
                  </dt>
                  <dd className={record[key] ? "" : "is-empty"}>
                    {record[key] || "Não preenchido"}
                  </dd>
                </div>
              ))}
            </dl>
            {recordAddenda.length > 0 && (
              <ul className="chart-addenda" aria-label="Adendos">
                {recordAddenda.map((addendum) => (
                  <li key={addendum.id}>
                    <strong>Adendo · {addendum.reason}</strong>
                    <p>{addendum.content}</p>
                    <small>
                      {dateTime(addendum.createdAt)} · {addendum.authorName}
                    </small>
                  </li>
                ))}
              </ul>
            )}
            <footer>
              <button
                type="button"
                className="secondary-button button-sm"
                onClick={() => onHistory(record)}
              >
                <FileClock size={16} /> Histórico
              </button>
              {editable && record.status === "draft" && (
                <>
                  {can("clinical.records_update") && (
                    <button
                      type="button"
                      className="secondary-button button-sm"
                      onClick={() => onEdit(record)}
                    >
                      Editar
                    </button>
                  )}
                  {can("clinical.finalize") && (
                    <button
                      type="button"
                      className="primary-button button-sm"
                      onClick={() => onFinalize(record)}
                    >
                      Finalizar
                    </button>
                  )}
                </>
              )}
              {editable &&
                record.status === "finalized" &&
                can("clinical.addenda_create") && (
                  <button
                    type="button"
                    className="secondary-button button-sm"
                    onClick={() => onAddendum(record)}
                  >
                    Incluir adendo
                  </button>
                )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}

function assessmentValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export function ChartAssessmentsTab({
  assessments,
  templates,
  editable,
  onNew,
  onNewTemplate,
  onEditTemplate,
}: {
  assessments: ClinicalAssessment[];
  templates: AssessmentTemplate[];
  editable: boolean;
  onNew: () => void;
  onNewTemplate: () => void;
  onEditTemplate: (template: AssessmentTemplate) => void;
}) {
  const { can } = useAuthorization();
  return (
    <div className="chart-tab">
      <div className="chart-tab-toolbar">
        <p className="panel-context">
          Fichas preenchidas com os modelos da clínica.
        </p>
        {editable && can("clinical.assessments_create") && (
          <button type="button" className="secondary-button" onClick={onNew}>
            <ClipboardList size={16} /> Nova avaliação
          </button>
        )}
      </div>
      {assessments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma avaliação registrada"
          copy="Use um modelo (anamnese, postural, funcional…) para registrar a avaliação."
        />
      ) : (
        <div className="chart-assessments">
          {assessments.map((assessment) => {
            const template = templates.find(
              (item) => item.id === assessment.templateId,
            );
            const fields = (template?.fields ?? []).filter(
              (field) => field.type !== "section",
            );
            const entries = Object.entries(assessment.values).filter(
              ([, value]) =>
                value !== "" && !(Array.isArray(value) && value.length === 0),
            );
            return (
              <details className="chart-assessment" key={assessment.id}>
                <summary>
                  <span>
                    <strong>{assessment.templateName}</strong>
                    <small>
                      {dateTime(assessment.createdAt)} · {assessment.authorName}
                    </small>
                  </span>
                  <span className="chart-assessment-count">
                    {entries.length}{" "}
                    {entries.length === 1 ? "resposta" : "respostas"}
                  </span>
                </summary>
                <dl>
                  {entries.map(([key, value]) => {
                    const field = fields.find((item) => item.key === key);
                    return (
                      <div key={key}>
                        <dt>{field?.label ?? key}</dt>
                        <dd>
                          {assessmentValue(value)}
                          {field?.unit ? ` ${field.unit}` : ""}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {assessment.notes && (
                  <p className="chart-assessment-notes">{assessment.notes}</p>
                )}
              </details>
            );
          })}
        </div>
      )}
      {can("clinical.templates_create") && (
        <section className="chart-templates" aria-label="Modelos de avaliação">
          <div className="chart-tab-toolbar">
            <h3>Modelos de avaliação</h3>
            {editable && (
              <button
                type="button"
                className="text-button button-sm"
                onClick={onNewTemplate}
              >
                Novo modelo
              </button>
            )}
          </div>
          {templates.length === 0 ? (
            <p className="muted-copy">Nenhum modelo cadastrado.</p>
          ) : (
            <ul>
              {templates.map((template) => (
                <li key={template.id}>
                  <span>
                    <strong>{template.name}</strong>
                    <small>
                      {template.specialty} · versão {template.version} ·{" "}
                      {template.status === "draft" ? "Rascunho" : "Publicado"}
                    </small>
                  </span>
                  {editable && (
                    <button
                      type="button"
                      className="secondary-button button-sm"
                      onClick={() => onEditTemplate(template)}
                    >
                      Editar modelo
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export function ChartGoalsTab({
  goals,
  measurements,
  editable,
  onNewGoal,
  onNewMeasurement,
  onAchieve,
}: {
  goals: TherapeuticGoal[];
  measurements: ClinicalMeasurement[];
  editable: boolean;
  onNewGoal: () => void;
  onNewMeasurement: () => void;
  onAchieve: (goal: TherapeuticGoal) => void;
}) {
  const { can } = useAuthorization();
  const series = measurementSeries(measurements);
  return (
    <div className="chart-tab">
      <div className="chart-tab-toolbar">
        <p className="panel-context">
          Objetivos do tratamento e medições ao longo das sessões.
        </p>
        {editable && (
          <div className="page-actions">
            {can("clinical.goals_create") && (
              <button
                type="button"
                className="secondary-button"
                onClick={onNewGoal}
              >
                <Target size={16} /> Novo objetivo
              </button>
            )}
            {can("clinical.measurements_create") && (
              <button
                type="button"
                className="secondary-button"
                onClick={onNewMeasurement}
              >
                <LineChart size={16} /> Nova medição
              </button>
            )}
          </div>
        )}
      </div>
      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhum objetivo registrado"
          copy="Defina metas observáveis (ex.: flexão do joelho de 90° para 120°)."
        />
      ) : (
        <div className="chart-goals">
          {goals.map((goal) => {
            // `measurements` chega do mais recente para o mais antigo.
            const latest = measurements.find((item) => item.goalId === goal.id);
            const progress = goalProgress(goal, latest?.value);
            return (
              <article className="chart-goal" key={goal.id}>
                <div className="chart-goal-head">
                  <h3>{goal.title}</h3>
                  <span className={`status-pill ${goal.status}`}>
                    {goalStatusLabels[goal.status]}
                  </span>
                </div>
                {goal.description && <p>{goal.description}</p>}
                {progress !== undefined && (
                  <progress
                    max={100}
                    value={progress}
                    aria-label={`Progresso de ${goal.title}`}
                  >
                    {progress}%
                  </progress>
                )}
                <dl className="chart-goal-values">
                  <div>
                    <dt>Inicial</dt>
                    <dd>
                      {goal.baselineValue ?? "—"} {goal.unit ?? ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Atual</dt>
                    <dd>{latest ? `${latest.value} ${latest.unit}` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Meta</dt>
                    <dd>
                      {goal.targetValue ?? "—"} {goal.unit ?? ""}
                    </dd>
                  </div>
                </dl>
                <footer>
                  <small>
                    {goal.targetDate
                      ? `Data-alvo: ${shortDate.format(new Date(`${goal.targetDate}T12:00:00`))}`
                      : `Criado em ${shortDate.format(new Date(goal.createdAt))}`}
                  </small>
                  {editable &&
                    goal.status === "active" &&
                    can("clinical.goals_status") && (
                      <button
                        type="button"
                        className="text-button button-sm"
                        onClick={() => onAchieve(goal)}
                      >
                        Marcar alcançado
                      </button>
                    )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
      <section
        className="chart-measurements"
        aria-label="Evolução das medições"
      >
        <h3>Evolução das medições</h3>
        {series.length === 0 ? (
          <p className="muted-copy">
            Registre medições (dor, amplitude, força…) para ver o gráfico.
          </p>
        ) : (
          <div className="chart-measurement-grid">
            {series.map((item) => {
              const goalId = item.points.find((point) => point.goalId)?.goalId;
              const target = goals.find(
                (goal) => goal.id === goalId,
              )?.targetValue;
              return (
                <MeasurementChart
                  key={item.key}
                  series={item}
                  target={target}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
