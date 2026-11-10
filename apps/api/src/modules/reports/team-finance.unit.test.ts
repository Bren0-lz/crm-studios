import type { GroupClass, PatientPlan } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { buildTeamFinanceReport, competencesBetween } from "./team-finance.js";

// Sessão sem plano vale a sessão do plano avulso do serviço (8000).
const singleSessionPrices = new Map([["s1", 8000]]);
const plan = {
  id: "p1",
  patientId: "c1",
  status: "active",
  createdAt: "2039-01-01T00:00:00Z",
  services: [{ serviceId: "s1", totalSessions: 4, totalValueInCents: 24000 }],
} as PatientPlan;
const group = (id: string, capacity: number) =>
  ({
    id,
    name: `Turma ${id}`,
    serviceId: "s1",
    serviceName: "Pilates",
    professionalName: "Ana",
    capacity,
    active: true,
    weeklySlots: [
      { weekday: 1, startTime: "08:00", endTime: "09:00" },
      { weekday: 3, startTime: "08:00", endTime: "09:00" },
    ],
  }) as GroupClass;

describe("buildTeamFinanceReport", () => {
  it("lists every competence the period touches", () => {
    expect(competencesBetween("2038-11-15", "2039-02-01")).toEqual([
      "2038-11",
      "2038-12",
      "2039-01",
      "2039-02",
    ]);
  });

  it("values sessions by plan or table price and projects groups", () => {
    const report = buildTeamFinanceReport({
      from: "2039-01-01",
      to: "2039-01-31",
      sources: {
        sessions: [
          {
            professionalId: "a",
            professionalName: "Ana",
            serviceId: "s1",
            serviceName: "Pilates",
            planId: "p1",
          },
          {
            professionalId: "a",
            professionalName: "Ana",
            serviceId: "s1",
            serviceName: "Pilates",
          },
        ],
        commissions: [
          {
            professionalId: "b",
            professionalName: "Bia",
            competence: "2039-01",
            amountInCents: 500,
            status: "paid",
          },
        ],
        pendingCommissions: [
          { professionalId: "a", professionalName: "Ana", amountInCents: 800 },
        ],
      },
      plans: [plan],
      singleSessionPrices,
      groups: [group("cheia", 1), group("vazia", 3)],
      enrollments: [
        {
          id: "e1",
          groupId: "cheia",
          patientId: "c1",
          status: "active",
        } as never,
      ],
    });
    expect(report.byProfessional).toEqual([
      expect.objectContaining({
        id: "a",
        completedSessions: 2,
        generatedInCents: 6000 + 8000,
        commission: expect.objectContaining({ totalInCents: 800 }),
      }),
      expect.objectContaining({
        id: "b",
        completedSessions: 0,
        commission: expect.objectContaining({
          paidInCents: 500,
          totalInCents: 500,
        }),
      }),
    ]);
    expect(report.byService[0]).toMatchObject({ averageTicketInCents: 7000 });
    expect(report.byGroup).toEqual([
      expect.objectContaining({
        id: "cheia",
        occupancyRate: 100,
        monthlyRevenueInCents: 8 * 6000,
        idleRevenueInCents: 0,
      }),
      expect.objectContaining({
        id: "vazia",
        occupancyRate: 0,
        monthlyRevenueInCents: 0,
        potentialRevenueInCents: 3 * 8 * 8000,
      }),
    ]);
  });

  it("breaks revenue ties by name", () => {
    const session = (professionalName: string) => ({
      professionalId: professionalName,
      professionalName,
      serviceId: "s1",
      serviceName: "Pilates",
    });
    const report = buildTeamFinanceReport({
      from: "2039-01-01",
      to: "2039-01-31",
      sources: {
        sessions: [session("Carla"), session("Ana")],
        commissions: [],
        pendingCommissions: [],
      },
      plans: [],
      singleSessionPrices,
      groups: [group("Turma B", 2), group("Turma A", 2)],
      enrollments: [],
    });
    expect(report.byProfessional.map((item) => item.name)).toEqual([
      "Ana",
      "Carla",
    ]);
    expect(report.byGroup.map((item) => item.id)).toEqual([
      "Turma A",
      "Turma B",
    ]);
  });
});
