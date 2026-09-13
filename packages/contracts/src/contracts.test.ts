import { describe, expect, it } from "vitest";
import {
  appointmentInputSchema,
  clinicalRecordInputSchema,
  groupSessionSeriesInputSchema,
  leadMoveSchema,
  patientPlanInputSchema,
  patientTabCloseInputSchema,
  patientInputSchema,
} from "./index.js";

describe("shared contracts", () => {
  it("normalizes a valid patient", () => {
    const result = patientInputSchema.parse({
      fullName: "  Maria da Silva  ",
      phone: "(11) 99999-9999",
      tags: ["Pilates"],
    });

    expect(result.fullName).toBe("Maria da Silva");
    expect(result.tags).toEqual(["Pilates"]);
  });

  it("rejects an appointment with invalid identifiers", () => {
    expect(() =>
      appointmentInputSchema.parse({
        patientId: "1",
        professionalId: "2",
        roomId: "3",
        serviceId: "4",
        startsAt: "2026-09-12T10:00:00-03:00",
      }),
    ).toThrow();
  });

  it("accepts SOAP notes and limits the pain scale", () => {
    const valid = clinicalRecordInputSchema.parse({
      appointmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      subjective: "Dor ao caminhar.",
      objective: "Mobilidade reduzida.",
      assessment: "Evolução favorável.",
      plan: "Progressão de carga.",
      painScale: 4,
    });
    expect(valid.painScale).toBe(4);
    expect(() =>
      clinicalRecordInputSchema.parse({
        appointmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        painScale: 11,
      }),
    ).toThrow();
  });

  it("validates plan dates and installment limits", () => {
    const base = {
      patientId: "99999999-9999-4999-8999-999999999999",
      serviceId: "77777777-7777-4777-8777-777777777777",
      name: "Pacote trimestral",
      kind: "fixed_package",
      totalSessions: 12,
      validFrom: "2026-09-01",
      totalValueInCents: 180000,
      installments: 3,
      firstDueDate: "2026-09-05",
    };
    expect(patientPlanInputSchema.parse(base).totalSessions).toBe(12);
    expect(() =>
      patientPlanInputSchema.parse({
        ...base,
        validUntil: "2026-08-31",
      }),
    ).toThrow();
  });

  it("requires a reason when a lead is lost", () => {
    expect(() => leadMoveSchema.parse({ stage: "lost" })).toThrow();
    expect(
      leadMoveSchema.parse({ stage: "lost", lostReason: "Sem retorno" }).stage,
    ).toBe("lost");
  });

  it("limits recurring group sessions", () => {
    const base = {
      groupId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      startsAt: "2026-09-12T10:00:00-03:00",
      occurrences: 4,
    };
    expect(groupSessionSeriesInputSchema.parse(base).intervalWeeks).toBe(1);
    expect(() =>
      groupSessionSeriesInputSchema.parse({ ...base, occurrences: 53 }),
    ).toThrow();
  });

  it("requires a payment method for immediately paid tabs", () => {
    expect(() =>
      patientTabCloseInputSchema.parse({
        settlement: "paid",
        dueDate: "2026-09-12",
      }),
    ).toThrow();
    expect(
      patientTabCloseInputSchema.parse({
        settlement: "receivable",
        dueDate: "2026-09-12",
      }).settlement,
    ).toBe("receivable");
  });
});
