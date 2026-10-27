import type { FinancialEntry } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  compareBranches,
  drillFilters,
  emptyFinancialFilters,
  filterFinancialEntries,
  financialEntriesCsv,
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

  it("gera o CSV com sinal, aspas escapadas e BOM", () => {
    const csv = financialEntriesCsv(entries, () => "Centro");
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[1]).toContain('"05/10/2026";"Entrada";"Plano mensal"');
    expect(lines[1]).toContain('"123,45"');
    expect(lines[2]).toContain('"Conta ""luz"""');
    expect(lines[2]).toContain('"-50,00"');
  });
});
