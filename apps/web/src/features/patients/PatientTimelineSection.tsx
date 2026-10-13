import type { PatientTimelineEntry } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency } from "../../shared/lib/formatting";
import {
  timelineDate,
  timelineFilterLabels,
  timelineKindConfig,
} from "./model";
import type { TimelineFilter } from "./types";

export function PatientTimelineSection({ patientId }: { patientId: string }) {
  const [entries, setEntries] = useState<PatientTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<TimelineFilter>("all");
  useEffect(() => {
    let active = true;
    api
      .patientTimeline(patientId)
      .then((data) => {
        if (active)
          setEntries(
            Array.isArray(data)
              ? data.filter(
                  (entry) => entry && entry.kind in timelineKindConfig,
                )
              : [],
          );
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
  }, [patientId]);
  const counts = entries.reduce<Partial<Record<TimelineFilter, number>>>(
    (acc, entry) => {
      const key = timelineKindConfig[entry.kind].filter;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const visible =
    filter === "all"
      ? entries
      : entries.filter(
          (entry) => timelineKindConfig[entry.kind].filter === filter,
        );
  return (
    <section
      className="appointment-detail-section patient-timeline"
      aria-labelledby="patient-timeline-title"
    >
      <h3 id="patient-timeline-title">Histórico</h3>
      {error && <ErrorBanner error={error} />}
      {loading ? (
        <LoadingBlock />
      ) : entries.length === 0 ? (
        !error && (
          <EmptyState
            title="Sem histórico"
            copy="Atendimentos, planos, pagamentos e contatos deste cliente aparecem aqui."
          />
        )
      ) : (
        <>
          <div
            className="tag-filter-list"
            role="group"
            aria-label="Filtrar histórico por tipo"
          >
            <button
              type="button"
              className="tag-filter"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              Todos
            </button>
            {timelineFilterLabels
              .filter(([value]) => counts[value])
              .map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className="tag-filter"
                  aria-label={label}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  <small>{counts[value]}</small>
                </button>
              ))}
          </div>
          <ul className="patient-timeline-list">
            {visible.map((entry) => {
              const Icon = timelineKindConfig[entry.kind].icon;
              return (
                <li
                  key={entry.id}
                  className={`patient-timeline-item timeline-${entry.kind}`}
                >
                  <span className="patient-timeline-icon" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <div>
                    <strong>{entry.title}</strong>
                    {entry.detail && <span>{entry.detail}</span>}
                    <small>{timelineDate(entry.occurredAt)}</small>
                  </div>
                  {entry.amountInCents !== undefined && (
                    <span
                      className={`patient-timeline-amount ${entry.amountInCents < 0 ? "negative" : ""}`}
                    >
                      {currency.format(entry.amountInCents / 100)}
                    </span>
                  )}
                  {entry.score !== undefined && (
                    <span className="status-pill">Nota {entry.score}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
