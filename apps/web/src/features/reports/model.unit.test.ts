import { describe, expect, it } from "vitest";
import {
  plural,
  responseTimeLabel,
  salesChartPoints,
  satisfactionLabel,
} from "./model";
import type { SalesPeriodReport } from "@crm/contracts/reports";

function report(from: string, to: string): SalesPeriodReport {
  return {
    from,
    to,
    generatedAt: "2026-01-01T12:00:00Z",
    summary: {
      from,
      to,
      grossSalesInCents: 0,
      cancelledSalesInCents: 0,
      netSalesInCents: 0,
      receivedInCents: 0,
      attendedPatients: 0,
    },
    sales: [],
    payments: [],
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
  it("preserves negative values and assigns local midnight to the right bin", () => {
    const data = report("2026-01-01", "2026-01-02");
    data.sales = [
      { occurredAt: "2026-01-02T02:00:00Z", amountInCents: -1000 },
      { occurredAt: "2026-01-02T03:00:00Z", amountInCents: 5000 },
    ] as SalesPeriodReport["sales"];
    data.payments = [
      { occurredAt: "2026-01-02T03:00:00Z", amountInCents: -300 },
    ] as SalesPeriodReport["payments"];
    expect(salesChartPoints(data).points.map((p) => p.values)).toEqual([
      [-1000, 0],
      [5000, -300],
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
