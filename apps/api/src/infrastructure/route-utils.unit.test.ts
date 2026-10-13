import type { ManagementReport } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { reportToCsv } from "./route-utils.js";

function report(): ManagementReport {
  return {
    from: "2026-10-01",
    to: "2026-10-31",
    generatedAt: "2026-10-12T12:00:00Z",
    appointments: {
      total: 0,
      completed: 0,
      noShows: 0,
      cancelled: 0,
      attendanceRate: 0,
      byVisitType: { regular: 0, trial: 0, evaluation: 0 },
    },
    trials: { scheduled: 0, completed: 0, converted: 0, conversionRate: 0 },
    plans: { active: 0, availableSessions: 0, consumedInPeriod: 0 },
    finance: { openInCents: 0, overdueInCents: 0, paidInPeriodInCents: 10000 },
    commercial: {
      leadsCreated: 0,
      won: 0,
      lost: 0,
      conversionRate: 0,
      averageFirstResponseMinutes: 0,
    },
    byProfessional: [],
    byService: [],
    bySource: [],
    profitability: {
      dre: {
        serviceRevenueInCents: 10000,
        productRevenueInCents: 0,
        grossRevenueInCents: 10000,
        productCostInCents: 1000,
        grossProfitInCents: 9000,
        operatingExpensesInCents: 0,
        commissionsInCents: 0,
        netResultInCents: 9000,
        netMargin: 90,
      },
      byService: [],
      byProduct: [],
      operational: {
        groupOccupancyRate: 0,
        activeGroupSeats: 0,
        totalGroupCapacity: 0,
        waitlistCount: 0,
        lowStockCount: 0,
        productUnitsSold: 0,
        averageReceiptInCents: 0,
      },
    },
  };
}

describe("management CSV export", () => {
  it("preserves UTF-8, Windows line endings and values in cents", () => {
    const csv = reportToCsv(report());
    expect(csv.startsWith("\uFEFFseção;item;total;")).toBe(true);
    expect(csv).toContain("financeiro;recebido no período;;;;;10000\r\n");
    expect(csv).toContain("dre;custo dos produtos vendidos;;;;;-1000\r\n");
  });

  it("escapes delimiters, quotes and multiline service/product names", () => {
    const data = report();
    data.profitability.byService = [
      {
        id: "service",
        name: 'Fisio;"VIP"\nretorno',
        completedAppointments: 2,
        revenueInCents: 10000,
        commissionsInCents: 0,
        contributionInCents: 10000,
        contributionMargin: 100,
      },
    ];
    data.profitability.byProduct = [
      {
        id: "product",
        name: 'Faixa;"premium"',
        unitsSold: 1,
        revenueInCents: 2000,
        costInCents: 1000,
        grossProfitInCents: 1000,
        grossMargin: 50,
      },
    ];
    const csv = reportToCsv(data);
    expect(csv).toContain(
      'rentabilidade por serviço;"Fisio;""VIP""\nretorno";2;;;100;10000',
    );
    expect(csv).toContain(
      'rentabilidade por produto;"Faixa;""premium""";1;;;50;1000',
    );
  });
});
