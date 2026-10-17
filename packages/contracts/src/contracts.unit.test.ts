import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PATIENT_TAG_COLOR,
  patientTagDisplayColor,
  adminUserInputSchema,
  adminUserUpdateSchema,
  appModuleLabels,
  appModuleSchema,
  appointmentInputSchema,
  broadcastInputSchema,
  broadcastSkipReasonLabels,
  broadcastSkipReasons,
  clinicSettingsInputSchema,
  formatTaxId,
  isValidCnpj,
  isValidTaxId,
  clinicalRecordInputSchema,
  contactActivityInputSchema,
  contactOutcomeSchema,
  contactReasonSchema,
  cpfDigits,
  defaultRelationshipSettings,
  describeGroupSchedule,
  effectiveEditModules,
  effectiveModules,
  fillMessageTemplate,
  fillPatientMessage,
  patientFirstName,
  formatCpf,
  formatPhone,
  groupClassInputSchema,
  groupClassName,
  groupClassUpdateSchema,
  groupLetter,
  guidedPatientInputSchema,
  isValidCpf,
  leadMoveSchema,
  nextPlanPeriod,
  patientDefaultExportColumns,
  patientExportFilterSchema,
  patientInputSchema,
  patientListQuerySchema,
  patientPlanInputSchema,
  patientTabCloseInputSchema,
  patientTagInputSchema,
  patientTagKey,
  patientTagUpdateSchema,
  phoneDigits,
  recurringPayableCompetences,
  recurringPayableDueDate,
  relationshipSettingsSchema,
  resolvePatientTags,
  saoPauloToday,
  userRoleLabels,
  userRoleSchema,
  whatsappLink,
} from "./index.js";

