import { describe, expect, it } from "vitest";
import { DomainError } from "../../repository.js";
import {
  buildRetentionReport,
  resolveRetentionPeriod,
  type RetentionReportSources,
} from "./retention-report.js";

type AppointmentSource = RetentionReportSources["appointments"][number];
type PlanSource = RetentionReportSources["plans"][number];

const visit = (
  patientId: string | undefined,
  startsAt: string,
  status: AppointmentSource["status"] = "completed",
): AppointmentSource => ({
  ...(patientId ? { patientId } : {}),
  startsAt,
  status,
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
  sources: Partial<RetentionReportSources>,
  from = "2026-02-01",
  to = "2026-05-31",
  today = "2026-06-15",
) {
  return buildRetentionReport(
    { from, to },
    { appointments: [], plans: [], ...sources },
    today,
    generatedAt,
  );
}

const month = (result: ReturnType<typeof report>, value: string) => {
  const found = result.months.find((item) => item.month === value);
  if (!found) throw new Error(`mês ${value} ausente`);
  return found;
};

describe("buildRetentionReport", () => {
  it("lists every month of the period with zeroes when there is no data", () => {
    const result = report({});
    expect(result).toMatchObject({
      generatedAt: generatedAt.toISOString(),
      from: "2026-02-01",
      to: "2026-05-31",
      startMonth: "2026-02",
      endMonth: "2026-05",
      totals: {
        newClients: 0,
        lostClients: 0,
        cancelledPlans: 0,
        cancelledValueInCents: 0,
      },
    });
    expect(result.months.map((item) => item.month)).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
    expect(result.months[0]).toEqual({
      month: "2026-02",
      activeClients: 0,
      newClients: 0,
      lostClients: 0,
      retentionRate: null,
      cancelledPlans: 0,
      cancelledValueInCents: 0,
    });
  });

  it("counts active clients by completed appointment, in the clinic time zone", () => {
    const result = report({
      appointments: [
        visit("a", "2026-02-10T13:00:00.000Z"),
        visit("a", "2026-02-20T13:00:00.000Z"),
        visit("b", "2026-02-11T13:00:00.000Z"),
        // 31/03 às 22h em São Paulo: ainda é março.
        visit("c", "2026-04-01T01:00:00.000Z"),
        visit("d", "2026-03-05T13:00:00.000Z", "scheduled"),
        visit("e", "2026-03-05T13:00:00.000Z", "cancelled"),
        visit("f", "2026-03-05T13:00:00.000Z", "no_show"),
      ],
    });
    expect(month(result, "2026-02").activeClients).toBe(2);
    expect(month(result, "2026-03").activeClients).toBe(1);
    expect(month(result, "2026-04").activeClients).toBe(0);
  });

  it("leaves lead appointments out", () => {
    const result = report({
      appointments: [visit(undefined, "2026-03-05T13:00:00.000Z")],
    });
    expect(result.months.every((item) => item.activeClients === 0)).toBe(true);
    expect(result.totals.newClients).toBe(0);
  });

  it("counts a plan as active in every month it is valid, until cancellation", () => {
    const result = report({
      plans: [
        plan({
          patientId: "a",
          validFrom: "2026-02-20",
          validUntil: "2026-04-01",
        }),
        // Sem fim de validade: vigente até hoje.
        plan({ patientId: "b", validFrom: "2026-03-15" }),
        // Cancelado em abril (horário de São Paulo, 30/04 às 21h).
        plan({
          patientId: "c",
          status: "cancelled",
          validFrom: "2026-01-10",
          cancelledAt: "2026-05-01T00:00:00.000Z",
          cancelledValueInCents: 5_000,
        }),
        // Cancelado antes de começar: nunca ficou ativo.
        plan({
          patientId: "d",
          status: "cancelled",
          validFrom: "2026-04-10",
          validUntil: "2026-05-10",
          cancelledAt: "2026-03-20T15:00:00.000Z",
          cancelledValueInCents: 2_000,
        }),
        // Pausado conta como vigente (não há histórico de pausas).
        plan({ patientId: "e", status: "paused", validFrom: "2026-05-02" }),
        // Expirado: vale o período de validade.
        plan({
          patientId: "f",
          status: "expired",
          validFrom: "2026-01-01",
          validUntil: "2026-02-28",
        }),
      ],
    });
    expect(result.months.map((item) => item.activeClients)).toEqual([
      3, 3, 3, 2,
    ]);
    expect(month(result, "2026-02")).toMatchObject({ newClients: 1 });
    expect(month(result, "2026-03")).toMatchObject({
      newClients: 1,
      lostClients: 1,
      cancelledPlans: 1,
      cancelledValueInCents: 2_000,
    });
    expect(month(result, "2026-04")).toMatchObject({
      newClients: 0,
      lostClients: 0,
      retentionRate: 1,
      cancelledPlans: 1,
      cancelledValueInCents: 5_000,
    });
    expect(month(result, "2026-05")).toMatchObject({
      newClients: 1,
      lostClients: 2,
      retentionRate: 1 / 3,
    });
    expect(result.totals).toEqual({
      newClients: 3,
      lostClients: 3,
      cancelledPlans: 2,
      cancelledValueInCents: 7_000,
    });
  });

  it("counts new clients by the first activity, even before the period", () => {
    const result = report({
      appointments: [
        // Primeiro atendimento em janeiro: em março não é novo.
        visit("a", "2026-01-10T13:00:00.000Z"),
        visit("a", "2026-03-10T13:00:00.000Z"),
        // Primeiro atendimento em março.
        visit("b", "2026-03-11T13:00:00.000Z"),
        visit("b", "2026-04-11T13:00:00.000Z"),
      ],
      plans: [
        // Plano em abril, mas o primeiro atendimento foi em março.
        plan({
          patientId: "b",
          validFrom: "2026-04-01",
          validUntil: "2026-04-30",
        }),
        // Primeiro plano em abril, sem atendimento.
        plan({
          patientId: "c",
          validFrom: "2026-04-05",
          validUntil: "2026-04-30",
        }),
        // Renovação não faz o cliente ficar novo de novo.
        plan({
          patientId: "c",
          validFrom: "2026-05-01",
          validUntil: "2026-05-31",
        }),
      ],
    });
    expect(result.months.map((item) => item.newClients)).toEqual([0, 1, 1, 0]);
  });

  it("computes lost clients and retention against the previous month", () => {
    const result = report({
      appointments: [
        // Janeiro (mês anterior ao período): a, b, c, d.
        ...["a", "b", "c", "d"].map((id) =>
          visit(id, "2026-01-15T13:00:00.000Z"),
        ),
        // Fevereiro: a, b, c e o novo e.
        ...["a", "b", "c", "e"].map((id) =>
          visit(id, "2026-02-15T13:00:00.000Z"),
        ),
        // Março: só a; d volta.
        ...["a", "d"].map((id) => visit(id, "2026-03-15T13:00:00.000Z")),
      ],
    });
    expect(month(result, "2026-02")).toMatchObject({
      activeClients: 4,
      newClients: 1,
      lostClients: 1,
      retentionRate: 0.75,
    });
    expect(month(result, "2026-03")).toMatchObject({
      activeClients: 2,
      newClients: 0,
      lostClients: 3,
      retentionRate: 0.25,
    });
    expect(month(result, "2026-04")).toMatchObject({
      activeClients: 0,
      lostClients: 2,
      retentionRate: 0,
    });
    expect(month(result, "2026-05")).toMatchObject({
      activeClients: 0,
      lostClients: 0,
      retentionRate: null,
    });
  });

  it("does not report months after the current one", () => {
    const result = report(
      { plans: [plan({ patientId: "a", validFrom: "2026-01-01" })] },
      "2026-05-10",
      "2026-08-20",
      "2026-06-15",
    );
    expect(result.endMonth).toBe("2026-06");
    expect(result.months.map((item) => item.month)).toEqual([
      "2026-05",
      "2026-06",
    ]);
    const future = report({}, "2026-07-01", "2026-08-31", "2026-06-15");
    expect(future.months).toEqual([]);
  });
});

describe("resolveRetentionPeriod", () => {
  it("defaults to the last six months up to today", () => {
    expect(resolveRetentionPeriod({}, "2026-03-10")).toEqual({
      from: "2025-10-01",
      to: "2026-03-10",
    });
    expect(resolveRetentionPeriod({ to: "2026-08-31" }, "2026-03-10")).toEqual({
      from: "2026-03-01",
      to: "2026-08-31",
    });
    expect(
      resolveRetentionPeriod({ from: "2026-01-05" }, "2026-03-10"),
    ).toEqual({
      from: "2026-01-05",
      to: "2026-03-10",
    });
  });

  it("rejects an inverted period or one longer than 24 months", () => {
    const attempt = (filter: { from?: string; to?: string }) => {
      try {
        resolveRetentionPeriod(filter, "2026-03-10");
        return null;
      } catch (error) {
        return error;
      }
    };
    const inverted = attempt({ from: "2026-04-01" });
    expect(inverted).toBeInstanceOf(DomainError);
    expect(inverted).toMatchObject({ statusCode: 400 });
    expect(attempt({ from: "2024-04-01", to: "2026-03-31" })).toBeNull();
    expect(attempt({ from: "2024-03-31", to: "2026-03-01" })).toMatchObject({
      code: "RETENTION_PERIOD_TOO_LONG",
      statusCode: 400,
    });
  });
});
