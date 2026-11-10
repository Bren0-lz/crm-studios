import {
  financialEntryOriginLabels,
  financialTotals,
  groupFinancialEntries,
  type FinancialEntry,
  type FinancialEntryOrigin,
  type FinancialReport,
  type FinancialTotals,
  type DailyCashPaymentMethod,
  emptyFinancialFilters,
  entryBranch,
  inBranch,
  NO_BRANCH,
  type FinancialFilters,
} from "@crm/contracts";
import { dailyCashMethodLabels, formatCompetence } from "../finance/index";

// Filtros e planilha do extrato ficam nos contratos: a API gera a mesma planilha.
export {
  emptyFinancialFilters,
  entryBranch,
  filterFinancialEntries,
  inBranch,
  NO_BRANCH,
  type FinancialFilters,
} from "@crm/contracts";

export function activeFilterCount(filters: FinancialFilters) {
  return Object.values(filters).filter((value) => value !== "").length;
}

/** Efeito do movimento no saldo: entradas somam, saídas subtraem. */
export function entryEffect(entry: FinancialEntry) {
  return entry.direction === "in" ? entry.amountInCents : -entry.amountInCents;
}

/** Agrupamentos de cada direção, com o filtro do extrato que cada linha abre. */
export const financialGroupings = {
  in: [
    { key: "origin", label: "Origem" },
    { key: "category", label: "Categoria" },
    { key: "paymentMethod", label: "Forma de pagamento" },
    { key: "counterpart", label: "Cliente" },
  ],
  out: [
    { key: "category", label: "Categoria" },
    { key: "origin", label: "Tipo de saída" },
    { key: "costCenter", label: "Centro de custo" },
    { key: "counterpart", label: "Fornecedor ou profissional" },
    { key: "paymentMethod", label: "Forma de pagamento" },
  ],
} as const;

export type FinancialGrouping =
  | (typeof financialGroupings)["in"][number]["key"]
  | (typeof financialGroupings)["out"][number]["key"];

const groupKey: Record<
  FinancialGrouping,
  (entry: FinancialEntry) => { key: string; label: string }
> = {
  origin: (entry) => ({
    key: entry.origin,
    label: financialEntryOriginLabels[entry.origin],
  }),
  category: (entry) => ({ key: entry.categoryName, label: entry.categoryName }),
  paymentMethod: (entry) => ({
    key: entry.paymentMethod,
    label: dailyCashMethodLabels[entry.paymentMethod],
  }),
  costCenter: (entry) => ({
    key: entry.costCenterName ?? "",
    label: entry.costCenterName ?? "Sem centro de custo",
  }),
  counterpart: (entry) => ({
    key: entry.counterpart ?? "",
    label: entry.counterpart ?? "Não informado",
  }),
};

export function groupEntries(
  entries: readonly FinancialEntry[],
  direction: FinancialEntry["direction"],
  grouping: FinancialGrouping,
) {
  return groupFinancialEntries(entries, direction, groupKey[grouping]);
}

/** Filtro do extrato que mostra os movimentos de uma linha agrupada. */
export function drillFilters(
  direction: FinancialEntry["direction"],
  grouping: FinancialGrouping,
  key: string,
): FinancialFilters {
  return {
    ...emptyFinancialFilters,
    direction,
    ...(grouping === "origin"
      ? { origin: key as FinancialEntryOrigin }
      : grouping === "paymentMethod"
        ? { paymentMethod: key as DailyCashPaymentMethod }
        : { [grouping]: key }),
  };
}

export interface BranchComparison {
  id: string;
  name: string;
  totals: FinancialTotals;
}