describe("shared contracts", () => {
  it("parses a segmented broadcast with defaults and empty optional filters", () => {
    expect(
      broadcastInputSchema.parse({ channel: "email", body: " Oi, {{nome}} " }),
    ).toEqual({
      segment: { tags: [], birthdayMonth: false },
      channel: "email",
      body: "Oi, {{nome}}",
    });
    expect(
      broadcastInputSchema.parse({
        segment: {
          tags: ["vip"],
          status: "",
          activePlan: "",
          birthdayMonth: true,
        },
        channel: "whatsapp",
        body: "Oi",
      }).segment,
    ).toEqual({ tags: ["vip"], birthdayMonth: true });
    expect(
      broadcastInputSchema.safeParse({ channel: "sms", body: "Oi" }).success,
    ).toBe(false);
    expect(
      broadcastSkipReasons.every((reason) => broadcastSkipReasonLabels[reason]),
    ).toBe(true);
  });

  it("lists the due competences of a fixed expense across years", () => {
    const model = { startMonth: "2026-11", active: true };
    expect(recurringPayableCompetences(model, "2027-02")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(recurringPayableCompetences(model, "2026-10")).toEqual([]);
    expect(
      recurringPayableCompetences({ ...model, endMonth: "2026-12" }, "2027-02"),
    ).toEqual(["2026-11", "2026-12"]);
    expect(
      recurringPayableCompetences(
        { ...model, resumedFromMonth: "2027-02" },
        "2027-02",
      ),
    ).toEqual(["2027-02"]);
    expect(
      recurringPayableCompetences({ ...model, active: false }, "2027-02"),
    ).toEqual([]);
    expect(recurringPayableDueDate("2027-02", 5)).toBe("2027-02-05");
  });

  it("names groups with a per-service letter", () => {
    expect(groupLetter(1)).toBe("A");
    expect(groupLetter(26)).toBe("Z");
    expect(groupLetter(27)).toBe("AA");
    expect(groupClassName("Pilates", 2)).toBe("Pilates Turma B");
  });

  it("describes group schedules by weekdays and period", () => {
    expect(describeGroupSchedule([])).toBe("Horários ainda não definidos");
    expect(
      describeGroupSchedule([
        { weekday: 4, startTime: "09:00" },
        { weekday: 2, startTime: "08:00" },
      ]),
    ).toBe("Turma de terça e quinta da manhã");
    expect(
      describeGroupSchedule([
        { weekday: 0, startTime: "10:00" },
        { weekday: 1, startTime: "07:30" },
        { weekday: 3, startTime: "11:59" },
      ]),
    ).toBe("Turma de segunda, quarta e domingo da manhã");
    expect(
      describeGroupSchedule([
        { weekday: 5, startTime: "19:00" },
        { weekday: 1, startTime: "08:00" },
        { weekday: 3, startTime: "08:00" },
        { weekday: 6, startTime: "12:00" },
      ]),
    ).toBe(
      "Turma de segunda e quarta da manhã, sábado da tarde e sexta da noite",
    );
  });

  it("requires distinct weekly hours for a group", () => {
    const input = {
      serviceId: "77777777-7777-4777-8777-777777777777",
      professionalId: "33333333-3333-4333-8333-333333333333",
      roomId: "55555555-5555-4555-8555-555555555555",
      capacity: 8,
      weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
    };
    expect(groupClassInputSchema.parse(input).weeklySlots).toEqual(
      input.weeklySlots,
    );
    expect(() =>
      groupClassInputSchema.parse({ ...input, weeklySlots: [] }),
    ).toThrow();
    expect(() =>
      groupClassUpdateSchema.parse({
        capacity: 8,
        weeklySlots: [...input.weeklySlots, ...input.weeklySlots],
      }),
    ).toThrow();
    expect(() =>
      groupClassUpdateSchema.parse({
        capacity: 8,
        weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "18:00" }],
      }),
    ).toThrow();
    expect(() =>
      groupClassUpdateSchema.parse({
        capacity: 8,
        weeklySlots: [{ weekday: 2, startTime: "18:00" }],
      }),
    ).toThrow();
    expect(() =>
      groupClassUpdateSchema.parse({
        capacity: 8,
        weeklySlots: [
          ...input.weeklySlots,
          { weekday: 2, startTime: "18:30", endTime: "19:30" },
        ],
      }),
    ).toThrow();
    expect(
      groupClassUpdateSchema.parse({
        capacity: 8,
        weeklySlots: [
          ...input.weeklySlots,
          { weekday: 2, startTime: "19:00", endTime: "20:00" },
        ],
      }).weeklySlots,
    ).toHaveLength(2);
  });

  it("normalizes a valid patient", () => {
    const result = patientInputSchema.parse({
      fullName: "  Maria da Silva  ",
      phone: "(11) 99999-9999",
      tags: ["Pilates"],
    });

    expect(result.fullName).toBe("Maria da Silva");
    expect(result.phone).toBe("11999999999");
    expect(
      patientInputSchema.parse({
        fullName: "Maria da Silva",
        phone: "11999999999",
        whatsapp: "(11) 3333-4444",
      }).whatsapp,
    ).toBe("1133334444");
    expect(() =>
      patientInputSchema.parse({
        fullName: "Maria da Silva",
        phone: "11999999999",
        whatsapp: "3333-4444",
      }),
    ).toThrow();
    expect(result.tags).toEqual(["Pilates"]);
    expect(() =>
      patientInputSchema.parse({
        fullName: "Maria da Silva",
        phone: "9999-9999",
      }),
    ).toThrow();
    expect(
      patientInputSchema.parse({
        fullName: "Maria da Silva",
        phone: "11 3333 4444",
        emergencyContactPhone: "",
      }).emergencyContactPhone,
    ).toBe("");
  });

  it("validates configured patient tags and compares names without case or accents", () => {
    expect(patientTagInputSchema.parse({ name: "  VIP " })).toEqual({
      name: "VIP",
      color: "#64748b",
    });
    expect(
      patientTagInputSchema.parse({ name: "VIP", color: "#A1B2C3" }).color,
    ).toBe("#a1b2c3");
    expect(
      patientTagInputSchema.safeParse({ name: "VIP", color: "red" }).success,
    ).toBe(false);
    expect(patientTagInputSchema.safeParse({ name: " " }).success).toBe(false);
    expect(
      patientTagInputSchema.safeParse({ name: "x".repeat(41) }).success,
    ).toBe(false);
    expect(patientTagUpdateSchema.safeParse({}).success).toBe(false);
    expect(patientTagUpdateSchema.parse({ color: "#000000" })).toEqual({
      color: "#000000",
    });
    expect(patientTagKey("  Pós-Operatório ")).toBe(
      patientTagKey("pos-operatorio"),
    );
    expect(patientTagKey("Dança  terapia")).toBe("danca terapia");
    expect(
      resolvePatientTags(
        ["pilates", "Pós-operatório", "PILATES", "Nova", "Nova"],
        [{ name: "Pilates" }, { name: "Pós-operatório" }],
      ),
    ).toEqual({ tags: ["Pilates", "Pós-operatório"], unknown: ["Nova"] });
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

  it("validates and formats the clinic CPF/CNPJ", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("12.345.678/0001-90")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    expect(isValidTaxId("529.982.247-25")).toBe(true);
    expect(isValidTaxId("1122233300018")).toBe(false);
    expect(formatTaxId("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatTaxId("1122233300")).toBe("112.223.330-0");
    const base = { name: "Studios Aryana", timezone: "America/Sao_Paulo" };
    expect(
      clinicSettingsInputSchema.parse({ ...base, taxId: "11222333000181" })
        .taxId,
    ).toBe("11.222.333/0001-81");
    expect(clinicSettingsInputSchema.parse({ ...base, taxId: "" }).taxId).toBe(
      "",
    );
    const invalid = clinicSettingsInputSchema.safeParse({
      ...base,
      taxId: "12.345.678/0001-90",
    });
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues[0]?.message).toBe(
      "Informe um CPF ou CNPJ válido.",
    );
  });

  it("formats, normalizes and validates Brazilian CPF numbers", () => {
    expect(cpfDigits("529.982.247-25")).toBe("52998224725");
    expect(formatCpf("5299822")).toBe("529.982.2");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(
      patientInputSchema.parse({
        fullName: "Maria da Silva",
        phone: "11999999999",
        cpf: "529.982.247-25",
      }).cpf,
    ).toBe("52998224725");
    expect(() =>
      patientInputSchema.parse({
        fullName: "Maria da Silva",
        phone: "11999999999",
        cpf: "529.982.247-24",
      }),
    ).toThrow("Informe um CPF válido.");
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
      services: [
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          totalSessions: 12,
          totalValueInCents: 180000,
        },
      ],
      planTemplateId: "aa000000-0000-4000-8000-000000000001",
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
    expect(patientPlanInputSchema.parse(base).services[0]?.totalSessions).toBe(
      12,
    );
    expect(() =>
      patientPlanInputSchema.parse({
        ...base,
        validUntil: "2026-08-31",
      }),
    ).toThrow();
  });

  it("requires an end date for automatic renewal", () => {
    const base = {
      services: [
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          totalSessions: 8,
          totalValueInCents: 40000,
        },
      ],
      planTemplateId: "aa000000-0000-4000-8000-000000000001",
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
      expect(defaultRelationshipSettings.messages[reason]).toContain(
        "{{nome}}",
      );
    }
    expect(
      relationshipSettingsSchema.parse(defaultRelationshipSettings),
    ).toEqual(defaultRelationshipSettings);
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
      relationshipSettingsSchema.parse({
        ...defaultRelationshipSettings,
        singleNoReturnDays: 0,
      }),
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
    expect(
      contactActivityInputSchema.parse({
        ...base,
        outcome: "contacted",
        notes: "Ligou",
      }),
    ).toMatchObject({ outcome: "contacted", notes: "Ligou" });
    expect(() =>
      contactActivityInputSchema.parse({ ...base, outcome: "snoozed" }),
    ).toThrow();
    expect(() =>
      contactActivityInputSchema.parse({
        ...base,
        outcome: "snoozed",
        snoozeUntil: "2026-09-29",
      }),
    ).toThrow();
    expect(
      contactActivityInputSchema.parse({
        ...base,
        outcome: "snoozed",
        snoozeUntil: "2026-09-30",
      }).snoozeUntil,
    ).toBe("2026-09-30");
    expect(() =>
      contactActivityInputSchema.parse({
        ...base,
        reason: "unknown",
        outcome: "contacted",
      }),
    ).toThrow();
    expect(() =>
      contactActivityInputSchema.parse({
        ...base,
        referenceKey: "",
        outcome: "contacted",
      }),
    ).toThrow();
  });

  it("builds WhatsApp links without duplicating the country code", () => {
    expect(whatsappLink("(11) 99999-8888", "Olá, Ana!")).toBe(
      "https://wa.me/5511999998888?text=Ol%C3%A1%2C%20Ana!",
    );
    expect(whatsappLink("+55 11 99999-8888", "Oi")).toBe(
      "https://wa.me/5511999998888?text=Oi",
    );
    expect(whatsappLink("5511333344444", "Oi")).toBe(
      "https://wa.me/5511333344444?text=Oi",
    );
    expect(whatsappLink("(55) 3333-4444", "Oi")).toBe(
      "https://wa.me/555533334444?text=Oi",
    );
  });

  it("fills message templates", () => {
    expect(
      fillMessageTemplate("Oi, {{nome}}! Até {{ data }}.", {
        nome: "Ana",
        data: "01/10",
      }),
    ).toBe("Oi, Ana! Até 01/10.");
    expect(fillMessageTemplate("Oi, {{nome}} {{outro}}", { nome: "Ana" })).toBe(
      "Oi, Ana {{outro}}",
    );
  });

  it("always fills {{nome}} with the client first name", () => {
    expect(patientFirstName("  Viviane   Araújo ")).toBe("Viviane");
    expect(patientFirstName("")).toBe("");
    expect(
      fillPatientMessage("Olá, {{nome}}! Até {{data}}.", "Viviane Araújo", {
        data: "01/10",
        nome: "Viviane Araújo",
      }),
    ).toBe("Olá, Viviane! Até 01/10.");
  });
});

