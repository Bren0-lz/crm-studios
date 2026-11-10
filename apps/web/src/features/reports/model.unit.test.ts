import { describe, expect, it } from "vitest";
import {
  periodPresets,
  plural,
  responseTimeLabel,
  salesChartPoints,
  satisfactionLabel,
} from "./model";
import type { SalesPeriodReport } from "@crm/contracts/reports";
import { salesSummary } from "../../test-support/sales-report";

function report(from: string, to: string): SalesPeriodReport {
  return {
    from,
    to,
    generatedAt: "2026-01-01T12:00:00Z",
    summary: salesSummary({ from, to }),
    previous: salesSummary(),
    changeInCents: 0,
    changePercent: null,
    sales: [],
    patientsWithoutReturn: [],
    returnReference: { from, to },
  };
}
describe("sales chart aggregation", () => {
  it.each([
    ["2026-01-01", "2026-01-31", "Diário", 31],
    ["2026-01-01", "2026-02-01", "Semanal", 5],
    ["2026-01-15", "2026-08-01", "Mensal", 8],
  ])("groups %s to %s as %s", (from, to, grouping, length) => {
    const chart = salesChartPoints(report(from, to));
    expect(chart.grouping).toBe(grouping);
    expect(chart.points).toHaveLength(length);
  });
  it("nets own cancellations, skips cancellations of earlier sales and assigns local midnight to the right bin", () => {
    const data = report("2026-01-01", "2026-01-02");
    data.sales = [
      { kind: "sale", occurredAt: "2026-01-01T12:00:00Z", amountInCents: 3000 },
      {
        kind: "cancellation",
        occurredAt: "2026-01-02T02:00:00Z",
        saleOccurredAt: "2026-01-01T12:00:00Z",
        amountInCents: -1000,
      },
      { kind: "sale", occurredAt: "2026-01-02T03:00:00Z", amountInCents: 5000 },
      // Venda de dezembro cancelada em janeiro: fora do líquido do período.
      {
        kind: "cancellation",
        occurredAt: "2026-01-02T12:00:00Z",
        saleOccurredAt: "2025-12-10T12:00:00Z",
        amountInCents: -8000,
      },
    ] as SalesPeriodReport["sales"];
    expect(salesChartPoints(data).points.map((p) => p.values)).toEqual([
      [2000],
      [5000],
    ]);
  });
});

describe("textos simples dos indicadores", () => {
  it("traduz a nota NPS em palavras", () => {
    expect(satisfactionLabel(null)).toBe("—");
    expect(satisfactionLabel(-20)).toBe("Precisa de atenção");
    expect(satisfactionLabel(0)).toBe("Precisa de atenção");
    expect(satisfactionLabel(25)).toBe("Razoável");
    expect(satisfactionLabel(60)).toBe("Boa");
    expect(satisfactionLabel(90)).toBe("Excelente");
  });

  it("escreve o tempo de resposta em minutos ou horas", () => {
    expect(responseTimeLabel(0)).toBe("menos de 1 min");
    expect(responseTimeLabel(12.4)).toBe("12 min");
    expect(responseTimeLabel(120)).toBe("2 h");
    expect(responseTimeLabel(125)).toBe("2 h 5 min");
  });

  it("usa singular e plural", () => {
    expect(plural(1, "cliente", "clientes")).toBe("1 cliente");
    expect(plural(0, "cliente", "clientes")).toBe("0 clientes");
  });
});

describe("atalhos de período", () => {
  it("calcula mês, mês passado, trimestre e anos a partir de hoje", () => {
    expect(
      periodPresets("2026-03-15").map((item) => [
        item.label,
        item.from,
        item.to,
      ]),
    ).toEqual([
      ["Este mês", "2026-03-01", "2026-03-15"],
      ["Mês passado", "2026-02-01", "2026-02-28"],
      ["Últimos 3 meses", "2026-01-01", "2026-03-15"],
      ["Este ano", "2026-01-01", "2026-03-15"],
      ["Ano passado", "2025-01-01", "2025-12-31"],
    ]);
    expect(periodPresets("2026-01-10")[1]).toMatchObject({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});
