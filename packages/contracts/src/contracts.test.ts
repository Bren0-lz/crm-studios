import { describe, expect, it } from "vitest";
import {
  appointmentInputSchema,
  clinicalRecordInputSchema,
  describeGroupSchedule,
  formatPhone,
  groupClassName,
  groupClassInputSchema,
  groupClassUpdateSchema,
  groupLetter,
  groupSessionSeriesInputSchema,
  leadMoveSchema,
  patientPlanInputSchema,
  patientTabCloseInputSchema,
  phoneDigits,
  patientInputSchema,
} from "./index.js";

describe("shared contracts", () => {
  it("names groups with a per-service letter", () => {
    expect(groupLetter(1)).toBe("A");
    expect(groupLetter(26)).toBe("Z");
    expect(groupLetter(27)).toBe("AA");
    expect(groupClassName("Pilates", 2)).toBe("Pilates · Turma B");
  });

  it("describes group schedules by weekdays and period", () => {
    expect(describeGroupSchedule([])).toBe("Horários ainda não definidos");
    expect(describeGroupSchedule([
      { weekday: 4, startTime: "09:00" },
      { weekday: 2, startTime: "08:00" },
    ])).toBe("Turma de terça e quinta da manhã");
    expect(describeGroupSchedule([
      { weekday: 0, startTime: "10:00" },
      { weekday: 1, startTime: "07:30" },
      { weekday: 3, startTime: "11:59" },
    ])).toBe("Turma de segunda, quarta e domingo da manhã");
    expect(describeGroupSchedule([
      { weekday: 5, startTime: "19:00" },
      { weekday: 1, startTime: "08:00" },
      { weekday: 3, startTime: "08:00" },
      { weekday: 6, startTime: "12:00" },
    ])).toBe("Turma de segunda e quarta da manhã, sábado da tarde e sexta da noite");
  });

  it("requires distinct weekly hours for a group", () => {
    const input = {
      serviceId: "77777777-7777-4777-8777-777777777777",
      professionalId: "33333333-3333-4333-8333-333333333333",
      roomId: "55555555-5555-4555-8555-555555555555",
      capacity: 8,
      weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
    };
    expect(groupClassInputSchema.parse(input).weeklySlots).toEqual(input.weeklySlots);
    expect(() => groupClassInputSchema.parse({ ...input, weeklySlots: [] })).toThrow();
    expect(() => groupClassUpdateSchema.parse({ capacity: 8, weeklySlots: [...input.weeklySlots, ...input.weeklySlots] })).toThrow();
    expect(() => groupClassUpdateSchema.parse({ capacity: 8, weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "18:00" }] })).toThrow();
    expect(() => groupClassUpdateSchema.parse({ capacity: 8, weeklySlots: [{ weekday: 2, startTime: "18:00" }] })).toThrow();
    expect(() => groupClassUpdateSchema.parse({ capacity: 8, weeklySlots: [...input.weeklySlots, { weekday: 2, startTime: "18:30", endTime: "19:30" }] })).toThrow();
    expect(groupClassUpdateSchema.parse({ capacity: 8, weeklySlots: [...input.weeklySlots, { weekday: 2, startTime: "19:00", endTime: "20:00" }] }).weeklySlots).toHaveLength(2);
  });

  it("normalizes a valid patient", () => {
    const result = patientInputSchema.parse({
      fullName: "  Maria da Silva  ",
      phone: "(11) 99999-9999",
      tags: ["Pilates"],
    });

    expect(result.fullName).toBe("Maria da Silva");
    expect(result.phone).toBe("11999999999");
    expect(result.tags).toEqual(["Pilates"]);
    expect(() => patientInputSchema.parse({ fullName: "Maria da Silva", phone: "9999-9999" })).toThrow();
    expect(patientInputSchema.parse({ fullName: "Maria da Silva", phone: "11 3333 4444", emergencyContactPhone: "" }).emergencyContactPhone).toBe("");
  });

  it("formats Brazilian phone numbers while typing", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("1")).toBe("(1");
    expect(formatPhone("1199")).toBe("(11) 99");
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
    expect(formatPhone("11999998888")).toBe("(11) 99999-8888");
    expect(formatPhone("(11) 99999-88887")).toBe("(11) 99999-8888");
    expect(phoneDigits("(11) 3333-4444")).toBe("1133334444");
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
    expect(() =>
      groupSessionSeriesInputSchema.parse({ ...base, endsAt: "2026-09-12T09:30:00-03:00" }),
    ).toThrow();
    expect(
      groupSessionSeriesInputSchema.parse({ ...base, endsAt: "2026-09-12T11:30:00-03:00" }).endsAt,
    ).toBe("2026-09-12T11:30:00-03:00");
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