describe("patient tag categories", () => {
  it("uses the manual color first and the category color only without one", () => {
    expect(
      patientTagDisplayColor({ color: "#aa3366", category: "financial" }),
    ).toBe("#aa3366");
    expect(
      patientTagDisplayColor({
        color: DEFAULT_PATIENT_TAG_COLOR,
        category: "financial",
      }),
    ).toBe("#c2410c");
    expect(patientTagDisplayColor({ color: DEFAULT_PATIENT_TAG_COLOR })).toBe(
      DEFAULT_PATIENT_TAG_COLOR,
    );
    expect(patientTagUpdateSchema.safeParse({ category: null }).success).toBe(
      true,
    );
    expect(
      patientTagUpdateSchema.safeParse({ category: "outro" }).success,
    ).toBe(false);
  });
});

describe("patient export filter", () => {
  it("defaults to CSV with every column and ignores empty parameters", () => {
    const empty = patientExportFilterSchema.parse({
      format: "",
      status: "",
      tags: "",
      birthdayMonth: "",
      activePlan: "",
      search: "",
      columns: "",
    });
    expect(empty).toEqual({
      format: "csv",
      columns: [...patientDefaultExportColumns],
    });
    expect(patientExportFilterSchema.parse({})).toEqual(empty);
  });

  it("parses lists, booleans and keeps columns in the canonical order", () => {
    expect(
      patientExportFilterSchema.parse({
        format: "xlsx",
        status: "inactive",
        tags: ["vip, pilates", "dança"],
        birthdayMonth: "true",
        activePlan: "false",
        columns: "phone,fullName,phone",
      }),
    ).toEqual({
      format: "xlsx",
      status: "inactive",
      tags: ["vip", "pilates", "dança"],
      birthdayMonth: true,
      activePlan: false,
      columns: ["fullName", "phone"],
    });
  });

  it("rejects unknown formats, columns and booleans", () => {
    for (const query of [
      { format: "pdf" },
      { columns: "fullName,senha" },
      { status: "archived" },
      { activePlan: "sim" },
    ])
      expect(patientExportFilterSchema.safeParse(query).success).toBe(false);
  });

  it("parses withoutGroup in the export and in the patient list query", () => {
    expect(
      patientExportFilterSchema.parse({ withoutGroup: "true" }).withoutGroup,
    ).toBe(true);
    expect(
      patientListQuerySchema.parse({ search: "", withoutGroup: "" }),
    ).toEqual({});
    expect(
      patientListQuerySchema.parse({ search: " Ana ", withoutGroup: "true" }),
    ).toEqual({
      search: "Ana",
      withoutGroup: true,
    });
    expect(
      patientListQuerySchema.safeParse({ withoutGroup: "sim" }).success,
    ).toBe(false);
  });
});

