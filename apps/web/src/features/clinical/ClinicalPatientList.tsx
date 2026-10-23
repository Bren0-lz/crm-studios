import { Search, UsersRound } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import { initials, shortDate } from "../../shared/lib/formatting";
import {
  filterPatientSummaries,
  type ClinicalPatientFilter,
  type ClinicalPatientSummary,
} from "./model";

const filters: [ClinicalPatientFilter, string][] = [
  ["all", "Todos"],
  ["pending", "Sem evolução"],
  ["drafts", "Rascunhos"],
];

/** Coluna de clientes da página Prontuários: busca, filtros de pendência e seleção. */
export function ClinicalPatientList({
  summaries,
  selectedId,
  onSelect,
}: {
  summaries: ClinicalPatientSummary[];
  selectedId: string | undefined;
  onSelect: (patientId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ClinicalPatientFilter>("all");
  const visible = filterPatientSummaries(summaries, query, filter);
  const totals = {
    all: summaries.length,
    pending: summaries.filter((item) => item.pending.length > 0).length,
    drafts: summaries.filter((item) => item.drafts > 0).length,
  };

  return (
    <section className="panel clinical-patient-list" aria-label="Clientes">
      <div className="clinical-patient-list-head">
        <label className="chart-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar cliente"
            placeholder="Buscar cliente"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div
          className="tag-filter-list"
          role="group"
          aria-label="Filtrar clientes"
        >
          {filters.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="tag-filter"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label} <small>{totals[key]}</small>
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Nenhum cliente encontrado"
          copy={
            filter === "all"
              ? "Confira a busca ou cadastre o cliente em Clientes."
              : "Nada pendente com esse filtro."
          }
        />
      ) : (
        <ul className="clinical-patient-items">
          {visible.map((summary) => (
            <li key={summary.patient.id}>
              <button
                type="button"
                className="clinical-patient-item"
                aria-current={
                  summary.patient.id === selectedId ? "true" : undefined
                }
                onClick={() => onSelect(summary.patient.id)}
              >
                <span className="clinical-patient-avatar" aria-hidden="true">
                  {initials(summary.patient.fullName)}
                </span>
                <span className="clinical-patient-copy">
                  <strong>{summary.patient.fullName}</strong>
                  <small>
                    {!summary.lastActivityAt
                      ? "Sem registros clínicos"
                      : summary.records === 0
                        ? `Sessão em ${shortDate.format(new Date(summary.lastActivityAt))}`
                        : `${summary.records} ${summary.records === 1 ? "evolução" : "evoluções"} · ${shortDate.format(new Date(summary.lastActivityAt))}`}
                  </small>
                  {(summary.pending.length > 0 || summary.drafts > 0) && (
                    <span className="clinical-patient-flags">
                      {summary.pending.length > 0 && (
                        <span
                          className="clinical-flag pending"
                          title="Sessões sem evolução"
                        >
                          {summary.pending.length} sem evolução
                        </span>
                      )}
                      {summary.drafts > 0 && (
                        <span className="clinical-flag draft" title="Rascunhos">
                          {summary.drafts}{" "}
                          {summary.drafts === 1 ? "rascunho" : "rascunhos"}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
