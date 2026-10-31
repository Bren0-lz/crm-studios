import type { SalesReportPeriod } from "@crm/contracts";

/** Resumo de vendas zerado para mocks; sobrescreva só o que o teste usa. */
export function salesSummary(
  overrides: Partial<SalesReportPeriod> = {},
): SalesReportPeriod {
  return {
    from: "2026-01-01",
    to: "2026-01-31",
    grossSalesInCents: 0,
    cancelledSalesInCents: 0,
    cancelledInPeriodSalesInCents: 0,
    cancelledPriorSalesInCents: 0,
    netSalesInCents: 0,
    salesCount: 0,
    averageTicketInCents: 0,
    buyers: 0,
    newBuyers: 0,
    byType: [],
    byItem: [],
    topBuyers: [],
    payment: { paidInCents: 0, openInCents: 0, overdueInCents: 0 },
    ...overrides,
  };
}
