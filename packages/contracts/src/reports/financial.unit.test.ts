import { describe, expect, it } from "vitest";
import {
  financialTotals,
  groupFinancialEntries,
  proLaboreSettingsInputSchema,
  type FinancialEntry,
} from "./financial.js";

const entry = (
  id: string,
  direction: "in" | "out",
  amountInCents: number,
  categoryName: string,
): FinancialEntry => ({
  id,
  direction,
  kind: direction === "in" ? "receipt" : "payable",
  occurredAt: "2026-10-10T12:00:00.000Z",
  date: "2026-10-10",
  description: id,
  paymentMethod: "pix",
  amountInCents,
  origin: direction === "in" ? "plan" : "expense",
  categoryName,
});

describe("relatório financeiro", () => {
  const entries = [
    entry("a", "in", 100_000, "Planos"),
    entry("b", "in", 50_000, "Comandas"),
    entry("c", "in", -10_000, "Planos"),
    entry("d", "out", 40_000, "Aluguel"),
    entry("e", "out", 20_000, "Comissões"),
  ];

  it("calcula resultado, pró-labore sobre o lucro e o que fica no caixa", () => {
    expect(
      financialTotals(entries, { percentage: 30, base: "profit" }),
    ).toEqual({
      inflowInCents: 140_000,
      outflowInCents: 60_000,
      resultInCents: 80_000,
      proLaboreBaseInCents: 80_000,
      proLaboreInCents: 24_000,
      retainedInCents: 56_000,
      marginPercent: 57.1,
    });
  });

  it("usa as entradas como base quando configurado e zera com prejuízo", () => {
    expect(
      financialTotals(entries, { percentage: 10, base: "revenue" })
        .proLaboreInCents,
    ).toBe(14_000);
    const loss = financialTotals([entry("x", "out", 5_000, "Aluguel")], {
      percentage: 50,
      base: "profit",
    });
    expect(loss).toMatchObject({
      resultInCents: -5_000,
      proLaboreInCents: 0,
      retainedInCents: -5_000,
      marginPercent: null,
    });
  });

  it("agrupa por chave com participação, do maior para o menor", () => {
    const rows = groupFinancialEntries(entries, "in", (item) => ({
      key: item.categoryName,
      label: item.categoryName,
    }));
    expect(
      rows.map(({ key, amountInCents, count }) => [key, amountInCents, count]),
    ).toEqual([
      ["Planos", 90_000, 2],
      ["Comandas", 50_000, 1],
    ]);
    expect(rows[0]!.share).toBeCloseTo(90 / 140);
  });

  it("valida o percentual do pró-labore", () => {
    expect(
      proLaboreSettingsInputSchema.safeParse({
        percentage: 12.5,
        base: "profit",
      }).success,
    ).toBe(true);
    for (const percentage of [-1, 100.01, 10.123])
      expect(
        proLaboreSettingsInputSchema.safeParse({ percentage, base: "profit" })
          .success,
      ).toBe(false);
    expect(
      proLaboreSettingsInputSchema.safeParse({ percentage: 10, base: "other" })
        .success,
    ).toBe(false);
  });
});
