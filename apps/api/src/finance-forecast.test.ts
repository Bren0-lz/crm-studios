import { describe, expect, it } from "vitest";
import { planInstallmentSchedule } from "@crm/contracts";
import {
  buildFinanceForecast,
  type FinanceForecastSources,
} from "./finance-forecast.js";

type PlanSource = FinanceForecastSources["plans"][number];
type RecurringSource = FinanceForecastSources["recurringPayables"][number];

const plan = (overrides: Partial<PlanSource>): PlanSource => ({
  status: "active",
  autoRenew: true,
  validFrom: "2026-11-01",
  validUntil: "2026-11-30",
  firstDueDate: "2026-11-10",
  totalValueInCents: 10_000,
  installments: 1,
  ...overrides,
});

const recurring = (overrides: Partial<RecurringSource>): RecurringSource => ({
  id: "r1",
  active: true,
  startMonth: "2026-09",
  amountInCents: 300,
  dayOfMonth: 5,
  ...overrides,
});

const sources: FinanceForecastSources = {
  receivables: [
    { status: "open", dueDate: "2026-10-20", amountInCents: 1_000 },
    { status: "open", dueDate: "2026-11-05", amountInCents: 2_000 },
    { status: "paid", dueDate: "2026-11-06", amountInCents: 9_999 },
    { status: "cancelled", dueDate: "2026-12-06", amountInCents: 9_999 },
    { status: "open", dueDate: "2027-02-01", amountInCents: 9_999 },
  ],
  payables: [
    { status: "open", dueDate: "2026-12-10", amountInCents: 500 },
    { status: "paid", dueDate: "2026-12-11", amountInCents: 9_999 },
    {
      status: "open",
      dueDate: "2026-11-05",
      amountInCents: 300,
      recurringPayableId: "r1",
      competence: "2026-11",
    },
  ],
  plans: [
    // Mensal com renovação automática: renova em dezembro e em janeiro.
    plan({}),
    plan({ autoRenew: false }),
    plan({ status: "cancelled" }),
    plan({ status: "paused" }),
    plan({ renewedByPlanId: "successor" }),
    // Trimestral em 3 parcelas: o próximo período começa em janeiro.
    plan({
      validFrom: "2026-10-01",
      validUntil: "2026-12-31",
      firstDueDate: "2026-10-05",
      totalValueInCents: 10_001,
      installments: 3,
    }),
  ],
  recurringPayables: [
    recurring({}),
    recurring({ id: "r2", active: false, amountInCents: 9_999 }),
    recurring({
      id: "r3",
      startMonth: "2026-11",
      endMonth: "2026-12",
      amountInCents: 700,
    }),
    recurring({
      id: "r4",
      startMonth: "2026-01",
      resumedFromMonth: "2027-01",
      amountInCents: 50,
    }),
  ],
};

const flow = (inflowInCents: number, outflowInCents: number) => ({
  inflowInCents,
  outflowInCents,
  balanceInCents: inflowInCents - outflowInCents,
});

describe("buildFinanceForecast", () => {
  it("separates confirmed and projected flows month by month across the year", () => {
    const forecast = buildFinanceForecast(
      "2026-11",
      3,
      sources,
      new Date("2026-11-15T12:00:00.000Z"),
    );
    expect(forecast).toEqual({
      generatedAt: "2026-11-15T12:00:00.000Z",
      startMonth: "2026-11",
      endMonth: "2027-01",
      months: [
        {
          month: "2026-11",
          confirmed: flow(2_000, 300),
          projected: flow(0, 700),
          balanceInCents: 1_000,
        },
        {
          month: "2026-12",
          confirmed: flow(0, 500),
          projected: flow(10_000, 300 + 700),
          balanceInCents: 8_500,
        },
        {
          month: "2027-01",
          confirmed: flow(0, 0),
          projected: flow(10_000 + 3_334, 300 + 50),
          balanceInCents: 12_984,
        },
      ],
      overdue: flow(1_000, 0),
      totals: {
        confirmed: flow(2_000, 800),
        projected: flow(23_334, 2_050),
        balanceInCents: 22_484,
      },
    });
  });

  it("projects a late renewal in the first month and nothing beyond the horizon", () => {
    const forecast = buildFinanceForecast("2026-11", 1, {
      receivables: [],
      payables: [],
      plans: [
        plan({
          status: "expired",
          validFrom: "2026-09-01",
          validUntil: "2026-09-30",
          firstDueDate: "2026-09-10",
        }),
      ],
      recurringPayables: [recurring({ endMonth: "2026-10" })],
    });
    // Renovações de outubro (atrasada) e novembro.
    expect(forecast.months).toEqual([
      {
        month: "2026-11",
        confirmed: flow(0, 0),
        projected: flow(20_000, 0),
        balanceInCents: 20_000,
      },
    ]);
    expect(forecast.totals.projected).toEqual(flow(20_000, 0));
  });

  it("splits plan installments like the real renewal", () => {
    expect(
      planInstallmentSchedule({
        totalValueInCents: 10_001,
        installments: 3,
        firstDueDate: "2027-01-31",
      }),
    ).toEqual([
      { installmentNumber: 1, dueDate: "2027-01-31", amountInCents: 3_334 },
      { installmentNumber: 2, dueDate: "2027-02-28", amountInCents: 3_334 },
      { installmentNumber: 3, dueDate: "2027-03-31", amountInCents: 3_333 },
    ]);
  });
});
