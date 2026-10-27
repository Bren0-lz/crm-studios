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
import { dailyCashMethodLabels } from "../finance/index";

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

/** Saídas separadas entre despesas e pagamento de profissionais. */
export function outflowSplit(entries: readonly FinancialEntry[]) {
  let expenses = 0,
    professionals = 0;
  for (const entry of entries)
    if (entry.direction === "out")
      if (entry.origin === "commission") professionals += entry.amountInCents;
      else expenses += entry.amountInCents;
  return { expenses, professionals };
}
