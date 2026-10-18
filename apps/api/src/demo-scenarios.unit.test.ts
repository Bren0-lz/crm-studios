import { describe, expect, it } from "vitest";
import { demoPatients } from "./demo-patients.js";
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

  it("uses realistic, varied client names and emergency contacts (V12)", () => {
    const names = demoPatients.map((patient) => patient.fullName);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      const [, first, second] = name.split(" ");
      expect(first, name).not.toBe(second);
    }
    // Cada primeiro nome aparece com mais de um sobrenome.
    const byFirstName = new Map<string, Set<string>>();
    for (const name of names) {
      const [firstName, , secondSurname] = name.split(" ");
      byFirstName.set(
        firstName!,
        (byFirstName.get(firstName!) ?? new Set()).add(secondSurname!),
      );
    }
    for (const [firstName, surnames] of byFirstName)
      if (names.filter((name) => name.startsWith(`${firstName} `)).length > 1)
        expect(surnames.size, firstName).toBeGreaterThan(1);
    for (const patient of demoPatients)
      expect(patient.emergencyContactName ?? "").not.toContain("fictício");
  });

  it("never dates creation or history events in the future (V12)", () => {
    const limit = Date.now() + 60_000;
    const keys = [
      "createdAt",
      "updatedAt",
      "paidAt",
      "occurredAt",
      "recordedAt",
    ];
    const collections: Record<string, unknown> = {
      ...buildDemoScenarios(),
      patients: demoPatients,
    };
    const future: string[] = [];
    for (const [collection, items] of Object.entries(collections)) {
      if (!Array.isArray(items)) continue;
      for (const item of items as Record<string, unknown>[])
        for (const key of keys) {
          const value = item[key];
          if (typeof value === "string" && Date.parse(value) > limit)
            future.push(`${collection}.${key}`);
        }
    }
    expect(future).toEqual([]);
  });
});