describe("guided patient creation", () => {
  const patient = { fullName: "Ana Souza", phone: "11999990000" };
  const serviceId = "10000000-0000-4000-8000-000000000001";
  const terms = {
    services: [
      { serviceId: serviceId, totalSessions: 8, totalValueInCents: 40000 },
    ],
    planTemplateId: "aa000000-0000-4000-8000-000000000001",
    name: "Pilates 2x",
    serviceId,
    totalSessions: 8,
    validFrom: "2026-10-01",
    validUntil: "2026-10-31",
    totalValueInCents: 40000,
    installments: 1,
    firstDueDate: "2026-10-05",
  };

  it("accepts each next step with its own data", () => {
    expect(guidedPatientInputSchema.parse({ next: "none", patient }).next).toBe(
      "none",
    );
    const demo = guidedPatientInputSchema.parse({
      next: "demonstration",
      patient,
      appointment: {
        serviceId,
        professionalId: serviceId,
        roomId: serviceId,
        startsAt: "2026-10-06T13:00:00.000Z",
      },
    });
    expect(demo.next === "demonstration" && demo.appointment.serviceId).toBe(
      serviceId,
    );
    const plan = guidedPatientInputSchema.parse({
      next: "plan",
      patient,
      plan: { ...terms, kind: "recurring" },
      groupId: "",
    });
    expect(plan.next === "plan" && plan.groupId).toBeUndefined();
    expect(
      guidedPatientInputSchema.parse({ next: "single", patient, plan: terms })
        .next,
    ).toBe("single");
  });

  it("rejects a single kind as subscription, missing step data and invalid periods", () => {
    for (const body of [
      { next: "plan", patient, plan: { ...terms, kind: "single" } },
      { next: "plan", patient, plan: { ...terms, kind: "custom" } },
      { next: "demonstration", patient },
      { next: "single", patient },
      { next: "single", patient, plan: { ...terms, validUntil: "2026-09-01" } },
      { next: "trial", patient },
    ])
      expect(guidedPatientInputSchema.safeParse(body).success).toBe(false);
  });
});