/** Totais por filial (só as que tiveram movimento ou existem no escopo). */
export function compareBranches(report: FinancialReport): BranchComparison[] {
  const names = new Map(report.branches.map((item) => [item.id, item.name]));
  const ids = new Set([
    ...report.branches.map((item) => item.id),
    ...report.entries.map(entryBranch),
  ]);
  return [...ids]
    .map((id) => ({
      id,
      name: names.get(id) ?? (id === NO_BRANCH ? "Sem filial" : "Outra filial"),
      totals: financialTotals(inBranch(report.entries, id), report.proLabore),
    }))
    .sort(
      (a, b) =>
        b.totals.resultInCents - a.totals.resultInCents ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
}

/** Saídas separadas entre despesas e pagamento de pessoas (folha e comissões avulsas). */
export function outflowSplit(entries: readonly FinancialEntry[]) {
  let expenses = 0,
    professionals = 0;
  for (const entry of entries)
    if (entry.direction === "out")
      if (entry.origin === "commission" || entry.origin === "payroll")
        professionals += entry.amountInCents;
      else expenses += entry.amountInCents;
  return { expenses, professionals };
}

const DAY = 86_400_000;
/** "08/10": dia e mês, curto para caber no cabeçalho das colunas. */
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);
const lastDayOfMonth = (month: string) =>
  toDate(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
const shiftMonth = (month: string, delta: number) => {
  const date = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta),
  );
  return date.toISOString().slice(0, 7);
};

/** Quantidade de dias do período, contando os dois extremos. */
export function periodDays(from: string, to: string) {
  return Math.round((toTime(to) - toTime(from)) / DAY) + 1;
}

/**
 * Período anterior de mesmo tamanho. Meses inteiros comparam com os meses inteiros
 * anteriores (outubro com setembro); fora disso, os mesmos dias logo antes.
 */
export function previousPeriod(from: string, to: string) {
  const months =
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7)) +
    1;
  if (from.endsWith("-01") && to === lastDayOfMonth(to.slice(0, 7))) {
    const start = shiftMonth(from.slice(0, 7), -months);
    return {
      from: `${start}-01`,
      to: lastDayOfMonth(shiftMonth(to.slice(0, 7), -months)),
    };
  }
  const days = periodDays(from, to);
  return {
    from: toDate(toTime(from) - days * DAY),
    to: toDate(toTime(from) - DAY),
  };
}

