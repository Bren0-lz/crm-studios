import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cpfMatchKey,
  planServiceValueForSessions,
  fillCampaignMessage,
  imageDataUrlInfo,
  messageTemplateInputSchema,
  whatsappCampaignAudienceSchema,
  describeLeadDuplicate,
  emailMatchKey,
  findLeadDuplicates,
  phoneMatchKey,
  salesChangePercent,
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
  isAppointmentPendingFinalization,
  pendingFinalizationLabel,
  appointmentActionLeadMinutes,
  appointmentActionsAvailableAt,
  isAppointmentStarted,
  groupEnrollmentCoversSession,
  groupEnrollmentInputSchema,
  appointmentNotStartedMessage,
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
  recurringOccurrenceStarts,
  recurringPayableCompetences,
  recurringPayableDueDate,
  relationshipSettingsSchema,
  resolvePatientTags,
  saoPauloToday,
  userRoleLabels,
  userRoleSchema,
  whatsappLink,
  historyActions,
  permissionCatalog,
  tabReceivableDescription,
  formatSequenceNumber,
  parseSequenceNumber,
  defaultContractTemplateBody,
  documentTemplateValues,
  documentTemplateVariables,
  renderDocumentTemplate,
  clinicalAlertInputSchema,
  compareClinicalAlerts,
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

  it("lists recurring occurrences by interval or by chosen dates", () => {
    expect(
      recurringOccurrenceStarts({
        startsAt: "2026-11-02T13:00:00-03:00",
        occurrences: 3,
        intervalWeeks: 2,
      }),
    ).toEqual([
      "2026-11-02T16:00:00.000Z",
      "2026-11-16T16:00:00.000Z",
      "2026-11-30T16:00:00.000Z",
    ]);
    expect(
      recurringOccurrenceStarts({
        startsAt: "2026-11-02T16:00:00.000Z",
        occurrences: 3,
        intervalWeeks: 1,
        customStartsAt: ["2026-11-20T14:00:00.000Z", "2026-11-05T16:00:00Z"],
      }),
    ).toEqual([
      "2026-11-02T16:00:00.000Z",
      "2026-11-05T16:00:00.000Z",
      "2026-11-20T14:00:00.000Z",
    ]);
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

describe("appointment clinical actions availability", () => {
  it("opens actions 15 minutes before the start", () => {
    expect(appointmentActionLeadMinutes).toBe(15);
    const startsAt = "2026-10-19T10:00:00-03:00";
    expect(appointmentActionsAvailableAt(startsAt).toISOString()).toBe(
      "2026-10-19T12:45:00.000Z",
    );
    expect(
      isAppointmentStarted({ startsAt }, new Date("2026-10-19T12:44:59.000Z")),
    ).toBe(false);
    expect(
      isAppointmentStarted({ startsAt }, new Date("2026-10-19T12:45:00.000Z")),
    ).toBe(true);
    expect(
      isAppointmentStarted({ startsAt }, new Date("2026-10-20T12:00:00.000Z")),
    ).toBe(true);
  });

  it("describes the availability in the clinic time zone", () => {
    expect(appointmentNotStartedMessage("2026-10-19T10:15:00-03:00")).toBe(
      "Disponível a partir de 19/10 às 10:00",
    );
    // 00:10 em São Paulo: a liberação cai no dia anterior (23:55).
    expect(appointmentNotStartedMessage("2026-10-20T03:10:00.000Z")).toBe(
      "Disponível a partir de 19/10 às 23:55",
    );
  });
});

describe("appointment pending finalization", () => {
  const now = new Date("2026-10-18T15:00:00.000Z");

  it("flags scheduled and confirmed appointments whose end already passed", () => {
    for (const status of ["scheduled", "confirmed"] as const) {
      expect(
        isAppointmentPendingFinalization(
          { status, endsAt: "2026-10-18T14:59:00.000Z" },
          now,
        ),
      ).toBe(true);
    }
    expect(pendingFinalizationLabel).toBe("Pendente de finalização");
  });

  it("compares instants regardless of the offset used (clinic time zone)", () => {
    // 11:59 em São Paulo (-03:00) = 14:59Z: já terminou ao meio-dia de Brasília.
    expect(
      isAppointmentPendingFinalization(
        { status: "confirmed", endsAt: "2026-10-18T11:59:00-03:00" },
        now,
      ),
    ).toBe(true);
    expect(
      isAppointmentPendingFinalization(
        { status: "confirmed", endsAt: "2026-10-18T12:30:00-03:00" },
        now,
      ),
    ).toBe(false);
  });

  it("ignores appointments still running, in the future or already resolved", () => {
    expect(
      isAppointmentPendingFinalization(
        { status: "scheduled", endsAt: "2026-10-18T15:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    for (const status of [
      "completed",
      "no_show",
      "excused_absence",
      "professional_absence",
      "cancelled",
    ] as const) {
      expect(
        isAppointmentPendingFinalization(
          { status, endsAt: "2026-10-01T10:00:00.000Z" },
          now,
        ),
      ).toBe(false);
    }
  });
});

describe("group enrollment period", () => {
  const session = (startsAt: string) => ({ startsAt });
  it("covers sessions from the start date on, in the clinic time zone", () => {
    const enrollment = { status: "active" as const, startsOn: "2026-10-17" };
    expect(
      groupEnrollmentCoversSession(
        enrollment,
        session("2026-10-16T18:00:00-03:00"),
      ),
    ).toBe(false);
    // 23:30 de 16/10 em São Paulo já é 17/10 em UTC: continua fora.
    expect(
      groupEnrollmentCoversSession(
        enrollment,
        session("2026-10-17T02:30:00.000Z"),
      ),
    ).toBe(false);
    expect(
      groupEnrollmentCoversSession(
        enrollment,
        session("2026-10-17T08:00:00-03:00"),
      ),
    ).toBe(true);
    expect(
      groupEnrollmentCoversSession(
        enrollment,
        session("2026-11-03T18:00:00-03:00"),
      ),
    ).toBe(true);
  });

  it("keeps a cancelled enrollment until the end date and ignores the waitlist", () => {
    const cancelled = {
      status: "cancelled" as const,
      startsOn: "2026-10-01",
      endedOn: "2026-10-20",
    };
    expect(
      groupEnrollmentCoversSession(
        cancelled,
        session("2026-10-20T18:00:00-03:00"),
      ),
    ).toBe(true);
    expect(
      groupEnrollmentCoversSession(
        cancelled,
        session("2026-10-21T18:00:00-03:00"),
      ),
    ).toBe(false);
    expect(
      groupEnrollmentCoversSession(
        { status: "cancelled", startsOn: "2026-10-01" },
        session("2026-10-05T18:00:00-03:00"),
      ),
    ).toBe(false);
    expect(
      groupEnrollmentCoversSession(
        { status: "waitlisted", startsOn: "2026-10-01" },
        session("2026-10-05T18:00:00-03:00"),
      ),
    ).toBe(false);
  });

  it("accepts an optional start date in the enrollment input", () => {
    const base = {
      groupId: "11111111-1111-4111-8111-111111111111",
      patientId: "22222222-2222-4222-8222-222222222222",
    };
    expect(groupEnrollmentInputSchema.safeParse(base).success).toBe(true);
    expect(
      groupEnrollmentInputSchema.safeParse({ ...base, startsOn: "2026-10-17" })
        .success,
    ).toBe(true);
    expect(
      groupEnrollmentInputSchema.safeParse({ ...base, startsOn: "17/10/2026" })
        .success,
    ).toBe(false);
  });
});

describe("sales change percent", () => {
  it("calcula a variação só com base anterior positiva", () => {
    expect(salesChangePercent(12000, 10000)).toBe(20);
    expect(salesChangePercent(5000, 10000)).toBe(-50);
    expect(salesChangePercent(49000, 0)).toBeNull();
    expect(salesChangePercent(49000, -700000)).toBeNull();
  });
});

describe("lead duplicates", () => {
  it("normaliza telefone, e-mail e CPF para comparar", () => {
    expect(phoneMatchKey("+55 (11) 98765-4321")).toBe("11987654321");
    expect(phoneMatchKey("(11) 98765-4321")).toBe("11987654321");
    expect(phoneMatchKey("551134567890")).toBe("1134567890");
    expect(phoneMatchKey("5511987654")).toBe("5511987654");
    expect(emailMatchKey(" Maria.Souza @Email.com ")).toBe(
      "maria.souza@email.com",
    );
    expect(cpfMatchKey("529.982.247-25")).toBe("52998224725");
    expect(phoneMatchKey(undefined)).toBe("");
  });

  it("encontra clientes e leads com o mesmo contato, sem contar o próprio lead", () => {
    const matches = findLeadDuplicates(
      {
        phone: "11987654321",
        email: "MARIA@email.com",
        cpf: "52998224725",
        excludeLeadId: "lead-self",
      },
      [
        {
          id: "p1",
          fullName: "Maria Souza",
          phone: "5511987654321",
          email: " maria@email.com",
          cpf: "529.982.247-25",
        },
        { id: "p2", fullName: "Outra Pessoa", phone: "11900000000" },
      ],
      [
        { id: "lead-self", fullName: "Eu", phone: "11987654321" },
        { id: "l2", fullName: "Lead Antigo", email: "maria@EMAIL.com" },
      ],
    );
    expect(matches).toEqual([
      {
        kind: "patient",
        id: "p1",
        fullName: "Maria Souza",
        fields: ["phone", "email", "cpf"],
      },
      { kind: "lead", id: "l2", fullName: "Lead Antigo", fields: ["email"] },
    ]);
    expect(describeLeadDuplicate(matches[0]!)).toBe(
      "Telefone, e-mail e CPF já cadastrados para Maria Souza (cliente).",
    );
    expect(describeLeadDuplicate(matches[1]!)).toBe(
      "E-mail já cadastrado para Lead Antigo (lead).",
    );
  });

  it("ignora campos vazios", () => {
    expect(
      findLeadDuplicates(
        { phone: "", email: "", cpf: "" },
        [{ id: "p1", fullName: "Sem Dados" }],
        [],
      ),
    ).toEqual([]);
  });
});

describe("textos de interface sem nome antigo nem código interno (QM15)", () => {
  it("rotula permissões e histórico sem 'movimenta'", () => {
    const labels = [
      ...permissionCatalog.map((item) => item.name),
      ...historyActions.map((item) => item.label),
    ];
    expect(labels.filter((label) => /movimenta/i.test(label))).toEqual([]);
    expect(
      permissionCatalog.find((item) => item.key === "patients.stock_move")
        ?.name,
    ).toBe("Ajustar estoque");
  });

  it("formata e lê números sequenciais de prontuário e recibo", () => {
    expect(formatSequenceNumber("PAC", 7)).toBe("PAC-00007");
    expect(formatSequenceNumber("REC", 123456)).toBe("REC-123456");
    expect(parseSequenceNumber("PAC", "PAC-00124")).toBe(124);
    expect(parseSequenceNumber("PAC", "PAC-E2CD5FDF")).toBeNull();
    expect(parseSequenceNumber("PAC", "PAC-9999")).toBeNull();
    expect(parseSequenceNumber("REC", "PAC-00001")).toBeNull();
  });

  it("descreve a cobrança da comanda por data e cliente, sem o id", () => {
    expect(tabReceivableDescription("Marina Souza", "2026-10-19")).toBe(
      "Comanda de 19/10 · Marina",
    );
  });
});

describe("campanhas de WhatsApp", () => {
  it("preenche nome e nome completo e mantém códigos desconhecidos", () => {
    expect(
      fillCampaignMessage(
        "Oi, {{nome}}! {{ nome_completo }} {{x}}",
        "  Ana   Paula Souza ",
      ),
    ).toBe("Oi, Ana! Ana Paula Souza {{x}}");
  });

  it("limita a 3 imagens válidas e calcula o tamanho decodificado", () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const image = { fileName: "a.png", dataUrl: png };
    expect(
      messageTemplateInputSchema.safeParse({
        title: "T",
        body: "B",
        images: [image, image, image],
      }).success,
    ).toBe(true);
    expect(
      messageTemplateInputSchema.safeParse({
        title: "T",
        body: "B",
        images: [image, image, image, image],
      }).success,
    ).toBe(false);
    expect(
      messageTemplateInputSchema.safeParse({
        title: "T",
        body: "B",
        images: [{ fileName: "a.gif", dataUrl: "data:image/gif;base64,AAAA" }],
      }).success,
    ).toBe(false);
    expect(imageDataUrlInfo(png)).toMatchObject({
      mimeType: "image/png",
      sizeBytes: 68,
    });
  });

  it("exige clientes no público por escolha individual", () => {
    expect(
      whatsappCampaignAudienceSchema.safeParse({
        mode: "patients",
        patientIds: [],
      }).success,
    ).toBe(false);
    expect(
      whatsappCampaignAudienceSchema.parse({ mode: "segment" }),
    ).toMatchObject({ segment: { tags: [], birthdayMonth: false } });
  });
});

describe("valor do serviço vendido no plano", () => {
  it("segue o preço por sessão da referência e arredonda em centavos", () => {
    const reference = { totalSessions: 8, totalValueInCents: 16000 };
    expect(planServiceValueForSessions(reference, 8)).toBe(16000);
    expect(planServiceValueForSessions(reference, 10)).toBe(20000);
    expect(
      planServiceValueForSessions(
        { totalSessions: 3, totalValueInCents: 10000 },
        1,
      ),
    ).toBe(3333);
    expect(planServiceValueForSessions(reference, 0)).toBe(0);
  });
});

describe("document templates", () => {
  const context = {
    clinic: {
      name: "Studios Aryana",
      legalName: "",
      taxId: "11.222.333/0001-81",
      phone: "19999990000",
    },
    patient: {
      fullName: "Helena Almeida",
      cpf: "52998224725",
      address: "Rua das Flores, 120",
      city: "Campinas",
      state: "SP",
      postalCode: "13010-000",
    },
    issuedOn: "23/10/2026",
  };

  it("fills the parties with formatted documents and falls back when data is missing", () => {
    const values = documentTemplateValues(context);
    expect(values).toMatchObject({
      clinica_razao_social: "Studios Aryana",
      clinica_cnpj: "11.222.333/0001-81",
      clinica_telefone: "(19) 99999-0000",
      clinica_endereco: "não informado",
      paciente_cpf: "529.982.247-25",
      paciente_endereco: "Rua das Flores, 120, Campinas/SP, CEP 13010-000",
      plano_nome: "Não vinculado",
      plano_vigencia: "Não vinculado",
      profissional_nome: "",
    });
    expect(
      documentTemplateValues({
        ...context,
        plan: {
          name: "Pilates",
          services: "Pilates: 8 sessões",
          totalValueInCents: 120000,
          installments: 3,
          validFrom: "2026-11-01",
        },
      }).plano_vigencia,
    ).toBe("a partir de 01/11/2026, por prazo indeterminado");
  });

  it("offers every field used by the standard contract", () => {
    const rendered = renderDocumentTemplate(
      defaultContractTemplateBody,
      documentTemplateValues(context),
    );
    expect(rendered).not.toContain("{{");
    expect(rendered).toContain("inscrita no CNPJ sob o nº 11.222.333/0001-81");
    expect(rendered).toContain("TESTEMUNHAS:");
    const keys = documentTemplateVariables.map((variable) => variable.key);
    for (const match of defaultContractTemplateBody.matchAll(/\{\{(\w+)\}\}/g))
      expect(keys).toContain(match[1]);
  });
});

describe("clinical alerts", () => {
  it("validates the text and orders critical alerts first", () => {
    const patientId = "99999999-9999-4999-8999-999999999999";
    expect(
      clinicalAlertInputSchema.safeParse({
        patientId,
        severity: "warning",
        text: "  ok ",
      }).success,
    ).toBe(false);
    expect(
      clinicalAlertInputSchema.parse({
        patientId,
        severity: "critical",
        text: "  Alergia a látex ",
      }).text,
    ).toBe("Alergia a látex");
    const alerts = [
      { severity: "info" as const, createdAt: "2026-10-02T10:00:00.000Z" },
      { severity: "critical" as const, createdAt: "2026-10-01T10:00:00.000Z" },
      { severity: "info" as const, createdAt: "2026-10-03T10:00:00.000Z" },
    ];
    expect([...alerts].sort(compareClinicalAlerts)).toEqual([
      { severity: "critical", createdAt: "2026-10-01T10:00:00.000Z" },
      { severity: "info", createdAt: "2026-10-03T10:00:00.000Z" },
      { severity: "info", createdAt: "2026-10-02T10:00:00.000Z" },
    ]);
  });
});