describe("user types and modules", () => {
  it("has only two user types: admin and common user", () => {
    expect(userRoleSchema.options).toEqual(["admin", "user"]);
    expect(userRoleLabels).toEqual({ admin: "Admin", user: "Usuário comum" });
    for (const legacy of ["owner", "reception", "physiotherapist", "finance"])
      expect(userRoleSchema.safeParse(legacy).success).toBe(false);
  });

  it("gives the admin every module regardless of the stored list", () => {
    expect(effectiveModules("admin")).toEqual(appModuleSchema.options);
    expect(effectiveModules("admin", ["agenda"])).toEqual(
      appModuleSchema.options,
    );
    expect(effectiveModules("admin", null)).toEqual(appModuleSchema.options);
  });

  it("gives a common user without stored modules no module at all", () => {
    expect(effectiveModules("user")).toEqual([]);
    expect(effectiveModules("user", null)).toEqual([]);
    expect(effectiveModules("user", [])).toEqual([]);
  });

  it("deduplicates a custom list and sorts it in the enum order", () => {
    expect(
      effectiveModules("user", ["finance", "agenda", "finance", "crm"]),
    ).toEqual(["agenda", "crm", "finance"]);
  });

  it("labels every module in pt-BR", () => {
    for (const module of appModuleSchema.options)
      expect(appModuleLabels[module]).toBeTruthy();
    expect(appModuleLabels.patients).toBe("Clientes");
  });

  it("accepts job title and modules on user create and update", () => {
    const created = adminUserInputSchema.parse({
      fullName: "Bia Souza",
      email: "BIA@x.com",
      role: "user",
      password: "Segura@1234",
      jobTitle: "  Instrutora de Pilates ",
      modules: ["agenda", "finance"],
    });
    expect(created.jobTitle).toBe("Instrutora de Pilates");
    expect(created.modules).toEqual(["agenda", "finance"]);
    const reset = adminUserUpdateSchema.parse({
      fullName: "Bia Souza",
      role: "user",
      active: true,
      modules: null,
    });
    expect(reset.modules).toBeNull();
    expect(reset.jobTitle).toBeUndefined();
    expect(
      adminUserUpdateSchema.safeParse({
        fullName: "Bia Souza",
        role: "user",
        active: true,
        modules: ["admin"],
      }).success,
    ).toBe(false);
    expect(
      adminUserUpdateSchema.safeParse({
        fullName: "Bia Souza",
        role: "user",
        active: true,
        jobTitle: "x".repeat(81),
      }).success,
    ).toBe(false);
    expect(
      adminUserInputSchema.safeParse({
        fullName: "Bia Souza",
        email: "bia@x.com",
        role: "reception",
        password: "Segura@1234",
      }).success,
    ).toBe(false);
  });
});

