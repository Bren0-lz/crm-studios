import type { FinancialEntry, FinancialReport } from "@crm/contracts";
import { useState } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency } from "../../shared/lib/formatting";
import {
  cashFlowColumns,
  cashFlowGranularities,
  cashFlowGranularityLabels,
  cashFlowMatrix,
  defaultCashFlowGranularity,
  drillFilters,
  emptyFinancialFilters,
  type CashFlowColumn,
  type CashFlowGranularity,
  type CashFlowRow,
  type CashFlowRowGrouping,
  type FinancialFilters,
} from "./financial-model";

const money = (value: number) => currency.format(value / 100);

const rowGroupings: Record<CashFlowRowGrouping, string> = {
  category: "Categoria",
  origin: "Origem",
};

/**
 * Fluxo de caixa em colunas de tempo (mês, semana ou dia): cada categoria de entrada e
 * saída, o resultado, o pró-labore, o que fica na empresa e o saldo acumulado.
 */
export function FinancialCashFlow({
  from,
  to,
  entries,
  proLabore,
  onDrill,
}: {
  from: string;
  to: string;
  entries: readonly FinancialEntry[];
  proLabore: FinancialReport["proLabore"];
  onDrill: (filters: FinancialFilters) => void;
}) {
  const options = cashFlowGranularities(from, to);
  const [chosen, setChosen] = useState<CashFlowGranularity>(() =>
    defaultCashFlowGranularity(from, to),
  );
  const granularity = options.includes(chosen) ? chosen : "month";
  const [grouping, setGrouping] = useState<CashFlowRowGrouping>("category");
  const columns = cashFlowColumns(from, to, granularity);
  const matrix = cashFlowMatrix(entries, columns, grouping, proLabore);
  const drillColumn = (column: CashFlowColumn) =>
    onDrill({ ...emptyFinancialFilters, from: column.from, to: column.to });

  return (
    <section className="panel report-table financial-cash-flow">
      <div className="panel-head">
        <div>
          <h2>Fluxo de caixa por período</h2>
          <p className="panel-context">
            Entradas e saídas de cada{" "}
            {cashFlowGranularityLabels[granularity].toLowerCase()} por{" "}
            {rowGroupings[grouping].toLowerCase()}. O pró-labore de cada coluna
            é calculado só com o resultado dela.
          </p>
        </div>
        <div className="financial-head-actions">
          <label>
            Colunas
            <select
              value={granularity}
              onChange={(event) =>
                setChosen(event.target.value as CashFlowGranularity)
              }
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {cashFlowGranularityLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Linhas
            <select
              value={grouping}
              onChange={(event) =>
                setGrouping(event.target.value as CashFlowRowGrouping)
              }
            >
              {Object.entries(rowGroupings).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {!entries.length ? (
        <EmptyState
          title="Nenhum movimento no caixa"
          copy="Recebimentos, despesas pagas e a folha paga no período aparecem aqui."
        />
      ) : (
        <div className="table-scroll">
          <table className="dre-table financial-matrix">
            <caption>
              Fluxo de caixa por {rowGroupings[grouping].toLowerCase()}
            </caption>
            <thead>
              <tr>
                <th scope="col">{rowGroupings[grouping]}</th>
                {columns.map((column) => (
                  <th scope="col" className="numeric-value" key={column.key}>
                    <button
                      type="button"
                      className="text-button"
                      title="Ver os lançamentos deste período no extrato"
                      onClick={() => drillColumn(column)}
                    >
                      {column.label}
                    </button>
                  </th>
                ))}
                <th scope="col" className="numeric-value">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              <MatrixGroup
                label="Entradas"
                rows={matrix.inflow}
                totals={matrix.columns.map((item) => item.inflowInCents)}
                total={matrix.total.inflowInCents}
                onDrill={(row) =>
                  onDrill(drillFilters("in", grouping, row.key))
                }
              />
              <MatrixGroup
                label="Saídas"
                rows={matrix.outflow}
                totals={matrix.columns.map((item) => item.outflowInCents)}
                total={matrix.total.outflowInCents}
                negative
                onDrill={(row) =>
                  onDrill(drillFilters("out", grouping, row.key))
                }
              />
              <MatrixLine
                label="(=) Resultado do caixa"
                values={matrix.columns.map((item) => item.resultInCents)}
                total={matrix.total.resultInCents}
                strong
              />
              <MatrixLine
                label="(−) Pró-labore"
                values={matrix.columns.map((item) => -item.proLaboreInCents)}
                total={-matrix.total.proLaboreInCents}
              />
              <MatrixLine
                label="(=) Fica no caixa da empresa"
                values={matrix.columns.map((item) => item.retainedInCents)}
                total={matrix.total.retainedInCents}
                strong
              />
              <MatrixLine
                label="Saldo acumulado no período"
                values={matrix.accumulated}
                total={matrix.total.resultInCents}
              />
              <MatrixLine
                label="Margem"
                values={matrix.columns.map((item) => item.marginPercent)}
                total={matrix.total.marginPercent}
                format={(value) =>
                  value === null ? "—" : `${value.toLocaleString("pt-BR")}%`
                }
              />
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MatrixGroup({
  label,
  rows,
  totals,
  total,
  negative = false,
  onDrill,
}: {
  label: string;
  rows: CashFlowRow[];
  totals: number[];
  total: number;
  negative?: boolean;
  onDrill: (row: CashFlowRow) => void;
}) {
  const sign = negative ? -1 : 1;
  return (
    <>
      <tr className="financial-matrix-group">
        <th scope="row">{label}</th>
        {totals.map((value, index) => (
          <td className="numeric-value" key={index}>
            {money(sign * value)}
          </td>
        ))}
        <td className="numeric-value">{money(sign * total)}</td>
      </tr>
      {rows.map((row) => (
        <tr key={row.key}>
          <th scope="row" className="financial-matrix-item">
            <button
              type="button"
              className="text-button"
              title="Ver os lançamentos no extrato"
              onClick={() => onDrill(row)}
            >
              {row.label}
            </button>
          </th>
          {row.values.map((value, index) => (
            <td className="numeric-value" key={index}>
              {value ? money(sign * value) : "—"}
            </td>
          ))}
          <td className="numeric-value">{money(sign * row.total)}</td>
        </tr>
      ))}
    </>
  );
}

function MatrixLine<T extends number | null>({
  label,
  values,
  total,
  strong = false,
  format = (value) => money(value ?? 0),
}: {
  label: string;
  values: T[];
  total: T;
  strong?: boolean;
  format?: (value: T) => string;
}) {
  const tone = (value: T) =>
    `numeric-value${value !== null && value < 0 ? " negative" : ""}`;
  return (
    <tr className={strong ? "financial-matrix-group" : undefined}>
      <th scope="row">{label}</th>
      {values.map((value, index) => (
        <td className={tone(value)} key={index}>
          {format(value)}
        </td>
      ))}
      <td className={tone(total)}>{format(total)}</td>
    </tr>
  );
}
