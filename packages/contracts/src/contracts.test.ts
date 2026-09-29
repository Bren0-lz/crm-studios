import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appointmentInputSchema,
  contactActivityInputSchema,
  contactOutcomeSchema,
  contactReasonSchema,
  defaultRelationshipSettings,
  fillMessageTemplate,
  relationshipSettingsSchema,
  saoPauloToday,
  whatsappLink,
  clinicalRecordInputSchema,
  describeGroupSchedule,
  formatPhone,
  groupClassName,
  groupClassInputSchema,
  groupClassUpdateSchema,
  groupLetter,
  leadMoveSchema,
  nextPlanPeriod,
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
    expect(groupClassName("Pilates", 2)).toBe("Pilates Turma B");
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
    expect(patientInputSchema.parse({ fullName: "Maria da Silva", phone: "11999999999", whatsapp: "(11) 3333-4444" }).whatsapp).toBe("1133334444");
    expect(() => patientInputSchema.parse({ fullName: "Maria da Silva", phone: "11999999999", whatsapp: "3333-4444" })).toThrow();
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

  it("requires an end date for automatic renewal", () => {
    const base = {
      patientId: "99999999-9999-4999-8999-999999999999",
      serviceId: "77777777-7777-4777-8777-777777777777",
      name: "Mensalidade",
      kind: "recurring",
      totalSessions: 8,
      validFrom: "2026-09-01",
      totalValueInCents: 40000,
      installments: 1,
      firstDueDate: "2026-09-05",
      autoRenew: true,
    };
    expect(() => patientPlanInputSchema.parse(base)).toThrow();
    expect(
      patientPlanInputSchema.parse({ ...base, validUntil: "2026-09-30" })
        .autoRenew,
    ).toBe(true);
  });

  it("computes the next plan period by months or by days", () => {
    expect(
      nextPlanPeriod({
        validFrom: "2026-03-01",
        validUntil: "2026-05-31",
        firstDueDate: "2026-03-10",
      }),
    ).toEqual({
      validFrom: "2026-06-01",
      validUntil: "2026-08-31",
      firstDueDate: "2026-06-10",
    });
    expect(
      nextPlanPeriod({
        validFrom: "2026-01-15",
        validUntil: "2026-02-14",
        firstDueDate: "2026-01-15",
      }),
    ).toEqual({
      validFrom: "2026-02-15",
      validUntil: "2026-03-14",
      firstDueDate: "2026-02-15",
    });
    expect(
      nextPlanPeriod({
        validFrom: "2026-09-01",
        validUntil: "2026-10-15",
        firstDueDate: "2026-09-11",
      }),
    ).toEqual({
      validFrom: "2026-10-16",
      validUntil: "2026-11-29",
      firstDueDate: "2026-10-26",
    });
    expect(
      nextPlanPeriod({ validFrom: "2026-09-01", firstDueDate: "2026-09-01" }),
    ).toBeNull();
  });

  it("requires a reason when a lead is lost", () => {
    expect(() => leadMoveSchema.parse({ stage: "lost" })).toThrow();
    expect(
      leadMoveSchema.parse({ stage: "lost", lostReason: "Sem retorno" }).stage,
    ).toBe("lost");
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

describe("relationship center contracts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const patientId = "11111111-1111-4111-8111-111111111111";

  it("lists every contact reason and outcome", () => {
    expect(contactReasonSchema.options).toEqual([
      "birthday",
      "single_no_return",
      "plan_expiring",
      "low_balance",
      "expired_with_balance",
      "treatment_paused",
      "repeated_no_show",
      "former_client",
      "overdue_payment",
      "nps_detractor",
    ]);
    expect(contactOutcomeSchema.options).toEqual([
      "contacted",
      "no_answer",
      "scheduled",
      "not_interested",
      "snoozed",
      "dismissed",
    ]);
  });

  it("ships default deadlines and one message per reason", () => {
    expect(defaultRelationshipSettings).toMatchObject({
      birthdayDaysAhead: 7,
      singleNoReturnDays: 60,
      planExpiringDays: 7,
      lowBalanceSessions: 2,
      expiredWithBalanceDays: 60,
      treatmentPausedDays: 30,
      repeatedNoShowCount: 2,
      repeatedNoShowWindowDays: 30,
      formerClientMinDays: 30,
      formerClientMaxDays: 90,
    });
    for (const reason of contactReasonSchema.options) {
      expect(defaultRelationshipSettings.messages[reason]).toContain("{{nome}}");
    }
    expect(relationshipSettingsSchema.parse(defaultRelationshipSettings)).toEqual(
      defaultRelationshipSettings,
    );
  });

  it("validates relationship settings", () => {
    expect(() =>
      relationshipSettingsSchema.parse({
        ...defaultRelationshipSettings,
        formerClientMinDays: 100,
        formerClientMaxDays: 90,
      }),
    ).toThrow();
    expect(() =>
      relationshipSettingsSchema.parse({ ...defaultRelationshipSettings, singleNoReturnDays: 0 }),
    ).toThrow();
    expect(() =>
      relationshipSettingsSchema.parse({
        ...defaultRelationshipSettings,
        messages: { ...defaultRelationshipSettings.messages, birthday: "  " },
      }),
    ).toThrow();
  });

  it("computes today in the clinic time zone", () => {
    expect(saoPauloToday(new Date("2026-09-30T02:30:00Z"))).toBe("2026-09-29");
    expect(saoPauloToday(new Date("2026-09-30T03:30:00Z"))).toBe("2026-09-30");
  });

  it("requires a future snooze date only when snoozed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T02:30:00Z"));
    const base = { patientId, reason: "plan_expiring", referenceKey: "plan-1" };
    expect(contactActivityInputSchema.parse({ ...base, outcome: "contacted", notes: "Ligou" }))
      .toMatchObject({ outcome: "contacted", notes: "Ligou" });
    expect(() => contactActivityInputSchema.parse({ ...base, outcome: "snoozed" })).toThrow();
    expect(() =>
      contactActivityInputSchema.parse({ ...base, outcome: "snoozed", snoozeUntil: "2026-09-29" }),
    ).toThrow();
    expect(
      contactActivityInputSchema.parse({ ...base, outcome: "snoozed", snoozeUntil: "2026-09-30" })
        .snoozeUntil,
    ).toBe("2026-09-30");
    expect(() =>
      contactActivityInputSchema.parse({ ...base, reason: "unknown", outcome: "contacted" }),
    ).toThrow();
    expect(() =>
      contactActivityInputSchema.parse({ ...base, referenceKey: "", outcome: "contacted" }),
    ).toThrow();
  });

  it("builds WhatsApp links without duplicating the country code", () => {
    expect(whatsappLink("(11) 99999-8888", "Olá, Ana!")).toBe(
      "https://wa.me/5511999998888?text=Ol%C3%A1%2C%20Ana!",
    );
    expect(whatsappLink("+55 11 99999-8888", "Oi")).toBe(
      "https://wa.me/5511999998888?text=Oi",
    );
    expect(whatsappLink("5511333344444", "Oi")).toBe("https://wa.me/5511333344444?text=Oi");
    expect(whatsappLink("(55) 3333-4444", "Oi")).toBe("https://wa.me/555533334444?text=Oi");
  });

  it("fills message templates", () => {
    expect(fillMessageTemplate("Oi, {{nome}}! Até {{ data }}.", { nome: "Ana", data: "01/10" }))
      .toBe("Oi, Ana! Até 01/10.");
    expect(fillMessageTemplate("Oi, {{nome}} {{outro}}", { nome: "Ana" })).toBe(
      "Oi, Ana {{outro}}",
    );
  });
});
