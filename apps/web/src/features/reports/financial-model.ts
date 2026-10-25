import {
  financialEntryOriginLabels,
  financialTotals,
  groupFinancialEntries,
  type FinancialEntry,
  type FinancialEntryOrigin,
  type FinancialReport,
  type FinancialTotals,
  type DailyCashPaymentMethod,
} from "@crm/contracts";
import { dailyCashMethodLabels } from "../finance/index";

/** Filtros do extrato; vazio = sem filtro. */
export interface FinancialFilters {
  search: string;
  direction: "" | FinancialEntry["direction"];
  origin: "" | FinancialEntryOrigin;
  category: string;
  costCenter: string;
  paymentMethod: "" | DailyCashPaymentMethod;
  professionalId: string;
  counterpart: string;
  from: string;
  to: string;
}

export const emptyFinancialFilters: FinancialFilters = {
  search: "",
  direction: "",
  origin: "",
  category: "",
  costCenter: "",
  paymentMethod: "",
  professionalId: "",
  counterpart: "",
  from: "",
  to: "",
};

export const NO_BRANCH = "sem-filial";

/** Filial do movimento para filtro e comparativo (sem filial = `NO_BRANCH`). */
export function entryBranch(entry: FinancialEntry) {
  return entry.branchId ?? NO_BRANCH;
}

export function inBranch(entries: readonly FinancialEntry[], branchId: string) {
  return branchId
    ? entries.filter((entry) => entryBranch(entry) === branchId)
    : [...entries];
}

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterFinancialEntries(
  entries: readonly FinancialEntry[],
  filters: FinancialFilters,
) {
  const search = normalize(filters.search.trim());
  return entries.filter(
    (entry) =>
      (!filters.direction || entry.direction === filters.direction) &&
      (!filters.origin || entry.origin === filters.origin) &&
      (!filters.category || entry.categoryName === filters.category) &&
      (!filters.costCenter ||
        (entry.costCenterName ?? "") === filters.costCenter) &&
      (!filters.paymentMethod ||
        entry.paymentMethod === filters.paymentMethod) &&
      (!filters.professionalId ||
        entry.professionalId === filters.professionalId) &&
      (!filters.counterpart ||
        (entry.counterpart ?? "") === filters.counterpart) &&
      (!filters.from || entry.date >= filters.from) &&
      (!filters.to || entry.date <= filters.to) &&
      (!search ||
        normalize(
          [
            entry.description,
            entry.counterpart,
            entry.categoryName,
            entry.costCenterName,
            entry.professionalName,
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(search)),
  );
}

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

/** Planilha (CSV com `;`, BOM para o Excel) dos movimentos filtrados. */
export function financialEntriesCsv(
  entries: readonly FinancialEntry[],
  branchName: (entry: FinancialEntry) => string,
) {
  const rows: Array<Array<string | number>> = [
    [
      "Data",
      "Tipo",
      "Descrição",
      "Cliente/fornecedor/profissional",
      "Origem",
      "Categoria",
      "Centro de custo",
      "Filial",
      "Forma de pagamento",
      "Valor",
    ],
    ...entries.map((entry) => [
      entry.date.split("-").reverse().join("/"),
      entry.direction === "in" ? "Entrada" : "Saída",
      entry.description,
      entry.counterpart ?? "",
      financialEntryOriginLabels[entry.origin],
      entry.categoryName,
      entry.costCenterName ?? "",
      branchName(entry),
      dailyCashMethodLabels[entry.paymentMethod],
      (entryEffect(entry) / 100).toFixed(2).replace(".", ","),
    ]),
  ];
  return (
    "﻿" +
    rows
      .map((row) =>
        row
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(";"),
      )
      .join("\r\n")
  );
}