/** Variação percentual com uma casa; `null` quando não há base de comparação. */
export function variation(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export type CashFlowGranularity = "month" | "week" | "day";

export const cashFlowGranularityLabels: Record<CashFlowGranularity, string> = {
  month: "Mês",
  week: "Semana",
  day: "Dia",
};

/** Maior período em que a visão por dia é oferecida. */
export const CASH_FLOW_MAX_DAYS = 62;

export interface CashFlowColumn {
  key: string;
  label: string;
  from: string;
  to: string;
}

/** Granularidades disponíveis para o período (dia só em períodos curtos). */
export function cashFlowGranularities(from: string, to: string) {
  return (["month", "week", "day"] as const).filter(
    (item) => item !== "day" || periodDays(from, to) <= CASH_FLOW_MAX_DAYS,
  );
}

/** Colunas padrão: mês quando o período passa de um mês, senão semana. */
export function defaultCashFlowGranularity(
  from: string,
  to: string,
): CashFlowGranularity {
  return from.slice(0, 7) === to.slice(0, 7) ? "week" : "month";
}

/** Colunas do fluxo de caixa, sempre recortadas ao período. */
export function cashFlowColumns(
  from: string,
  to: string,
  granularity: CashFlowGranularity,
): CashFlowColumn[] {
  const columns: CashFlowColumn[] = [];
  let start = from;
  while (start <= to) {
    const end =
      granularity === "day"
        ? start
        : granularity === "week"
          ? toDate(Math.min(toTime(start) + 6 * DAY, toTime(to)))
          : [lastDayOfMonth(start.slice(0, 7)), to].sort()[0]!;
    columns.push({
      key: start,
      label:
        granularity === "month"
          ? formatCompetence(start.slice(0, 7))
          : granularity === "day" || start === end
            ? dayMonth(start)
            : `${dayMonth(start)} a ${dayMonth(end)}`,
      from: start,
      to: end,
    });
    start = toDate(toTime(end) + DAY);
  }
  return columns;
}

export type CashFlowRowGrouping = "category" | "origin";

export interface CashFlowRow {
  key: string;
  label: string;
  /** Valor de cada coluna, na ordem das colunas. */
  values: number[];
  total: number;
}

export interface CashFlowMatrix {
  inflow: CashFlowRow[];
  outflow: CashFlowRow[];
  /** Totais do caixa (com pró-labore) de cada coluna. */
  columns: FinancialTotals[];
  /** Resultado somado coluna a coluna desde o início do período. */
  accumulated: number[];
  total: FinancialTotals;
}

/**
 * Fluxo de caixa em matriz (linhas × colunas de tempo), como o "fluxo de caixa mensal"
 * dos sistemas de gestão: entradas e saídas por categoria ou origem em cada período.
 */
export function cashFlowMatrix(
  entries: readonly FinancialEntry[],
  columns: readonly CashFlowColumn[],
  grouping: CashFlowRowGrouping,
  proLabore: FinancialReport["proLabore"],
): CashFlowMatrix {
  const columnOf = (date: string) =>
    columns.findIndex((column) => date >= column.from && date <= column.to);
  const rows = { in: new Map<string, CashFlowRow>(), out: new Map() } as {
    in: Map<string, CashFlowRow>;
    out: Map<string, CashFlowRow>;
  };
  const perColumn = columns.map(() => [] as FinancialEntry[]);
  for (const entry of entries) {
    const index = columnOf(entry.date);
    if (index < 0) continue;
    perColumn[index]!.push(entry);
    const { key, label } = groupKey[grouping](entry);
    const target = rows[entry.direction];
    const row = target.get(key) ?? {
      key,
      label,
      values: columns.map(() => 0),
      total: 0,
    };
    row.values[index]! += entry.amountInCents;
    row.total += entry.amountInCents;
    target.set(key, row);
  }
  const sorted = (map: Map<string, CashFlowRow>) =>
    [...map.values()].sort(
      (a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"),
    );
  const totals = perColumn.map((items) => financialTotals(items, proLabore));
  let running = 0;
  return {
    inflow: sorted(rows.in),
    outflow: sorted(rows.out),
    columns: totals,
    accumulated: totals.map((item) => (running += item.resultInCents)),
    total: financialTotals(perColumn.flat(), proLabore),
  };
}

export type LedgerSort =
  "date-asc" | "date-desc" | "amount-desc" | "amount-asc";

export const ledgerSortLabels: Record<LedgerSort, string> = {
  "date-asc": "Mais antigos primeiro",
  "date-desc": "Mais recentes primeiro",
  "amount-desc": "Maior valor primeiro",
  "amount-asc": "Menor valor primeiro",
};

/**
 * Ordena o extrato. Na ordem cronológica, cada linha leva o saldo acumulado do filtro
 * (como num extrato bancário); nas outras ordens o saldo não faz sentido.
 */
export function sortLedger(
  entries: readonly FinancialEntry[],
  sort: LedgerSort,
): Array<{ entry: FinancialEntry; balance?: number }> {
  const chronological = [...entries].sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  );
  if (sort === "date-asc") {
    let balance = 0;
    return chronological.map((entry) => ({
      entry,
      balance: (balance += entryEffect(entry)),
    }));
  }
  if (sort === "date-desc")
    return chronological.reverse().map((entry) => ({ entry }));
  const sign = sort === "amount-desc" ? -1 : 1;
  return chronological
    .sort(
      (a, b) =>
        sign * (Math.abs(a.amountInCents) - Math.abs(b.amountInCents)) ||
        a.occurredAt.localeCompare(b.occurredAt),
    )
    .map((entry) => ({ entry }));
}
