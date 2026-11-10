import type { ClinicalMeasurement, TherapeuticGoal } from "@crm/contracts";
import { History, LineChart, Search, Target } from "lucide-react";
import { useState } from "react";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { shortDate, timeLabel } from "../../shared/lib/formatting";
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
        copy="Avaliações, medições e arquivos aparecem aqui em ordem."
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
                <span className="chart-timeline-kind">{event.label}</span>
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
