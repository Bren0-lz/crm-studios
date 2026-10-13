import { describe, expect, it } from "vitest";
import { DomainError } from "../../repository.js";
import {
  ageBandOf,
  ageOn,
  buildClientReport,
  resolveClientReportPeriod,
  type ClientReportSources,
} from "./client-report.js";

type AppointmentSource = ClientReportSources["appointments"][number];
type PaymentSource = ClientReportSources["payments"][number];
type PlanSource = ClientReportSources["plans"][number];

const visit = (
  patientId: string | undefined,
  startsAt: string,
  status: AppointmentSource["status"] = "completed",
): AppointmentSource => ({
  ...(patientId ? { patientId } : {}),
  patientName: patientId ? `Nome ${patientId}` : "Lead",
  startsAt,
  status,
});

const payment = (
  patientId: string,
  occurredAt: string,
  amountInCents: number,
  kind: PaymentSource["kind"] = "payment",
): PaymentSource => ({
  patientId,
  patientName: `Nome ${patientId}`,
  kind,
  occurredAt,
  amountInCents,
});

const plan = (
  overrides: Partial<PlanSource> & { patientId: string },
): PlanSource => ({
  status: "active",
  validFrom: "2026-01-01",
  ...overrides,
});

const generatedAt = new Date("2026-06-15T15:00:00.000Z");

function report(
  sources: Partial<ClientReportSources>,
  from = "2026-03-01",
  to = "2026-03-31",
) {
  return buildClientReport(
    { from, to },
    { patients: [], appointments: [], plans: [], payments: [], ...sources },
    "America/Sao_Paulo",
    generatedAt,
  );
}

const bands = (result: ReturnType<typeof report>) =>
  Object.fromEntries(
    result.ageDistribution.map((item) => [item.band, item.clients]),
  );

describe("resolveClientReportPeriod", () => {
  it("applies the retention defaults and rejects an inverted period", () => {
    expect(resolveClientReportPeriod({}, "2026-06-15")).toEqual({
      from: "2026-01-01",
      to: "2026-06-15",
    });
    expect(
      resolveClientReportPeriod({ to: "2026-03-10" }, "2026-06-15"),
    ).toEqual({
      from: "2025-10-01",
      to: "2026-03-10",
    });
    expect(() =>
      resolveClientReportPeriod(
        { from: "2026-04-01", to: "2026-03-01" },
        "2026-06-15",
      ),
    ).toThrow(DomainError);
  });
});

describe("ageOn and ageBandOf", () => {
  it("counts full years on the given date", () => {
    expect(ageOn("2000-03-31", "2026-03-31")).toBe(26);
    expect(ageOn("2000-04-01", "2026-03-31")).toBe(25);
    expect(ageOn("", "2026-03-31")).toBeNull();
    expect(ageOn(undefined, "2026-03-31")).toBeNull();
    expect(ageOn("2027-01-01", "2026-03-31")).toBeNull();
  });

  it("maps ages to the bands, inclusive at the edges", () => {
    expect(ageBandOf(0)).toBe("0-17");
    expect(ageBandOf(17)).toBe("0-17");
    expect(ageBandOf(18)).toBe("18-29");
    expect(ageBandOf(29)).toBe("18-29");
    expect(ageBandOf(30)).toBe("30-44");
    expect(ageBandOf(44)).toBe("30-44");
    expect(ageBandOf(45)).toBe("45-59");
    expect(ageBandOf(59)).toBe("45-59");
    expect(ageBandOf(60)).toBe("60+");
    expect(ageBandOf(null)).toBe("unknown");
  });
});

