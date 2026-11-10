import type { FinancialEntry } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  cashFlowColumns,
  cashFlowGranularities,
  cashFlowMatrix,
  compareBranches,
  outflowSplit,
  previousPeriod,
  sortLedger,
  variation,
  drillFilters,
  emptyFinancialFilters,
  filterFinancialEntries,
  NO_BRANCH,
} from "./financial-model";

const entries: FinancialEntry[] = [
  {
    id: "receipt:1",
    direction: "in",
    kind: "receipt",
    occurredAt: "2026-10-05T12:00:00.000Z",
    date: "2026-10-05",
    description: "Plano mensal",
    counterpart: "José Ávila",
    paymentMethod: "pix",
    amountInCents: 12_345,
    origin: "plan",
    categoryName: "Venda de planos",
    branchId: "b1",
  },
  {
    id: "payable:1",
    direction: "out",
    kind: "payable",
    occurredAt: "2026-10-20T12:00:00.000Z",
    date: "2026-10-20",
    description: 'Conta "luz"',
    paymentMethod: "boleto",
    amountInCents: 5_000,
    origin: "expense",
    categoryName: "Energia",
  },
];

describe("modelo do relatório financeiro", () => {
  it("combina filtros e busca sem acento", () => {
    expect(
      filterFinancialEntries(entries, {
        ...emptyFinancialFilters,
        search: "jose avila",
      }).map((item) => item.id),
    ).toEqual(["receipt:1"]);
    expect(
      filterFinancialEntries(entries, {
        ...emptyFinancialFilters,
        from: "2026-10-10",
      }).map((item) => item.id),
    ).toEqual(["payable:1"]);
    expect(
      filterFinancialEntries(
        entries,
        drillFilters("out", "paymentMethod", "boleto"),
      ),
    ).toHaveLength(1);
  });

  it("compara filiais, inclusive movimentos sem filial", () => {
    const rows = compareBranches({
      from: "2026-10-01",
      to: "2026-10-31",
      generatedAt: "",
      commissionMonths: [],
      branches: [{ id: "b1", name: "Centro" }],
      proLabore: { percentage: 10, base: "profit" },
      entries,
      professionals: [],
    });
    expect(rows.map((row) => [row.name, row.totals.resultInCents])).toEqual([
      ["Centro", 12_345],
      ["Sem filial", -5_000],
    ]);
    expect(rows[1]!.id).toBe(NO_BRANCH);
  });

  it("compara meses inteiros com os meses anteriores e o resto com os dias antes", () => {
    expect(previousPeriod("2026-10-01", "2026-10-31")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(previousPeriod("2026-01-01", "2026-03-31")).toEqual({
      from: "2025-10-01",
      to: "2025-12-31",
    });
    expect(previousPeriod("2026-10-01", "2026-10-25")).toEqual({
      from: "2026-09-06",
      to: "2026-09-30",
    });
    expect(variation(150, 100)).toBe(50);
    expect(variation(-50, -100)).toBe(50);
    expect(variation(10, 0)).toBeNull();
  });

  it("monta as colunas de tempo recortadas ao período", () => {
    expect(
      cashFlowColumns("2026-09-15", "2026-11-03", "month").map((column) => [
        column.label,
        column.from,
        column.to,
      ]),
    ).toEqual([
      ["09/2026", "2026-09-15", "2026-09-30"],
      ["10/2026", "2026-10-01", "2026-10-31"],
      ["11/2026", "2026-11-01", "2026-11-03"],
    ]);
    expect(
      cashFlowColumns("2026-10-01", "2026-10-10", "week").map(
        (column) => column.label,
      ),
    ).toEqual(["01/10 a 07/10", "08/10 a 10/10"]);
    expect(cashFlowColumns("2026-10-01", "2026-10-03", "day")).toHaveLength(3);
    expect(cashFlowGranularities("2026-01-01", "2026-12-31")).toEqual([
      "month",
      "week",
    ]);
  });

  it("soma o fluxo por categoria e coluna, com pró-labore e saldo acumulado", () => {
    const columns = cashFlowColumns("2026-10-01", "2026-10-31", "week");
    const matrix = cashFlowMatrix(entries, columns, "category", {
      percentage: 10,
      base: "profit",
    });
    expect(matrix.inflow).toEqual([
      expect.objectContaining({
        label: "Venda de planos",
        values: [12_345, 0, 0, 0, 0],
        total: 12_345,
      }),
    ]);
    expect(matrix.outflow[0]!.values).toEqual([0, 0, 5_000, 0, 0]);
    expect(matrix.columns.map((item) => item.proLaboreInCents)).toEqual([
      1_235, 0, 0, 0, 0,
    ]);
    expect(matrix.accumulated).toEqual([12_345, 12_345, 7_345, 7_345, 7_345]);
    expect(matrix.total.resultInCents).toBe(7_345);
  });

  it("ordena o extrato com saldo só na ordem cronológica", () => {
    expect(
      sortLedger(entries, "date-asc").map((row) => [row.entry.id, row.balance]),
    ).toEqual([
      ["receipt:1", 12_345],
      ["payable:1", 7_345],
    ]);
    expect(
      sortLedger(entries, "amount-asc").map((row) => [
        row.entry.id,
        row.balance,
      ]),
    ).toEqual([
      ["payable:1", undefined],
      ["receipt:1", undefined],
    ]);
  });

  it("conta a folha como pagamento de pessoas", () => {
    expect(
      outflowSplit([
        ...entries,
        { ...entries[1]!, id: "payroll:1", origin: "payroll" },
      ]),
    ).toEqual({ expenses: 5_000, professionals: 5_000 });
  });
});
