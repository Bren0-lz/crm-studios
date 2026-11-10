import type { GroupClass, GroupEnrollment, PatientPlan } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { groupOperationRange } from "../../shared/lib/formatting";
import {
  calendarMonthDays,
  groupCalendarRange,
  groupRevenueOverview,
  shiftIsoDate,
  shiftMonth,
} from "./model";

describe("group sessions calendar dates", () => {
  it("moves across month and year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-10", -13)).toBe("2025-09");
    expect(shiftIsoDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftIsoDate("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("builds full weeks from Monday to Sunday", () => {
    const october = calendarMonthDays("2026-10");
    expect(october[0]).toBe("2026-09-28");
    expect(october.at(-1)).toBe("2026-11-01");
    expect(october).toHaveLength(35);
    const january = calendarMonthDays("2027-01");
    expect(january[0]).toBe("2026-12-28");
    expect(january.at(-1)).toBe("2027-01-31");
    // Fevereiro de 2027 começa numa segunda e termina num domingo.
    expect(calendarMonthDays("2027-02")).toHaveLength(28);
  });

  it("queries the whole visible month together with the operating window", () => {
    const now = new Date("2026-10-18T15:00:00Z");
    const operation = groupOperationRange(now);
    expect(groupCalendarRange("2026-10", now)).toEqual(operation);
    expect(groupCalendarRange("2026-07", now)).toEqual({
      from: "2026-06-28T00:00:00.000Z",
      to: operation.to,
    });
    expect(groupCalendarRange("2027-06", now)).toEqual({
      from: operation.from,
      to: "2027-07-06T00:00:00.000Z",
    });
  });
});

describe("group revenue overview", () => {
  const serviceId = "service-pilates";
  const group = {
    id: "group-a",
    serviceId,
    capacity: 5,
    activeEnrollments: 3,
    weeklySlots: [
      { weekday: 1, startTime: "08:00", endTime: "09:00" },
      { weekday: 3, startTime: "08:00", endTime: "09:00" },
    ],
  } as GroupClass;
  const enrollment = (patientId: string, status = "active") =>
    ({
      id: `enrollment-${patientId}`,
      groupId: group.id,
      patientId,
      patientName: patientId,
      status,
    }) as GroupEnrollment;
  const plan = (
    patientId: string,
    totalSessions: number,
    totalValueInCents: number,
    extra: Partial<PatientPlan> = {},
  ) =>
    ({
      patientId,
      status: "active",
      validFrom: "2026-01-01",
      validUntil: "",
      services: [{ serviceId, totalSessions, totalValueInCents }],
      ...extra,
    }) as PatientPlan;
  // Sessão do plano avulso do serviço (sem matriculado com plano).
  const services = new Map([[serviceId, 7000]]);

  it("sums monthly plan values and projects free seats by the average ticket", () => {
    const [row] = groupRevenueOverview(
      [group],
      [
        enrollment("ana"),
        enrollment("bia"),
        enrollment("caio"),
        enrollment("davi", "waitlisted"),
      ],
      [
        // R$ 400 por 8 sessões × 8 encontros no mês.
        plan("ana", 8, 40000),
        // Trimestral: R$ 960 por 24 sessões → R$ 320 por mês.
        plan("bia", 24, 96000),
        // Plano expirado e plano pausado não contam.
        plan("caio", 8, 40000, { validUntil: "2026-05-31" }),
        plan("caio", 8, 40000, { status: "paused" }),
        plan("davi", 8, 40000),
      ],
      services,
      "2026-10-23",
    );
    expect(row).toMatchObject({
      enrolled: 3,
      freeSeats: 2,
      sessionsPerMonth: 8,
      currentInCents: 72000,
      // 2 vagas × ticket médio de R$ 360.
      potentialInCents: 72000 + 2 * 36000,
    });
    expect(
      row!.members.map((item) => [
        item.enrollment.patientId,
        item.monthlyInCents,
      ]),
    ).toEqual([
      ["ana", 40000],
      ["bia", 32000],
      ["caio", null],
    ]);
  });

  it("uses the single plan session price when no member has an active plan", () => {
    const [row] = groupRevenueOverview(
      [{ ...group, activeEnrollments: 0 }],
      [],
      [],
      services,
      "2026-10-23",
    );
    expect(row!.currentInCents).toBe(0);
    expect(row!.potentialInCents).toBe(5 * 7000 * 8);
  });
});
