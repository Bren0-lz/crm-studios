import { describe, expect, it } from "vitest";
import { buildDemoScenarios, demoProfessionals } from "./demo-scenarios.js";

describe("demonstration scenarios", () => {
  it("keeps balances, invoices, visits and group attendance coherent", () => {
    const data = buildDemoScenarios();
    expect(data.plans).toHaveLength(56);
    expect(data.plans.some((plan) => plan.kind === "single")).toBe(true);
    expect(
      data.plans.some(
        (plan) => plan.kind === "recurring" && plan.status === "cancelled",
      ),
    ).toBe(true);
    expect(data.receivables.some((item) => item.overdue)).toBe(true);
    expect(
      data.plans
        .filter((plan) => plan.kind === "recurring")
        .every((plan) => plan.installments === 1),
    ).toBe(true);
    expect(data.appointments.some((item) => item.status === "confirmed")).toBe(
      true,
    );
    expect(data.attendance.some((item) => item.status === "present")).toBe(
      true,
    );

    for (const plan of data.plans) {
      const balance = data.movements
        .filter((movement) => movement.planId === plan.id)
        .reduce((sum, movement) => sum + movement.quantity, 0);
      expect(balance).toBe(plan.remainingSessions);
      const invoices = data.receivables.filter(
        (item) => item.planId === plan.id,
      );
      expect(invoices).toHaveLength(plan.installments);
      expect(invoices.reduce((sum, item) => sum + item.amountInCents, 0)).toBe(
        plan.totalValueInCents,
      );
    }
    expect(
      data.sessions.every((session) =>
        [2, 4].includes(new Date(session.startsAt).getDay()),
      ),
    ).toBe(true);
  });

  it("uses professional registrations in the real CREFITO format, not internal codes", () => {
    for (const professional of demoProfessionals)
      expect(professional.crefito).toMatch(/^CREFITO-\d+ \d{6}-F$/);
  });
});
