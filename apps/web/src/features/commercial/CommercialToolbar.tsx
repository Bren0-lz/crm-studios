import type {
  LeadFilter,
  LeadFilterOptions,
  LeadInsights,
} from "@crm/contracts";
import { BarChart3, Search, SlidersHorizontal, X } from "lucide-react";
import {
  activeModalFilters,
  filterValueLabel,
  modalFilterLabels,
  type ModalFilterKey,
} from "./lead-filter-labels";

/** Atalhos de um clique; cada um liga/desliga um valor de filtro. */
function quickFilters(userId: string | undefined) {
  return [
    ...(userId
      ? [
          {
            label: "Meus leads",
            key: "responsibleUserId" as const,
            value: userId,
          },
        ]
      : []),
    { label: "Tarefas atrasadas", key: "tasks" as const, value: "overdue" },
    { label: "Sem contato", key: "contact" as const, value: "without" },
  ];
}

/** Barra enxuta do funil: busca, filtros (modal), atalhos e resumo dos indicadores. */
export function CommercialToolbar({
  filter,
  search,
  options,
  insights,
  userId,
  hideLost,
  onSearch,
  onChange,
  onOpenFilters,
  onOpenAnalysis,
  onToggleLost,
}: {
  filter: LeadFilter;
  search: string;
  options: LeadFilterOptions;
  insights: LeadInsights | null;
  userId?: string;
  hideLost: boolean;
  onSearch: (value: string) => void;
  onChange: (filter: LeadFilter) => void;
  onOpenFilters: () => void;
  onOpenAnalysis: () => void;
  onToggleLost: () => void;
}) {
  const quick = quickFilters(userId);
  const remove = (key: ModalFilterKey) => {
    const next = { ...filter };
    delete next[key];
    onChange(next);
  };
  const active = activeModalFilters(filter);
  // Filtros já mostrados como atalho ligado não viram chip removível de novo.
  const chips = active.filter(
    (key) =>
      !quick.some((item) => item.key === key && filter[key] === item.value),
  );
  return (
    <section
      className="commercial-toolbar"
      aria-label="Busca e filtros do funil"
    >
      <div className="commercial-toolbar-row">
        <label className="search-box commercial-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Buscar no funil</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar lead, telefone, e-mail ou etiqueta…"
          />
        </label>
        <button
          type="button"
          className={`secondary-button filter-toggle${active.length ? " active" : ""}`}
          aria-label={
            active.length
              ? `Filtros (${active.length} ${active.length === 1 ? "ativo" : "ativos"})`
              : "Filtros"
          }
          onClick={onOpenFilters}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filtros
          {active.length > 0 && (
            <span className="filter-badge">{active.length}</span>
          )}
        </button>
        <div className="tag-filter-list commercial-quick-filters">
          {quick.map((item) => {
            const pressed = filter[item.key] === item.value;
            return (
              <button
                type="button"
                key={item.label}
                className="tag-filter"
                aria-pressed={pressed}
                onClick={() =>
                  pressed
                    ? remove(item.key)
                    : onChange({ ...filter, [item.key]: item.value })
                }
              >
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            className="tag-filter"
            aria-pressed={hideLost}
            onClick={onToggleLost}
          >
            Ocultar perdidos
          </button>
        </div>
        {insights && (
          <div className="commercial-summary" aria-live="polite">
            <span>
              <strong>{insights.total}</strong> leads
            </span>
            <span>
              <strong>{insights.open}</strong> abertos
            </span>
            <span>
              <strong>{insights.won}</strong> conversões
            </span>
            <span>
              <strong>{insights.conversionRate}%</strong> conversão
            </span>
            <button
              type="button"
              className="text-button button-sm"
              onClick={onOpenAnalysis}
            >
              <BarChart3 size={14} aria-hidden="true" />
              Análise
            </button>
          </div>
        )}
      </div>
      {chips.length > 0 && (
        <div className="commercial-active-filters">
          {chips.map((key) => (
            <button
              type="button"
              key={key}
              className="tag-filter commercial-filter-chip"
              aria-label={`Remover filtro ${modalFilterLabels[key]}`}
              onClick={() => remove(key)}
            >
              {modalFilterLabels[key]}:{" "}
              <strong>{filterValueLabel(key, filter, options)}</strong>
              <X size={12} aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            className="text-button button-sm"
            onClick={() =>
              onChange(filter.search ? { search: filter.search } : {})
            }
          >
            Limpar filtros
          </button>
        </div>
      )}
    </section>
  );
}
