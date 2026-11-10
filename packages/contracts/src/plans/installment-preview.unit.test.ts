import { describe, expect, it } from "vitest";
import {
  itemsInstallmentPreview,
  planInstallmentPreview,
} from "./installment-preview.js";

const amounts = (rows: { amountInCents: number }[]) =>
  rows.map((row) => row.amountInCents);

describe("planInstallmentPreview", () => {
  it("divide o valor com o centavo do arredondamento nas primeiras parcelas", () => {
    const rows = planInstallmentPreview({
      totalValueInCents: 10_000,
      installments: 3,
      firstDueDate: "2026-01-31",
    });
    expect(amounts(rows)).toEqual([3334, 3333, 3333]);
    expect(rows.map((row) => row.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(rows[0]!.parts).toEqual([
      { label: "Valor do plano (R$ 100,00) ÷ 3", amountInCents: 3333 },
      { label: "Centavo do arredondamento da divisão", amountInCents: 1 },
    ]);
    expect(rows[1]!.parts).toHaveLength(1);
  });

  it("mostra o desconto do plano só nas cobranças do alcance e o desconto geral a partir da 1ª", () => {
    const rows = planInstallmentPreview({
      totalValueInCents: 30_000,
      installments: 3,
      firstDueDate: "2026-11-05",
      discount: { type: "percentage", percent: 10, scope: "next", charges: 2 },
      orderDiscountInCents: 12_000,
    });
    expect(amounts(rows)).toEqual([0, 6000, 10_000]);
    expect(rows[0]!.parts).toEqual([
      { label: "Valor do plano (R$ 300,00) ÷ 3", amountInCents: 10_000 },
      { label: "Desconto do plano · 10%", amountInCents: -1000 },
      { label: "Desconto geral da compra", amountInCents: -9000 },
    ]);
    expect(rows[1]!.parts.at(-1)).toEqual({
      label: "Desconto geral da compra",
      amountInCents: -3000,
    });
    expect(rows[2]!.parts).toHaveLength(1);
  });

  it("põe a cobrança proporcional antes da cheia e, na renovação, o desconto que sobrou do plano anterior", () => {
    const rows = planInstallmentPreview({
      totalValueInCents: 20_000,
      installments: 1,
      firstDueDate: "2026-11-15",
      validFrom: "2026-11-05",
      proratedChargeInCents: 9000,
      previousDiscount: {
        type: "amount",
        amountInCents: 1500,
        scope: "next",
        charges: 3,
        usedCharges: 2,
      },
    });
    expect(rows).toEqual([
      {
        installmentNumber: 1,
        installmentCount: 2,
        dueDate: "2026-11-05",
        amountInCents: 7500,
        parts: [
          {
            label: "Proporcional às aulas até o 1º vencimento",
            amountInCents: 9000,
          },
          { label: "Desconto do plano · valor fixo", amountInCents: -1500 },
        ],
      },
      {
        installmentNumber: 2,
        installmentCount: 2,
        dueDate: "2026-11-15",
        amountInCents: 20_000,
        parts: [{ label: "Valor do plano", amountInCents: 20_000 }],
      },
    ]);
  });
});

describe("itemsInstallmentPreview", () => {
  it("divide o total dos itens e mostra quanto vem de cada um em cada parcela", () => {
    const rows = itemsInstallmentPreview({
      items: [
        { label: "Meia", grossInCents: 3000 },
        { label: "Faixa", grossInCents: 7001 },
      ],
      installments: 2,
    });
    expect(amounts(rows)).toEqual([5001, 5000]);
    for (const row of rows)
      expect(row.parts.reduce((sum, part) => sum + part.amountInCents, 0)).toBe(
        row.amountInCents,
      );
    expect(rows[0]!.parts[0]!.label).toBe("Meia (R$ 30,00) ÷ 2");
    expect(rows[0]!.dueDate).toBeUndefined();
  });

  it("abate o desconto em cada parcela e usa o vencimento quando informado", () => {
    const rows = itemsInstallmentPreview({
      items: [{ label: "Meia", grossInCents: 1000 }],
      discountInCents: 100,
      discountLabel: "Descontos dos produtos",
      installments: 1,
      firstDueDate: "2026-11-10",
    });
    expect(rows).toEqual([
      {
        installmentNumber: 1,
        installmentCount: 1,
        dueDate: "2026-11-10",
        amountInCents: 900,
        parts: [
          { label: "Meia", amountInCents: 1000 },
          { label: "Descontos dos produtos", amountInCents: -100 },
        ],
      },
    ]);
  });
});
