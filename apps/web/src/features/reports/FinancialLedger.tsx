import {
  financialEntryOriginLabels,
  type FinancialEntry,
  type FinancialEntryOrigin,
  type FinancialProfessional,
  type DailyCashPaymentMethod,
} from "@crm/contracts";
import { Download, Search } from "lucide-react";
import { useState, type Ref } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, formatIsoDate } from "../../shared/lib/formatting";
import { dailyCashMethodLabels } from "../finance/index";
import {
  activeFilterCount,
  emptyFinancialFilters,
  entryEffect,
  filterFinancialEntries,
  financialEntriesCsv,
  type FinancialFilters,
} from "./financial-model";

const PAGE = 100;
const money = (value: number) => currency.format(value / 100);
const distinct = (values: Array<string | undefined>) =>
  [...new Set(values.filter((value): value is string => !!value))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );

/** Extrato do caixa com filtros combináveis, totais do filtro e exportação. */
export function FinancialLedger({
  ref,
  entries,
  filters,
  onFilters,
  showBranch,
  branchName,
  professionals,
  exportable,
  fileName,
}: {
  ref?: Ref<HTMLElement>;
  entries: readonly FinancialEntry[];
  filters: FinancialFilters;
  onFilters: (filters: FinancialFilters) => void;
  showBranch: boolean;
  branchName: (entry: FinancialEntry) => string;
  professionals: readonly FinancialProfessional[];
  exportable: boolean;
  fileName: string;
}) {
  const [limit, setLimit] = useState(PAGE);
  const visible = filterFinancialEntries(entries, filters);
  const inflow = visible
    .filter((entry) => entry.direction === "in")
    .reduce((sum, entry) => sum + entry.amountInCents, 0);
  const outflow = visible
    .filter((entry) => entry.direction === "out")
    .reduce((sum, entry) => sum + entry.amountInCents, 0);
  const active = activeFilterCount(filters);
  const set = <K extends keyof FinancialFilters>(
    key: K,
    value: FinancialFilters[K],
  ) => {
    setLimit(PAGE);
    onFilters({ ...filters, [key]: value });
  };
  const categories = distinct(entries.map((entry) => entry.categoryName));
  const costCenters = distinct(entries.map((entry) => entry.costCenterName));
  const counterparts = distinct(entries.map((entry) => entry.counterpart));
  const methods = Object.keys(dailyCashMethodLabels).filter((method) =>
    entries.some((entry) => entry.paymentMethod === method),
  ) as DailyCashPaymentMethod[];
  const origins = Object.keys(financialEntryOriginLabels).filter((origin) =>
    entries.some((entry) => entry.origin === origin),
  ) as FinancialEntryOrigin[];

  function download() {
    const url = URL.createObjectURL(
      new Blob([financialEntriesCsv(visible, branchName)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section ref={ref} className="panel report-table financial-ledger">
      <div className="panel-head">
        <div>
          <h2>Extrato detalhado</h2>
          <p className="panel-context">
            Cada valor que entrou ou saiu, com origem, categoria e forma de
            pagamento. Clique numa linha dos quadros acima para filtrar.
          </p>
        </div>
        {exportable && (
          <button
            type="button"
            className="secondary-button"
            disabled={!visible.length}
            onClick={download}
          >
            <Download size={16} aria-hidden="true" />
            Exportar extrato
          </button>
        )}
      </div>
      <div className="financial-filters" role="search" aria-label="Filtros">
        <label className="financial-filter-search">
          Buscar
          <span className="search-box">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder="Descrição, cliente, fornecedor…"
              value={filters.search}
              onChange={(event) => set("search", event.target.value)}
            />
          </span>
        </label>
        <label>
          Tipo
          <select
            value={filters.direction}
            onChange={(event) =>
              set(
                "direction",
                event.target.value as FinancialFilters["direction"],
              )
            }
          >
            <option value="">Entradas e saídas</option>
            <option value="in">Só entradas</option>
            <option value="out">Só saídas</option>
          </select>
        </label>
        <label>
          Origem
          <select
            value={filters.origin}
            onChange={(event) =>
              set("origin", event.target.value as FinancialFilters["origin"])
            }
          >
            <option value="">Todas</option>
            {origins.map((origin) => (
              <option key={origin} value={origin}>
                {financialEntryOriginLabels[origin]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select
            value={filters.category}
            onChange={(event) => set("category", event.target.value)}
          >
            <option value="">Todas</option>
            {categories.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Centro de custo
          <select
            value={filters.costCenter}
            onChange={(event) => set("costCenter", event.target.value)}
          >
            <option value="">Todos</option>
            {costCenters.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Forma de pagamento
          <select
            value={filters.paymentMethod}
            onChange={(event) =>
              set(
                "paymentMethod",
                event.target.value as FinancialFilters["paymentMethod"],
              )
            }
          >
            <option value="">Todas</option>
            {methods.map((method) => (
              <option key={method} value={method}>
                {dailyCashMethodLabels[method]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cliente, fornecedor ou profissional
          <select
            value={filters.counterpart}
            onChange={(event) => set("counterpart", event.target.value)}
          >
            <option value="">Todos</option>
            {counterparts.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Profissional pago
          <select
            value={filters.professionalId}
            onChange={(event) => set("professionalId", event.target.value)}
          >
            <option value="">Todos</option>
            {professionals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => set("from", event.target.value)}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => set("to", event.target.value)}
          />
        </label>
        <div className="financial-filter-summary" aria-live="polite">
          <span>
            <strong>{visible.length}</strong>{" "}
            {visible.length === 1 ? "lançamento" : "lançamentos"} · entradas{" "}
            <strong>{money(inflow)}</strong> · saídas{" "}
            <strong>{money(outflow)}</strong> · saldo{" "}
            <strong>{money(inflow - outflow)}</strong>
          </span>
          {active > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setLimit(PAGE);
                onFilters(emptyFinancialFilters);
              }}
            >
              Limpar filtros ({active})
            </button>
          )}
        </div>
      </div>
      {!visible.length ? (
        <EmptyState
          title={
            entries.length
              ? "Nenhum lançamento com esses filtros"
              : "Nenhum movimento no caixa"
          }
          copy={
            entries.length
              ? "Ajuste ou limpe os filtros para ver outros lançamentos."
              : "Recebimentos, despesas pagas e comissões pagas no período aparecem aqui."
          }
        />
      ) : (
        <>
          <div className="table-scroll">
            <table className="dre-table">
              <caption>Lançamentos do caixa</caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Descrição</th>
                  <th scope="col">Categoria</th>
                  {showBranch && <th scope="col">Filial</th>}
                  <th scope="col">Forma</th>
                  <th scope="col" className="numeric-value">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, limit).map((entry) => {
                  const effect = entryEffect(entry);
                  return (
                    <tr key={entry.id}>
                      <td>{formatIsoDate(entry.date)}</td>
                      <th scope="row">
                        {entry.description}
                        {entry.counterpart && (
                          <span className="reports-cell-detail">
                            {entry.counterpart}
                          </span>
                        )}
                      </th>
                      <td>
                        {entry.categoryName}
                        <span className="reports-cell-detail">
                          {financialEntryOriginLabels[entry.origin]}
                          {entry.costCenterName
                            ? ` · ${entry.costCenterName}`
                            : ""}
                        </span>
                      </td>
                      {showBranch && <td>{branchName(entry)}</td>}
                      <td>{dailyCashMethodLabels[entry.paymentMethod]}</td>
                      <td
                        className={`numeric-value ${effect < 0 ? "negative" : "positive"}`}
                      >
                        {money(effect)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length > limit && (
            <div className="financial-more">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setLimit(limit + PAGE)}
              >
                Mostrar mais ({visible.length - limit} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