describe("user edit modules", () => {
  it("gives the admin edit on every module regardless of stored lists", () => {
    expect(effectiveEditModules("admin")).toEqual(appModuleSchema.options);
    expect(effectiveEditModules("admin", ["agenda"], [])).toEqual(
      appModuleSchema.options,
    );
  });

  it("gives a common user without stored edit no edit at all", () => {
    expect(effectiveEditModules("user")).toEqual([]);
    expect(effectiveEditModules("user", ["agenda", "crm"])).toEqual([]);
    expect(effectiveEditModules("user", ["agenda", "crm"], null)).toEqual([]);
  });

  it("drops edit without view, deduplicates and sorts in the enum order", () => {
    expect(
      effectiveEditModules("user", null, ["finance", "crm", "agenda"]),
    ).toEqual([]);
    expect(
      effectiveEditModules(
        "user",
        ["agenda", "crm"],
        ["finance", "crm", "agenda", "crm"],
      ),
    ).toEqual(["agenda", "crm"]);
    expect(
      effectiveEditModules(
        "user",
        ["agenda", "finance"],
        ["finance", "crm", "finance"],
      ),
    ).toEqual(["finance"]);
  });

  it("accepts an optional commission on user create", () => {
    const base = {
      fullName: "Bia Souza",
      email: "bia@x.com",
      role: "user",
      password: "Segura@1234",
    };
    expect(adminUserInputSchema.parse(base).commission).toBeUndefined();
    expect(
      adminUserInputSchema.parse({
        ...base,
        commission: { percentage: 12.5, effectiveFrom: "2026-10-01" },
      }).commission,
    ).toEqual({ percentage: 12.5, effectiveFrom: "2026-10-01" });
    for (const commission of [
      { percentage: -1, effectiveFrom: "2026-10-01" },
      { percentage: 100.1, effectiveFrom: "2026-10-01" },
      { percentage: 10, effectiveFrom: "01/10/2026" },
      { percentage: 10 },
    ])
      expect(
        adminUserInputSchema.safeParse({ ...base, commission }).success,
      ).toBe(false);
  });

  it("accepts editModules on user create and update", () => {
    const created = adminUserInputSchema.parse({
      fullName: "Bia Souza",
      email: "bia@x.com",
      role: "user",
      password: "Segura@1234",
      editModules: ["patients"],
    });
    expect(created.editModules).toEqual(["patients"]);
    const reset = adminUserUpdateSchema.parse({
      fullName: "Bia Souza",
      role: "user",
      active: true,
      editModules: null,
    });
    expect(reset.editModules).toBeNull();
    expect(
      adminUserUpdateSchema.parse({
        fullName: "Bia Souza",
        role: "user",
        active: true,
      }).editModules,
    ).toBeUndefined();
    expect(
      adminUserUpdateSchema.safeParse({
        fullName: "Bia Souza",
        role: "user",
        active: true,
        editModules: ["admin"],
      }).success,
    ).toBe(false);
  });
});
