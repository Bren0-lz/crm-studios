import { describe, expect, it } from "vitest";
import { planTablePriceSummary } from "../index.js";

const services = [
  { id: "pilates", priceInCents: 9000 },
  { id: "danca", priceInCents: 7000 },
  { id: "avaliacao", priceInCents: 0 },
];

describe("preço de tabela no cadastro de plano", () => {
  it("soma preço de tabela × sessões de cada serviço do plano", () => {
    expect(
      planTablePriceSummary(
        [
          { serviceId: "pilates", sessions: 8 },
          { serviceId: "danca", sessions: 4 },
        ],
        services,
      ),
    ).toEqual({
      lines: [
        {
          serviceId: "pilates",
          sessions: 8,
          unitPriceInCents: 9000,
          totalInCents: 72000,
        },
        {
          serviceId: "danca",
          sessions: 4,
          unitPriceInCents: 7000,
          totalInCents: 28000,
        },
      ],
      totalInCents: 100000,
      missingPrices: 0,
    });
  });

  it("deixa de fora linha sem serviço e não soma serviço sem preço", () => {
    const summary = planTablePriceSummary(
      [
        { serviceId: "pilates", sessions: 1 },
        { serviceId: "", sessions: 3 },
        { serviceId: "avaliacao", sessions: 2 },
        { serviceId: "removido", sessions: 1 },
      ],
      services,
    );
    expect(summary.lines.map((line) => line.serviceId)).toEqual([
      "pilates",
      "avaliacao",
      "removido",
    ]);
    expect(summary.lines[1]).toMatchObject({
      unitPriceInCents: null,
      totalInCents: null,
    });
    expect(summary.totalInCents).toBe(9000);
    expect(summary.missingPrices).toBe(2);
  });

  it("conta zero sessões enquanto o campo está vazio ou inválido", () => {
    const summary = planTablePriceSummary(
      [{ serviceId: "pilates", sessions: Number.NaN }],
      services,
    );
    expect(summary.lines[0]).toMatchObject({ sessions: 0, totalInCents: 0 });
    expect(summary.totalInCents).toBe(0);
  });
});
