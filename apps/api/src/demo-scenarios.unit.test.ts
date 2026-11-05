import { isAppointmentStarted, serviceAvailableFor } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { demoPatients } from "./demo-patients.js";
import {
  buildDemoScenarios,
  demoProfessionals,
  demoRooms,
  demoServices,
} from "./demo-scenarios.js";

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
    // Recibo para assinatura de exemplo: um por parcela paga, pronto para enviar (RC3).
    const paid = data.receivables.filter((item) => item.status === "paid");
    expect(data.receiptSignatures.map((item) => item.receivableId)).toEqual(
      paid.map((item) => item.id),
    );
    expect(
      data.receiptSignatures.every(
        (item) =>
          /^[A-Za-z0-9_-]{43}$/.test(item.token) &&
          item.amountInCents ===
            paid.find((entry) => entry.id === item.receivableId)!
              .amountInCents,
      ),
    ).toBe(true);
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

  it("links each demo service to the professionals and rooms that attend it (QM3)", () => {
    const service = (name: string) =>
      demoServices.find((item) => item.name.startsWith(name))!;
    const room = (name: string) =>
      demoRooms.find((item) => item.name === name)!.id;
    for (const item of demoServices) {
      expect(item.professionalIds?.length, item.name).toBeGreaterThan(0);
      expect(item.roomIds?.length, item.name).toBeGreaterThan(0);
    }
    expect(
      serviceAvailableFor(service("Depilação"), "", room("Sala Pilates")),
    ).toBe(false);
    expect(
      serviceAvailableFor(service("Depilação"), "", room("Sala Estética")),
    ).toBe(true);
    expect(
      serviceAvailableFor(service("Pilates"), "", room("Sala Pilates")),
    ).toBe(true);
    expect(
      serviceAvailableFor(service("Dançaterapia"), "", room("Sala de Dança")),
    ).toBe(true);
    expect(
      serviceAvailableFor(service("Dançaterapia"), "", room("Sala Pilates")),
    ).toBe(false);
    // Os atendimentos e turmas demo respeitam os vínculos.
    const data = buildDemoScenarios();
    const incoherent = [...data.appointments, ...data.groups].filter((item) => {
      const linked = demoServices.find(
        (candidate) => candidate.id === item.serviceId,
      );
      return (
        linked && !serviceAvailableFor(linked, item.professionalId, item.roomId)
      );
    });
    expect(incoherent).toEqual([]);
  });

  it("only records completed or no-show outcomes for appointments already started (QC3)", () => {
    const early = buildDemoScenarios().appointments.filter(
      (item) =>
        (item.status === "completed" || item.status === "no_show") &&
        !isAppointmentStarted(item),
    );
    expect(early).toEqual([]);
  });
});