describe("buildClientReport", () => {
  it("ranks completed sessions in the period on the clinic day, ignoring leads", () => {
    const result = report({
      patients: [
        { id: "a", fullName: "Ana", birthDate: "" },
        { id: "b", fullName: "Bruno", birthDate: "" },
      ],
      appointments: [
        visit("a", "2026-03-05T13:00:00.000Z"),
        visit("a", "2026-03-06T13:00:00.000Z"),
        visit("b", "2026-03-07T13:00:00.000Z"),
        // 21h de 31/03 em São Paulo (já 01/04 em UTC): conta.
        visit("b", "2026-04-01T00:30:00.000Z"),
        // 22h de 28/02 em São Paulo: fora.
        visit("b", "2026-03-01T01:00:00.000Z"),
        visit("b", "2026-03-08T13:00:00.000Z", "scheduled"),
        visit("b", "2026-03-09T13:00:00.000Z", "no_show"),
        visit(undefined, "2026-03-10T13:00:00.000Z"),
      ],
    });
    expect(result.topBySessions).toEqual([
      { patientId: "a", patientName: "Ana", completedSessions: 2 },
      { patientId: "b", patientName: "Bruno", completedSessions: 2 },
    ]);
    expect(result).toMatchObject({
      from: "2026-03-01",
      to: "2026-03-31",
      generatedAt: generatedAt.toISOString(),
    });
  });

  it("keeps only the top 20 in each ranking, highest first", () => {
    const appointments: AppointmentSource[] = [];
    const payments: PaymentSource[] = [];
    for (let index = 1; index <= 25; index += 1) {
      const id = `p${String(index).padStart(2, "0")}`;
      for (let count = 0; count < index; count += 1)
        appointments.push(visit(id, "2026-03-10T13:00:00.000Z"));
      payments.push(payment(id, "2026-03-10T13:00:00.000Z", index * 1_000));
    }
    const result = report({ appointments, payments });
    expect(result.topBySessions).toHaveLength(20);
    expect(result.topBySessions[0]).toMatchObject({
      patientId: "p25",
      patientName: "Nome p25",
      completedSessions: 25,
    });
    expect(result.topBySessions.at(-1)?.patientId).toBe("p06");
    expect(result.topByRevenue).toHaveLength(20);
    expect(result.topByRevenue[0]).toMatchObject({
      patientId: "p25",
      receivedInCents: 25_000,
    });
    expect(result.topByRevenue.at(-1)?.patientId).toBe("p06");
  });

  it("ranks payments minus reversals by the event day, dropping non-positive totals", () => {
    const result = report({
      patients: [{ id: "a", fullName: "Ana", birthDate: "" }],
      payments: [
        payment("a", "2026-03-05T13:00:00.000Z", 10_000),
        payment("a", "2026-03-06T13:00:00.000Z", 4_000),
        payment("a", "2026-03-07T13:00:00.000Z", -4_000, "reversal"),
        payment("b", "2026-03-05T13:00:00.000Z", 7_000),
        // Estorno gravado com valor positivo também desconta.
        payment("b", "2026-03-06T13:00:00.000Z", 2_000, "reversal"),
        payment("c", "2026-03-05T13:00:00.000Z", 3_000),
        payment("c", "2026-03-06T13:00:00.000Z", -3_000, "reversal"),
        // 22h de 28/02 em São Paulo: fora.
        payment("d", "2026-03-01T01:00:00.000Z", 50_000),
        // Estorno fora do período não desconta o pagamento de dentro.
        payment("e", "2026-03-20T13:00:00.000Z", 1_000),
        payment("e", "2026-04-02T13:00:00.000Z", -1_000, "reversal"),
      ],
    });
    expect(result.topByRevenue).toEqual([
      { patientId: "a", patientName: "Ana", receivedInCents: 10_000 },
      { patientId: "b", patientName: "Nome b", receivedInCents: 5_000 },
      { patientId: "e", patientName: "Nome e", receivedInCents: 1_000 },
    ]);
  });

  it("distributes active clients by age band on the period end", () => {
    const result = report({
      patients: [
        { id: "kid", fullName: "Criança", birthDate: "2010-04-01" },
        { id: "young", fullName: "Jovem", birthDate: "2008-03-31" },
        { id: "adult", fullName: "Adulto", birthDate: "1990-01-01" },
        { id: "mid", fullName: "Meia-idade", birthDate: "1975-06-01" },
        { id: "senior", fullName: "Sênior", birthDate: "1966-03-31" },
        { id: "nodate", fullName: "Sem data", birthDate: "" },
        { id: "inactive", fullName: "Inativo", birthDate: "1990-01-01" },
        { id: "late", fullName: "Plano futuro", birthDate: "1990-01-01" },
        { id: "gone", fullName: "Plano antigo", birthDate: "1990-01-01" },
        {
          id: "cancelled",
          fullName: "Cancelado antes",
          birthDate: "1990-01-01",
        },
      ],
      appointments: [
        // 15 anos (faz 16 só em 01/04).
        visit("kid", "2026-03-10T13:00:00.000Z"),
        // 18 anos exatamente em 31/03.
        visit("young", "2026-03-10T13:00:00.000Z"),
        visit("young", "2026-03-11T13:00:00.000Z"),
        visit("nodate", "2026-03-10T13:00:00.000Z"),
        visit("inactive", "2026-03-10T13:00:00.000Z", "cancelled"),
        // Lead não entra.
        visit(undefined, "2026-03-10T13:00:00.000Z"),
      ],
      plans: [
        // Plano em aberto desde antes do período.
        plan({ patientId: "adult", validFrom: "2025-01-01" }),
        // Pausado conta como vigente; termina no 1º dia do período.
        plan({
          patientId: "mid",
          status: "paused",
          validFrom: "2026-01-01",
          validUntil: "2026-03-01",
        }),
        // 60 anos exatamente em 31/03, plano começa no último dia.
        plan({ patientId: "senior", validFrom: "2026-03-31" }),
        plan({ patientId: "late", validFrom: "2026-04-01" }),
        plan({
          patientId: "gone",
          validFrom: "2026-01-01",
          validUntil: "2026-02-28",
        }),
        // Cancelado em 27/02 (São Paulo): já não vigora em março.
        plan({
          patientId: "cancelled",
          status: "cancelled",
          validFrom: "2026-01-01",
          cancelledAt: "2026-02-27T15:00:00.000Z",
        }),
      ],
    });
    expect(result.activeClients).toBe(6);
    expect(bands(result)).toEqual({
      "0-17": 1,
      "18-29": 1,
      "30-44": 1,
      "45-59": 1,
      "60+": 1,
      unknown: 1,
    });
    expect(result.ageDistribution.map((item) => item.label)).toEqual([
      "0 a 17 anos",
      "18 a 29 anos",
      "30 a 44 anos",
      "45 a 59 anos",
      "60 anos ou mais",
      "Sem data de nascimento",
    ]);
  });

  it("puts clients missing from the registry in the no-date band and returns zeros when empty", () => {
    const withUnknown = report({
      appointments: [visit("ghost", "2026-03-10T13:00:00.000Z")],
    });
    expect(withUnknown.activeClients).toBe(1);
    expect(bands(withUnknown).unknown).toBe(1);
    expect(withUnknown.topBySessions[0]?.patientName).toBe("Nome ghost");

    const empty = report({});
    expect(empty.topBySessions).toEqual([]);
    expect(empty.topByRevenue).toEqual([]);
    expect(empty.activeClients).toBe(0);
    expect(empty.ageDistribution.every((item) => item.clients === 0)).toBe(
      true,
    );
    expect(empty.ageDistribution).toHaveLength(6);
  });
});
