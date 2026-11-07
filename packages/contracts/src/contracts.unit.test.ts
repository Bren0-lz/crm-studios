import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveTelegramLinkRoles,
  telegramSettingsInputSchema,
  auditChangesOf,
  changeReasonSchema,
  diffAuditFields,
  patientAuditLabels,
  appointmentCreateInputSchema,
  appointmentPromotionSchema,
  whatsappCampaignInputSchema,
  autoCampaignInputSchema,
  recurringAppointmentCreateInputSchema,
  productInputSchema,
  productItemName,
  productNeedsRestock,
  productRestockSizes,
  productSizeStock,
  productSizeLabel,
  sortProductSizes,
  clinicCatalogInputSchema,
  productUpdateSchema,
  cpfMatchKey,
  receivableContactMessage,
  planPixChargeMessage,
  paymentReceiptMessage,
  paymentReceiptMessageVariables,
  receiptSignaturePath,
  planFirstChargeProration,
  planInstallmentSchedule,
  planProratedChargeCount,
  planServiceValueForSessions,
  weeklySlotSessionsBetween,
  withPlanFirstCharge,
  fillCampaignMessage,
  usesAppointmentVariables,
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
  commissionRuleInputSchema,
  appModuleLabels,
  appModuleSchema,
  appointmentInputSchema,
  broadcastInputSchema,
  broadcastSkipReasonLabels,
  broadcastSkipReasons,
  clinicSettingsInputSchema,
  formatTaxId,
  formatCnpj,
  supplierInputSchema,
  supplierOrderInputSchema,
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
  splitPhone,
  groupClassInputSchema,
  groupClassName,
  groupClassUpdateSchema,
  groupLetter,
  guidedPatientInputSchema,
  isValidCpf,
  isAppointmentPendingFinalization,
  pendingFinalizationLabel,
  autoFinalizationSettingsInputSchema,
  autoFinalizationDelayLabel,
  completedAppointmentsQuerySchema,
  defaultAutoFinalizationSettings,
  isAppointmentDueForAutoFinalization,
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
  patientImportInputSchema,
  patientImportRequiredFields,
  patientInputSchema,
  patientUpdateInputSchema,
  patientListQuerySchema,
  patientPlanInputSchema,
  singlePlanServicesMessage,
  patientTabCloseInputSchema,
  patientTabCancelInputSchema,
  productSaleInputSchema,
  patientTagInputSchema,
  patientTagKey,
  patientTagUpdateSchema,
  phoneDigits,
  recurringOccurrenceStarts,
  recurringPayableCompetences,
  recurringPayableDueDate,
  recurringPayableInputSchema,
  recurringPayableReminders,
  relationshipSettingsSchema,
  resolvePatientTags,
  saoPauloToday,
  userRoleLabels,
  userRoleSchema,
  whatsappLink,
  historyActions,
  permissionCatalog,
  legacyPermissions,
  normalizePermissions,
  effectivePermissions,
  tabReceivableDescription,
  formatSequenceNumber,
  parseSequenceNumber,
  defaultContractTemplateBody,
  documentTemplateValues,
  documentTemplateVariables,
  renderDocumentTemplate,
  clinicalAlertInputSchema,
  compareClinicalAlerts,
  planSessionPaidValueInCents,
  publicDocumentSignInputSchema,
  publicSignatureInputSchema,
  signatureLinkExpiresAt,
  signatureLinkExpired,
  patientImportFileSchema,
  payrollAdvanceDescription,
  payrollAdvanceInputSchema,
  payrollEntryDescription,
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

  it("reminds fixed expenses from the configured days before the due date", () => {
    const water = {
      id: "water",
      description: "Água",
      amountType: "variable" as const,
      amountInCents: 15_000,
      dayOfMonth: 3,
      reminderDaysBefore: 5,
      startMonth: "2026-10",
      active: true,
    };
    const internet = {
      ...water,
      id: "internet",
      description: "Internet",
      amountType: "fixed" as const,
      amountInCents: 9_990,
      dayOfMonth: 20,
      reminderDaysBefore: 2,
    };
    const silent = { ...internet, id: "silent", reminderDaysBefore: undefined };
    const octoberWater = {
      id: "p1",
      recurringPayableId: "water",
      competence: "2026-10",
      dueDate: "2026-10-03",
      amountInCents: 15_000,
      status: "open" as const,
      amountPending: true,
    };
    // 29/10: a água de outubro segue em aberto (vencida) e a de novembro, ainda não
    // gerada, já está no prazo (03/11 menos 5 dias = 29/10). A internet de outubro foi
    // paga e a de novembro só avisa em 18/11.
    expect(
      recurringPayableReminders(
        [water, internet, silent],
        [
          octoberWater,
          {
            ...octoberWater,
            id: "p2",
            recurringPayableId: "internet",
            dueDate: "2026-10-20",
            amountInCents: 9_990,
            status: "paid",
            amountPending: false,
          },
        ],
        "2026-10-29",
      ),
    ).toEqual([
      {
        recurringPayableId: "water",
        description: "Água",
        competence: "2026-10",
        dueDate: "2026-10-03",
        remindFrom: "2026-09-28",
        amountInCents: 15_000,
        amountType: "variable",
        amountPending: true,
        payableId: "p1",
      },
      {
        recurringPayableId: "water",
        description: "Água",
        competence: "2026-11",
        dueDate: "2026-11-03",
        remindFrom: "2026-10-29",
        amountInCents: 15_000,
        amountType: "variable",
        amountPending: true,
      },
    ]);
    // Um dia antes do prazo não avisa; paga, a conta sai do aviso.
    expect(
      recurringPayableReminders(
        [water],
        [{ ...octoberWater, status: "paid" }],
        "2026-10-28",
      ),
    ).toEqual([]);
    // Internet: dia 18 avisa (20 menos 2); pausada, as competências futuras param.
    expect(
      recurringPayableReminders([internet], [], "2026-10-18").map(
        (item) => item.dueDate,
      ),
    ).toEqual(["2026-10-20"]);
    expect(
      recurringPayableReminders(
        [{ ...internet, active: false }],
        [],
        "2026-10-18",
      ),
    ).toEqual([]);
  });

  it("defaults fixed expenses to a fixed amount and limits the reminder", () => {
    const base = {
      description: "Conta de luz",
      categoryId: "11111111-1111-4111-8111-111111111111",
      costCenterId: "11111111-1111-4111-8111-111111111112",
      amountInCents: 20_000,
      dayOfMonth: 10,
      startMonth: "2026-10",
    };
    expect(recurringPayableInputSchema.parse(base).amountType).toBe("fixed");
    // Centro de custo é opcional, como na despesa pontual.
    expect(
      recurringPayableInputSchema.safeParse({
        ...base,
        costCenterId: undefined,
      }).success,
    ).toBe(true);
    expect(
      recurringPayableInputSchema.safeParse({ ...base, reminderDaysBefore: 31 })
        .success,
    ).toBe(false);
    expect(
      recurringPayableInputSchema.safeParse({
        ...base,
        amountType: "variable",
        reminderDaysBefore: 0,
      }).success,
    ).toBe(true);
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
      cpf: "52998224725",
      fullName: "  Maria da Silva  ",
      phone: "(11) 99999-9999",
      whatsapp: "(11) 99999-9999",
      emergencyContactName: " Maria da Silva ",
      emergencyContactPhone: "(11) 99999-9999",
      tags: ["Pilates"],
    });

    expect(result.fullName).toBe("Maria da Silva");
    expect(result.phone).toBe("11999999999");
    expect(
      patientInputSchema.parse({
        cpf: "52998224725",
        fullName: "Maria da Silva",
        phone: "11999999999",
        whatsapp: "(11) 3333-4444",
        emergencyContactName: "Maria da Silva",
        emergencyContactPhone: "11999999999",
      }).whatsapp,
    ).toBe("1133334444");
    expect(() =>
      patientInputSchema.parse({
        cpf: "52998224725",
        fullName: "Maria da Silva",
        phone: "11999999999",
        whatsapp: "3333-4444",
        emergencyContactName: "Maria da Silva",
        emergencyContactPhone: "11999999999",
      }),
    ).toThrow();
    expect(result.tags).toEqual(["Pilates"]);
    expect(() =>
      patientInputSchema.parse({
        cpf: "52998224725",
        fullName: "Maria da Silva",
        phone: "9999-9999",
        whatsapp: "11999999999",
        emergencyContactName: "Maria da Silva",
        emergencyContactPhone: "11999999999",
      }),
    ).toThrow();
    expect(
      patientUpdateInputSchema.parse({
        cpf: "52998224725",
        fullName: "Maria da Silva",
        phone: "11 3333 4444",
        emergencyContactPhone: "",
      }).emergencyContactPhone,
    ).toBe("");
  });

  it("requires WhatsApp and emergency contact in manual registration only (CD1)", () => {
    const base = {
      cpf: "52998224725",
      fullName: "Maria da Silva",
      phone: "11999999999",
    };
    const complete = {
      ...base,
      whatsapp: "11999999999",
      emergencyContactName: "Maria da Silva",
      emergencyContactPhone: "11999999999",
    };
    // O próprio nome e telefone do cliente valem como contato de emergência.
    expect(patientInputSchema.parse(complete)).toMatchObject({
      whatsapp: "11999999999",
      emergencyContactName: "Maria da Silva",
      emergencyContactPhone: "11999999999",
    });
    for (const [field, message] of [
      ["whatsapp", "Informe o WhatsApp com DDD."],
      ["emergencyContactName", "Informe o nome do contato de emergência."],
      [
        "emergencyContactPhone",
        "Informe o telefone do contato de emergência com DDD.",
      ],
    ] as const) {
      for (const value of [undefined, "", "  "]) {
        const result = patientInputSchema.safeParse({
          ...complete,
          [field]: value,
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues).toContainEqual(
            expect.objectContaining({ path: [field], message }),
          );
      }
    }
    // Importação e edição seguem aceitando sem esses campos.
    expect(patientImportInputSchema.parse(base).whatsapp).toBeUndefined();
    expect(
      patientUpdateInputSchema.parse({
        ...base,
        whatsapp: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
      }),
    ).toMatchObject({ whatsapp: "", emergencyContactName: "" });
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

  it("splits area code and number for spreadsheets", () => {
    expect(splitPhone("11999998888")).toEqual({
      ddd: "11",
      number: "99999-8888",
    });
    expect(splitPhone("(21) 3333-4444")).toEqual({
      ddd: "21",
      number: "3333-4444",
    });
    expect(splitPhone("+55 31 98888-7777")).toEqual({
      ddd: "31",
      number: "98888-7777",
    });
    expect(splitPhone("99998888")).toEqual({ ddd: "", number: "99998888" });
    expect(splitPhone("+351 912 345 678")).toEqual({
      ddd: "",
      number: "+351 912 345 678",
    });
    expect(splitPhone(undefined)).toEqual({ ddd: "", number: "" });
  });

  it("fills supplier hiring and payment defaults", () => {
    const parsed = supplierInputSchema.parse({
      name: "Fornecedor",
      kind: "company",
    });
    expect(parsed).toMatchObject({
      whatsapp: "",
      billingCycle: "one_time",
      installments: 1,
      paymentTerms: "",
      orders: "",
      contracts: "",
    });
    expect(parsed.hiredOn).toBeUndefined();
    expect(() =>
      supplierInputSchema.parse({ ...parsed, installments: 0 }),
    ).toThrow();
  });

  it("requires each supplier order item to name exactly one product", () => {
    const order = {
      orderedOn: "2026-10-20",
      totalInCents: 1_000,
      items: [{ productName: "Óleo", quantity: 2 }],
    };
    expect(supplierOrderInputSchema.parse(order)).toMatchObject({
      number: "",
      notes: "",
    });
    expect(() =>
      supplierOrderInputSchema.parse({ ...order, items: [{ quantity: 1 }] }),
    ).toThrow();
    expect(() =>
      supplierOrderInputSchema.parse({
        ...order,
        items: [
          {
            productId: "11111111-1111-4111-8111-111111111111",
            productName: "Óleo",
            quantity: 1,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      supplierOrderInputSchema.parse({ ...order, items: [] }),
    ).toThrow();
  });

  it("accepts a product without sale price yet", () => {
    expect(
      productInputSchema.parse({
        name: "Bola suíça",
        sku: "BOLA",
        costInCents: 0,
        salePriceInCents: null,
      }).salePriceInCents,
    ).toBeNull();
  });

  it("validates and formats the clinic CPF/CNPJ", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("12.345.678/0001-90")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    expect(isValidTaxId("529.982.247-25")).toBe(true);
    expect(isValidTaxId("1122233300018")).toBe(false);
    expect(formatTaxId("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatTaxId("1122233300")).toBe("112.223.330-0");
    expect(formatCnpj("112223")).toBe("11.222.3");
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
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
        whatsapp: "11999999999",
        emergencyContactName: "Maria da Silva",
        emergencyContactPhone: "11999999999",
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

  it("keeps CPF required in manual registration but optional in spreadsheet imports", () => {
    const base = { fullName: "Maria da Silva", phone: "11999999999" };
    expect(() => patientInputSchema.parse(base)).toThrow();
    expect(() => patientInputSchema.parse({ ...base, cpf: "" })).toThrow(
      "Informe um CPF válido.",
    );
    expect(patientImportInputSchema.parse(base).cpf).toBeUndefined();
    expect(
      patientImportInputSchema.parse({ ...base, cpf: " " }).cpf,
    ).toBeUndefined();
    expect(
      patientImportInputSchema.parse({ ...base, cpf: "529.982.247-25" }).cpf,
    ).toBe("52998224725");
    expect(() =>
      patientImportInputSchema.parse({ ...base, cpf: "529.982.247-24" }),
    ).toThrow("Informe um CPF válido.");
    expect(patientImportRequiredFields).toEqual(["fullName", "phone"]);
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

  it("sells a single plan only with one session of one service", () => {
    const single = {
      services: [
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          totalSessions: 1,
          totalValueInCents: 15000,
        },
      ],
      planTemplateId: "aa000000-0000-4000-8000-000000000001",
      patientId: "99999999-9999-4999-8999-999999999999",
      serviceId: "77777777-7777-4777-8777-777777777777",
      name: "Avaliação",
      kind: "single",
      totalSessions: 1,
      validFrom: "2026-09-01",
      totalValueInCents: 15000,
      installments: 1,
      firstDueDate: "2026-09-05",
    };
    expect(patientPlanInputSchema.safeParse(single).success).toBe(true);
    const several = patientPlanInputSchema.safeParse({
      ...single,
      services: [{ ...single.services[0]!, totalSessions: 4 }],
      totalSessions: 4,
    });
    expect(several.error?.issues[0]).toMatchObject({
      path: ["services"],
      message: singlePlanServicesMessage,
    });
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

  it("validates a one-step product sale", () => {
    const productId = "22222222-2222-4222-8222-222222222222";
    const base = {
      patientId: "11111111-1111-4111-8111-111111111111",
      settlement: "receivable" as const,
      dueDate: "2026-09-12",
    };
    expect(() => productSaleInputSchema.parse({ ...base, items: [] })).toThrow(
      "Adicione ao menos um produto.",
    );
    expect(() =>
      productSaleInputSchema.parse({
        ...base,
        items: [
          { productId, quantity: 1 },
          { productId, quantity: 2 },
        ],
      }),
    ).toThrow("Cada produto entra uma vez só na venda.");
    expect(() =>
      productSaleInputSchema.parse({
        ...base,
        settlement: "paid",
        items: [{ productId, quantity: 1 }],
      }),
    ).toThrow("Informe a forma de pagamento.");
    expect(
      productSaleInputSchema.parse({
        ...base,
        items: [{ productId, quantity: 2, unitPriceInCents: 1500 }],
      }).items[0],
    ).toEqual({ productId, quantity: 2, unitPriceInCents: 1500 });
  });

  it("validates free product sizes and keeps the informed order", () => {
    const base = {
      name: "Camiseta",
      sku: "CAM",
      costInCents: 1000,
      salePriceInCents: 3000,
    };
    expect(productInputSchema.parse(base).sizes).toBeUndefined();
    expect(
      productInputSchema.parse({ ...base, sizes: [" 36 ", "38", "250 ml"] })
        .sizes,
    ).toEqual(["36", "38", "250 ml"]);
    expect(() =>
      productInputSchema.parse({ ...base, sizes: ["M", "m"] }),
    ).toThrow("Cada tamanho entra uma vez só.");
    expect(() => productInputSchema.parse({ ...base, sizes: [" "] })).toThrow();
    expect(productUpdateSchema.parse({ ...base, sizes: [] }).sizes).toEqual([]);
    expect(sortProductSizes(["P", "M", "p", "G"])).toEqual(["P", "M", "G"]);
    expect(productSizeLabel("unique")).toBe("Tamanho único");
    expect(productSizeLabel("baby_look_p")).toBe("Baby look P");
    expect(productSizeLabel("500 ml")).toBe("500 ml");
  });

  it("keeps the sizes only on product categories", () => {
    expect(
      clinicCatalogInputSchema.parse({ name: "Calçados", sizes: ["37", "38"] })
        .sizes,
    ).toEqual(["37", "38"]);
    expect(clinicCatalogInputSchema.parse({ name: "Óleos" }).sizes).toBe(
      undefined,
    );
    expect(() =>
      clinicCatalogInputSchema.parse({ name: "Calçados", sizes: ["37", "37"] }),
    ).toThrow("Cada tamanho entra uma vez só.");
  });

  it("validates the initial stock per size and sizes in a sale", () => {
    const base = {
      name: "Camiseta",
      sku: "CAM",
      costInCents: 1000,
      salePriceInCents: 3000,
      sizes: ["p", "m"],
    };
    expect(() =>
      productInputSchema.parse({ ...base, initialStock: 2 }),
    ).toThrow("Informe o estoque inicial por tamanho.");
    expect(() =>
      productInputSchema.parse({
        ...base,
        initialSizeStock: [{ size: "g", quantity: 1 }],
      }),
    ).toThrow("O estoque inicial deve usar os tamanhos do produto");
    expect(
      productInputSchema.parse({
        ...base,
        initialSizeStock: [{ size: "m", quantity: 4 }],
      }).initialSizeStock,
    ).toEqual([{ size: "m", quantity: 4 }]);
    const productId = "22222222-2222-4222-8222-222222222222";
    const sale = {
      patientId: "11111111-1111-4111-8111-111111111111",
      settlement: "receivable" as const,
      dueDate: "2026-09-12",
    };
    expect(
      productSaleInputSchema.parse({
        ...sale,
        items: [
          { productId, size: "p", quantity: 1 },
          { productId, size: "m", quantity: 1 },
        ],
      }).items,
    ).toHaveLength(2);
    expect(() =>
      productSaleInputSchema.parse({
        ...sale,
        items: [
          { productId, size: "p", quantity: 1 },
          { productId, size: "p", quantity: 2 },
        ],
      }),
    ).toThrow("Cada produto entra uma vez só na venda.");
  });

  it("keeps the restock alert optional and asks for restock at or below it", () => {
    const product = {
      name: "Faixa",
      sku: "FX",
      costInCents: 0,
      salePriceInCents: 0,
    };
    expect(productInputSchema.parse(product).restockAlertAt).toBeUndefined();
    expect(
      productInputSchema.parse({ ...product, restockAlertAt: 5 })
        .restockAlertAt,
    ).toBe(5);
    expect(
      productUpdateSchema.parse({ ...product, restockAlertAt: null })
        .restockAlertAt,
    ).toBeNull();
    expect(() =>
      productInputSchema.parse({ ...product, restockAlertAt: 0 }),
    ).toThrow();
    const stock = (currentStock: number, restockAlertAt: number | null) => ({
      currentStock,
      restockAlertAt,
      sizes: [],
      sizeStock: [],
    });
    expect(productNeedsRestock(stock(0, null))).toBe(true);
    expect(productNeedsRestock(stock(1, null))).toBe(false);
    expect(productNeedsRestock(stock(5, 5))).toBe(true);
    expect(productNeedsRestock(stock(6, 5))).toBe(false);
  });

  it("avisa a reposição por tamanho, não só pelo total", () => {
    const shirt = {
      currentStock: 12,
      restockAlertAt: 5 as number | null,
      sizes: ["P", "M", "G"],
      sizeStock: [
        { size: "P", currentStock: 2 },
        { size: "M", currentStock: 10 },
        { size: null, currentStock: 0 },
      ],
    };
    // G não tem linha de estoque: conta como zerado.
    expect(productRestockSizes(shirt)).toEqual(["P", "G"]);
    expect(productNeedsRestock(shirt)).toBe(true);
    expect(
      productNeedsRestock({
        ...shirt,
        sizes: ["M"],
      }),
    ).toBe(false);
    expect(productRestockSizes({ ...shirt, restockAlertAt: null })).toEqual([]);
    expect(productNeedsRestock({ ...shirt, restockAlertAt: null })).toBe(false);
  });

  it("lists the stock per size with leftovers outside the configured sizes", () => {
    expect(
      productSizeStock(
        ["p", "g"],
        [
          { size: "g", currentStock: 2 },
          { size: "m", currentStock: 0 },
          { size: "gg", currentStock: 1 },
          { size: null, currentStock: 3 },
        ],
      ),
    ).toEqual([
      { size: "p", currentStock: 0 },
      { size: "g", currentStock: 2 },
      { size: "gg", currentStock: 1 },
      { size: null, currentStock: 3 },
    ]);
    expect(productSizeStock([], [{ size: null, currentStock: 5 }])).toEqual([]);
    expect(
      productSizeStock(
        [],
        [
          { size: null, currentStock: 5 },
          { size: "m", currentStock: 1 },
        ],
      ),
    ).toEqual([{ size: "m", currentStock: 1 }]);
    expect(
      productItemName({ productName: "Camiseta", size: "baby_look_m" }),
    ).toBe("Camiseta · Baby look M");
    expect(productItemName({ productName: "Óleo" })).toBe("Óleo");
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
  const patient = {
    fullName: "Ana Souza",
    phone: "11999990000",
    cpf: "52998224725",
    whatsapp: "11999990000",
    emergencyContactName: "Ana Souza",
    emergencyContactPhone: "11999990000",
  };
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

  const single = {
    ...terms,
    services: [{ serviceId, totalSessions: 1, totalValueInCents: 40000 }],
    totalSessions: 1,
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
      guidedPatientInputSchema.parse({ next: "single", patient, plan: single })
        .next,
    ).toBe("single");
  });

  it("rejects a single kind as subscription, missing step data and invalid periods", () => {
    for (const body of [
      { next: "plan", patient, plan: { ...terms, kind: "single" } },
      { next: "plan", patient, plan: { ...terms, kind: "custom" } },
      { next: "demonstration", patient },
      { next: "single", patient },
      {
        next: "single",
        patient,
        plan: { ...single, validUntil: "2026-09-01" },
      },
      // Avulso é uma sessão de um serviço (AP5).
      { next: "single", patient, plan: terms },
      {
        next: "plan",
        patient,
        plan: { ...terms, kind: "recurring" },
        additionalPlans: [{ plan: { ...terms, kind: "single" } }],
      },
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

describe("appointment auto finalization", () => {
  const now = new Date("2026-10-18T15:00:00.000Z");

  it("is due only after the configured delay from the end", () => {
    const appointment = {
      status: "confirmed" as const,
      endsAt: "2026-10-18T14:00:00.000Z",
    };
    expect(isAppointmentDueForAutoFinalization(appointment, 60, now)).toBe(
      true,
    );
    expect(isAppointmentDueForAutoFinalization(appointment, 61, now)).toBe(
      false,
    );
    expect(
      isAppointmentDueForAutoFinalization(
        { ...appointment, status: "no_show" },
        0,
        now,
      ),
    ).toBe(false);
  });

  it("validates the delay and keeps the defaults disabled", () => {
    expect(defaultAutoFinalizationSettings).toEqual({
      enabled: false,
      delayMinutes: 60,
    });
    expect(
      autoFinalizationSettingsInputSchema.safeParse({
        enabled: true,
        delayMinutes: 10080,
      }).success,
    ).toBe(true);
    for (const delayMinutes of [-1, 10081, 1.5])
      expect(
        autoFinalizationSettingsInputSchema.safeParse({
          enabled: true,
          delayMinutes,
        }).success,
      ).toBe(false);
  });

  it("describes the delay in words", () => {
    expect(autoFinalizationDelayLabel(0)).toBe("imediatamente");
    expect(autoFinalizationDelayLabel(45)).toBe("45 minutos");
    expect(autoFinalizationDelayLabel(90)).toBe("1 hora e 30 minutos");
    expect(autoFinalizationDelayLabel(2 * 1440 + 1)).toBe("2 dias e 1 minuto");
  });

  it("requires an ordered period of up to one year", () => {
    const ok = completedAppointmentsQuerySchema.safeParse({
      from: "2026-10-01T00:00:00-03:00",
      to: "2026-11-01T00:00:00-03:00",
    });
    expect(ok.success).toBe(true);
    expect(
      completedAppointmentsQuerySchema.safeParse({
        from: "2026-11-01T00:00:00-03:00",
        to: "2026-10-01T00:00:00-03:00",
      }).success,
    ).toBe(false);
    expect(
      completedAppointmentsQuerySchema.safeParse({
        from: "2024-10-01T00:00:00-03:00",
        to: "2026-10-01T00:00:00-03:00",
      }).success,
    ).toBe(false);
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

  it("só concede 'ver agenda de todos' por escolha explícita, com a agenda", () => {
    const item = permissionCatalog.find(
      (entry) => entry.key === "agenda.view_all",
    );
    expect(item).toMatchObject({
      name: "Ver agenda de todos os profissionais",
      dependencies: ["agenda.view"],
      explicitGrantOnly: true,
    });
    expect(legacyPermissions("user", ["agenda"], ["agenda"])).not.toContain(
      "agenda.view_all",
    );
    expect(normalizePermissions(["agenda.view_all"])).toEqual([]);
    expect(effectivePermissions("admin")).toContain("agenda.view_all");
  });

  it("só concede o estorno da venda por escolha explícita, com o cancelamento", () => {
    expect(
      permissionCatalog.find((entry) => entry.key === "patients.tabs_refund"),
    ).toMatchObject({
      name: "Estornar pagamento da venda ao cancelar",
      dependencies: ["patients.view", "patients.tabs_cancel"],
      explicitGrantOnly: true,
    });
    expect(legacyPermissions("user", ["patients"], ["patients"])).not.toContain(
      "patients.tabs_refund",
    );
    expect(
      normalizePermissions(["patients.view", "patients.tabs_refund"]),
    ).toEqual(["patients.view"]);
    expect(effectivePermissions("admin")).toContain("patients.tabs_refund");
  });

  it("cancela a comanda sem estorno quando o corpo vem vazio", () => {
    expect(patientTabCancelInputSchema.parse(undefined)).toEqual({
      refundPayment: false,
    });
    expect(patientTabCancelInputSchema.parse({})).toEqual({
      refundPayment: false,
    });
    expect(patientTabCancelInputSchema.parse({ refundPayment: true })).toEqual({
      refundPayment: true,
    });
    expect(() =>
      patientTabCancelInputSchema.parse({ refundPayment: "sim" }),
    ).toThrow();
  });

  it("aceita o motivo do cancelamento da comanda, sem espaços nas pontas", () => {
    expect(
      patientTabCancelInputSchema.parse({ reason: "  Cliente desistiu " }),
    ).toEqual({ refundPayment: false, reason: "Cliente desistiu" });
    expect(() =>
      patientTabCancelInputSchema.parse({ reason: "x".repeat(501) }),
    ).toThrow();
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

  it("preenche data e hora do atendimento só quando informadas", () => {
    const body = "{{nome}}, até {{data_atendimento}} às {{ hora_atendimento }}";
    expect(usesAppointmentVariables(body)).toBe(true);
    expect(usesAppointmentVariables("Oi, {{nome}}")).toBe(false);
    expect(
      fillCampaignMessage(body, "Ana Souza", { date: "23/10", time: "09:00" }),
    ).toBe("Ana, até 23/10 às 09:00");
    expect(fillCampaignMessage(body, "Ana Souza")).toBe(
      "Ana, até {{data_atendimento}} às {{ hora_atendimento }}",
    );
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

  it("writes the residence details in the client address", () => {
    expect(
      documentTemplateValues({
        ...context,
        patient: {
          fullName: "Helena Almeida",
          residenceType: "apartment",
          address: "Rua das Flores",
          addressNumber: "120",
          buildingName: "Edifício Solar",
          block: "B",
          floor: "3",
          unit: "302",
          neighborhood: "Centro",
          city: "Campinas",
          state: "SP",
        },
      }).paciente_endereco,
    ).toBe(
      "Rua das Flores, 120, Edifício Solar, Bloco B, 3º andar, Apto 302, Centro, Campinas/SP",
    );
    expect(
      documentTemplateValues({
        ...context,
        patient: {
          fullName: "Helena Almeida",
          residenceType: "condominium",
          address: "Avenida Brasil",
          addressNumber: "900",
          buildingName: "Residencial Jardins",
          block: "4",
          unit: "12",
          complement: "fundos",
        },
      }).paciente_endereco,
    ).toBe(
      "Avenida Brasil, 900, Residencial Jardins, Quadra 4, Casa 12, fundos",
    );
  });

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

describe("planPixChargeMessage", () => {
  const plan = {
    patientName: "Marina Costa",
    planName: "Pilates 2x semana",
    totalValueInCents: 48000,
    totalSessions: 8,
    pixKey: "financeiro@aryana.com.br",
  };
  it("sends the key with the value proportional to the sessions", () => {
    expect(planPixChargeMessage({ ...plan, installments: 1 })).toBe(
      "Olá, Marina! Tudo bem? Seja bem-vindo(a)! Para confirmar, o valor do plano “Pilates 2x semana” é de R$ 480,00, referente a 8 sessões (R$ 60,00 por sessão). Chave Pix: financeiro@aryana.com.br. Assim que fizer o pagamento, envie o comprovante por aqui. Obrigado!",
    );
  });
  it("charges the first installment and keeps the price per session", () => {
    expect(planPixChargeMessage({ ...plan, installments: 3 })).toContain(
      "o plano “Pilates 2x semana” tem 8 sessões por R$ 480,00 (R$ 60,00 por sessão), em 3 parcelas; a 1ª parcela é de R$ 160,00.",
    );
    // O resto da divisão fica na primeira parcela, como em planInstallmentSchedule.
    expect(
      planPixChargeMessage({
        ...plan,
        totalValueInCents: 10000,
        totalSessions: 1,
        installments: 3,
      }),
    ).toContain(
      "tem 1 sessão por R$ 100,00 (R$ 100,00 por sessão), em 3 parcelas; a 1ª parcela é de R$ 33,34.",
    );
  });
});

describe("paymentReceiptMessage", () => {
  const payment = {
    patientName: "Marina Costa",
    amountInCents: 16000,
    paidAt: "2026-11-05T01:30:00.000Z",
    link: "https://crm.example/assinar-recibo/abc",
  };
  it("fills the default message with the first name, value, local date and link", () => {
    expect(paymentReceiptMessage(payment)).toBe(
      "Olá Marina, recebemos seu pagamento de R$ 160,00 em 04/11/2026. Assine o recibo: https://crm.example/assinar-recibo/abc",
    );
  });
  it("uses the clinic template and its time zone; blank falls back to the default", () => {
    const template =
      "{{nome}}: {{valor}} pago em {{data_pagamento}}. {{link_recibo}} {{outro}}";
    expect(
      paymentReceiptMessage({ ...payment, template, timeZone: "UTC" }),
    ).toBe(
      "Marina: R$ 160,00 pago em 05/11/2026. https://crm.example/assinar-recibo/abc {{outro}}",
    );
    expect(paymentReceiptMessage({ ...payment, template: "   " })).toBe(
      paymentReceiptMessage(payment),
    );
  });
  it("offers the four variables in the editor and builds the public path", () => {
    expect(paymentReceiptMessageVariables.map((item) => item.code)).toEqual([
      "{{nome}}",
      "{{valor}}",
      "{{data_pagamento}}",
      "{{link_recibo}}",
    ]);
    expect(receiptSignaturePath("tok")).toBe("/assinar-recibo/tok");
  });
  it("accepts the template in the clinic settings (up to 1000 characters)", () => {
    const base = { name: "Studios Aryana", timezone: "America/Sao_Paulo" };
    expect(
      clinicSettingsInputSchema.parse({
        ...base,
        paymentReceiptMessageTemplate: "  Olá {{nome}}  ",
      }).paymentReceiptMessageTemplate,
    ).toBe("Olá {{nome}}");
    expect(
      clinicSettingsInputSchema.safeParse({
        ...base,
        paymentReceiptMessageTemplate: "x".repeat(1001),
      }).success,
    ).toBe(false);
  });
});

describe("1º pagamento proporcional às aulas até o vencimento", () => {
  // Turma de segunda e quarta: outubro/2026 tem 8 aulas (5, 7, 12, 14, 19, 21, 26, 28).
  const slots = [{ weekday: 1 }, { weekday: 3 }];
  const plan = {
    kind: "recurring" as const,
    totalValueInCents: 40_000,
    validFrom: "2026-10-01",
    firstDueDate: "2026-10-31",
  };
  it("counts the weekly classes between two dates", () => {
    expect(weeklySlotSessionsBetween(slots, "2026-10-01", "2026-10-31")).toBe(
      8,
    );
    expect(weeklySlotSessionsBetween(slots, "2026-10-05", "2026-10-05")).toBe(
      1,
    );
    expect(weeklySlotSessionsBetween(slots, "2026-10-06", "2026-10-06")).toBe(
      0,
    );
    expect(weeklySlotSessionsBetween([], "2026-10-01", "2026-10-31")).toBe(0);
  });
  // Novembro/2026: de 20/10 a 19/11 há 9 aulas de segunda e quarta (21, 26, 28/10 e
  // 2, 4, 9, 11, 16, 18/11); de 10/11 a 19/11, 3 (11, 16, 18).
  const november = {
    kind: "recurring" as const,
    totalValueInCents: 32_000,
    validFrom: "2026-11-10",
    firstDueDate: "2026-11-20",
  };
  it("prices the class by the cycle that ends the day before the first due date", () => {
    expect(planFirstChargeProration(november, slots)).toEqual({
      sessions: 3,
      cycleSessions: 9,
      cycleStart: "2026-10-20",
      cycleEnd: "2026-11-19",
      dueDate: "2026-11-10",
      amountInCents: 10_667,
    });
    // Ciclo de outubro com 8 aulas: de 15/10 a 31/10 há 4 (19, 21, 26, 28).
    expect(
      planFirstChargeProration(
        { ...plan, validFrom: "2026-10-15", firstDueDate: "2026-11-01" },
        slots,
      ),
    ).toMatchObject({ sessions: 4, cycleSessions: 8, amountInCents: 20_000 });
  });
  it("follows the weekdays of the class", () => {
    // Terça, quinta e sábado: 14 aulas de 20/10 a 19/11 e 5 de 10/11 a 19/11.
    const tueThuSat = [{ weekday: 2 }, { weekday: 4 }, { weekday: 6 }];
    expect(
      planFirstChargeProration(
        { ...november, totalValueInCents: 30_000 },
        tueThuSat,
      ),
    ).toMatchObject({ sessions: 5, cycleSessions: 14, amountInCents: 10_714 });
  });
  it("charges more than the monthly value when the first due date is over a month away", () => {
    // De 15/10 a 30/11: 4 aulas em outubro + 9 em novembro, ciclo de novembro com 9.
    expect(
      planFirstChargeProration(
        { ...plan, validFrom: "2026-10-15", firstDueDate: "2026-12-01" },
        slots,
      ),
    ).toMatchObject({ sessions: 13, cycleSessions: 9, amountInCents: 57_778 });
  });
  it("has no prorated charge without a group, classes before the due date or outside recurring plans", () => {
    expect(planFirstChargeProration(november, undefined)).toBeNull();
    expect(planFirstChargeProration(november, [])).toBeNull();
    expect(
      planFirstChargeProration(
        { ...november, firstDueDate: november.validFrom },
        slots,
      ),
    ).toBeNull();
    expect(
      planFirstChargeProration(
        { ...november, firstDueDate: "2026-11-05" },
        slots,
      ),
    ).toBeNull();
    // Início numa quinta (19/11) com vencimento na sexta: nenhuma aula no período.
    expect(
      planFirstChargeProration({ ...november, validFrom: "2026-11-19" }, slots),
    ).toBeNull();
    expect(
      planFirstChargeProration({ ...november, kind: "fixed_package" }, slots),
    ).toBeNull();
  });
  it("adds the prorated charge at the start, before the full monthly charge", () => {
    const terms = withPlanFirstCharge({ ...november, installments: 1 }, slots);
    expect(terms.proratedChargeInCents).toBe(10_667);
    expect(planInstallmentSchedule(terms)).toEqual([
      { installmentNumber: 1, dueDate: "2026-11-10", amountInCents: 10_667 },
      { installmentNumber: 2, dueDate: "2026-11-20", amountInCents: 32_000 },
    ]);
    // Vencer no próprio início remove a cobrança proporcional calculada antes.
    expect(
      withPlanFirstCharge({ ...terms, firstDueDate: "2026-11-10" }, slots),
    ).not.toHaveProperty("proratedChargeInCents");
    // Sem o início do plano não há onde vencer a proporcional.
    expect(
      planInstallmentSchedule({
        totalValueInCents: 30_000,
        installments: 3,
        firstDueDate: "2026-10-15",
        proratedChargeInCents: 5_000,
      }).map((item) => item.amountInCents),
    ).toEqual([10_000, 10_000, 10_000]);
  });
  it("keeps the manual first charge when the proration is turned off", () => {
    const manual = withPlanFirstCharge(
      {
        ...plan,
        firstDueDate: "2026-10-15",
        installments: 1,
        manualFirstCharge: true,
        proratedChargeInCents: 12_345,
      },
      slots,
    );
    expect(manual).toMatchObject({
      manualFirstCharge: true,
      proratedChargeInCents: 12_345,
    });
    // Sem valor, não calcula a proporção (a API pede o valor); fora do recorrente, ou
    // vencendo no próprio início (sem cobrança proporcional), é ignorado.
    expect(
      withPlanFirstCharge(
        { ...plan, firstDueDate: "2026-10-15", manualFirstCharge: true },
        slots,
      ),
    ).not.toHaveProperty("proratedChargeInCents");
    expect(
      withPlanFirstCharge(
        {
          ...plan,
          kind: "fixed_package",
          manualFirstCharge: true,
          proratedChargeInCents: 100,
        },
        slots,
      ),
    ).not.toHaveProperty("manualFirstCharge");
    expect(
      withPlanFirstCharge(
        {
          ...plan,
          firstDueDate: plan.validFrom,
          manualFirstCharge: true,
          proratedChargeInCents: 100,
        },
        slots,
      ),
    ).not.toHaveProperty("manualFirstCharge");
    // A cobrança informada vence no início, antes da mensalidade cheia, e só ela é manual.
    expect(
      planProratedChargeCount({ ...plan, proratedChargeInCents: 12_345 }),
    ).toBe(1);
    expect(
      planProratedChargeCount({
        ...plan,
        proratedChargeInCents: 12_345,
        paymentParts: [
          { paymentMethod: "pix", amountInCents: 20_000, installments: 1 },
          { paymentMethod: "cash", amountInCents: 20_000, installments: 1 },
        ],
      }),
    ).toBe(2);
    expect(planProratedChargeCount(plan)).toBe(0);
    expect(
      planPixChargeMessage({
        patientName: "Marina Costa",
        planName: "Pilates",
        totalValueInCents: 40_000,
        installments: 1,
        totalSessions: 8,
        pixKey: "pix@clinica.com",
        firstChargeInCents: 12_345,
        manualFirstCharge: true,
      }),
    ).toContain(
      "o 1º pagamento, com o valor combinado na venda, é de R$ 123,45",
    );
  });
  it("tells the prorated first charge in the Pix message", () => {
    expect(
      planPixChargeMessage({
        patientName: "Marina Costa",
        planName: "Pilates 2x semana",
        totalValueInCents: 40_000,
        totalSessions: 8,
        installments: 1,
        pixKey: "financeiro@aryana.com.br",
        firstChargeInCents: 20_000,
      }),
    ).toContain(
      "o plano “Pilates 2x semana” tem 8 sessões por R$ 400,00 (R$ 50,00 por sessão); o 1º pagamento, proporcional às aulas até o 1º vencimento, é de R$ 200,00; depois, R$ 400,00 por mês.",
    );
  });
});

describe("planPixChargeMessage with the clinic template", () => {
  it("fills every variable and ignores a blank template", () => {
    const plan = {
      patientName: "Marina Costa",
      planName: "Pilates 2x semana",
      totalValueInCents: 10000,
      totalSessions: 1,
      installments: 3,
      pixKey: "financeiro@aryana.com.br",
    };
    expect(
      planPixChargeMessage({
        ...plan,
        template:
          "{{nome}} / {{nome_completo}} / {{plano}} / {{sessoes}} / {{valor_total}} / {{valor_sessao}} / {{parcelas}} / {{valor_parcela}} / {{chave_pix}} / {{desconhecida}}",
      }),
    ).toBe(
      "Marina / Marina Costa / Pilates 2x semana / 1 sessão / R$ 100,00 / R$ 100,00 / 3 / R$ 33,34 / financeiro@aryana.com.br / {{desconhecida}}",
    );
    expect(planPixChargeMessage({ ...plan, template: "  " })).toBe(
      planPixChargeMessage(plan),
    );
  });
});

describe("receivableContactMessage", () => {
  const installment = {
    patientName: "Bruno Lima",
    description: "Dançaterapia · parcela 2/3",
    amountInCents: 18000,
    dueDate: "2026-10-19",
  };
  it("informs the delay and asks whether something happened", () => {
    expect(
      receivableContactMessage({ ...installment, overdue: true }).replace(
        /\u00a0/g,
        " ",
      ),
    ).toBe(
      'Olá, Bruno! Tudo bem? Notamos que a parcela "Dançaterapia · parcela 2/3" de R$ 180,00, com vencimento em 19/10/2026, ainda está em aberto. Aconteceu alguma coisa? Se precisar, podemos combinar juntos a melhor forma de pagamento.',
    );
  });
  it("only reminds the due date when the installment is not overdue", () => {
    const message = receivableContactMessage({
      ...installment,
      overdue: false,
    });
    expect(message).toContain("vence em 19/10/2026");
    expect(message).not.toContain("Aconteceu alguma coisa?");
  });
});

describe("comissão geral sobre o valor pago", () => {
  it("accepts only the general percentage: service and fixed-amount fields are dropped", () => {
    expect(
      commissionRuleInputSchema.parse({
        professionalId: "6c7a0a52-6a1b-4c4f-9d5e-2f8a1b3c4d5e",
        percentage: 30,
        effectiveFrom: "2026-10-01",
        kind: "fixed",
        fixedAmountInCents: 1500,
        serviceId: "6c7a0a52-6a1b-4c4f-9d5e-2f8a1b3c4d5f",
      }),
    ).toEqual({
      professionalId: "6c7a0a52-6a1b-4c4f-9d5e-2f8a1b3c4d5e",
      percentage: 30,
      effectiveFrom: "2026-10-01",
    });
    expect(
      adminUserUpdateSchema.parse({
        fullName: "Ana Souza",
        role: "user",
        active: true,
        serviceCommissions: [{ percentage: 30, effectiveFrom: "2026-10-01" }],
      }),
    ).not.toHaveProperty("serviceCommissions");
  });
  it("values a plan session by the final plan value with the client's discount", () => {
    const service = { totalSessions: 8, totalValueInCents: 40000 };
    expect(planSessionPaidValueInCents(service, 40000, 0)).toBe(5000);
    expect(planSessionPaidValueInCents(service, 40000, 4000)).toBe(4500);
    // Plano com dois serviços: o desconto é rateado pelo valor de cada um.
    expect(
      planSessionPaidValueInCents(
        { totalSessions: 3, totalValueInCents: 10000 },
        30000,
        3000,
      ),
    ).toBe(3000);
    expect(
      planSessionPaidValueInCents(
        { totalSessions: 3, totalValueInCents: 10000 },
        10000,
        0,
      ),
    ).toBe(3333);
    expect(planSessionPaidValueInCents(service, 0, 0)).toBe(0);
    expect(planSessionPaidValueInCents(service, 40000, 50000)).toBe(0);
  });
});

describe("assinatura pelo link público", () => {
  it("accepts only a valid CPF when signing through the public link", () => {
    const base = {
      signerName: "Cliente",
      accepted: true,
      signatureImage: "data:image/png;base64,cG5n",
    };
    expect(
      publicDocumentSignInputSchema.parse({
        ...base,
        signerCpf: "123.456.789-09",
      }).signerCpf,
    ).toBe("12345678909");
    for (const signerCpf of [
      undefined,
      "",
      "   ",
      "...---",
      "123.456.789-00",
      "111.111.111-11",
    ]) {
      expect(
        publicDocumentSignInputSchema.safeParse({ ...base, signerCpf }).success,
      ).toBe(false);
    }
    expect(publicSignatureInputSchema.parse(base).signerCpf).toBeUndefined();
    expect(
      publicSignatureInputSchema.parse({ ...base, signerCpf: "" }).signerCpf,
    ).toBe("");
    expect(
      publicDocumentSignInputSchema.safeParse({
        ...base,
        signerCpf: "123.456.789-00",
      }).success,
    ).toBe(false);
    expect(
      publicDocumentSignInputSchema.safeParse({
        ...base,
        signerCpf: "111.111.111-11",
      }).success,
    ).toBe(false);
  });

  it("expires an unsigned signature link after 7 days", () => {
    const expiresAt = signatureLinkExpiresAt("2026-10-20T12:00:00.000Z");
    expect(expiresAt).toBe("2026-10-27T12:00:00.000Z");
    expect(
      signatureLinkExpired({ expiresAt }, new Date("2026-10-27T11:59:59Z")),
    ).toBe(false);
    expect(
      signatureLinkExpired({ expiresAt }, new Date("2026-10-27T12:00:00Z")),
    ).toBe(true);
    expect(
      signatureLinkExpired(
        { expiresAt, signedAt: "2026-10-21T10:00:00.000Z" },
        new Date("2026-11-30T12:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("campanhas manuais promocionais", () => {
  const campaign = {
    templateId: "11111111-1111-4111-8111-111111111111",
    name: "Junho",
    audience: {
      mode: "patients",
      patientIds: ["22222222-2222-4222-8222-222222222222"],
    },
  };

  it("aceita promoção por dias depois do envio ou até uma data final", () => {
    expect(
      whatsappCampaignInputSchema.parse(campaign).promotion,
    ).toBeUndefined();
    expect(
      whatsappCampaignInputSchema.parse({
        ...campaign,
        promotion: { validDays: 7 },
      }).promotion,
    ).toEqual({ validDays: 7 });
    expect(
      whatsappCampaignInputSchema.parse({
        ...campaign,
        promotion: { validUntil: "2039-06-30" },
      }).promotion,
    ).toEqual({ validUntil: "2039-06-30" });
    for (const promotion of [
      {},
      { validDays: 0 },
      { validDays: 366 },
      { validUntil: "30/06/2039" },
      { validDays: 7, validUntil: "2039-06-30" },
    ])
      expect(
        whatsappCampaignInputSchema.safeParse({ ...campaign, promotion })
          .success,
      ).toBe(false);
  });

  it("marca a promoção manual ao agendar", () => {
    const promotion = {
      source: "manual",
      campaignId: "55555555-5555-4555-8555-555555555555",
      occurrenceKey: "66666666-6666-4666-8666-666666666666",
    };
    expect(appointmentPromotionSchema.parse(promotion)).toEqual(promotion);
    expect(
      appointmentPromotionSchema.safeParse({ ...promotion, source: "auto" })
        .success,
    ).toBe(false);
  });
});

describe("campanhas automáticas promocionais", () => {
  const campaign = {
    name: "Aniversariantes",
    trigger: "birthday",
    steps: [{ offset: 7, message: "Olá, {{nome}}" }],
  };

  it("accepts an optional promotion with validity and cooldown", () => {
    expect(autoCampaignInputSchema.parse(campaign).promotion).toBeUndefined();
    expect(
      autoCampaignInputSchema.parse({
        ...campaign,
        promotion: { validDays: 10, cooldown: { amount: 3, unit: "weeks" } },
      }).promotion,
    ).toEqual({ validDays: 10, cooldown: { amount: 3, unit: "weeks" } });
    for (const promotion of [
      { validDays: 0 },
      { validDays: 366 },
      { validDays: 10, cooldown: { amount: 0, unit: "days" } },
      { validDays: 10, cooldown: { amount: 1, unit: "years" } },
      {},
      { validDays: 10, validUntil: "2039-12-20" },
      { validUntil: "2039-12-20" },
    ])
      expect(
        autoCampaignInputSchema.safeParse({ ...campaign, promotion }).success,
      ).toBe(false);
  });

  it("accepts a fixed end date outside birthday campaigns", () => {
    const upcoming = { ...campaign, trigger: "appointment_upcoming" };
    expect(
      autoCampaignInputSchema.parse({
        ...upcoming,
        promotion: { validUntil: "2039-12-20" },
      }).promotion,
    ).toEqual({ validUntil: "2039-12-20" });
    expect(
      autoCampaignInputSchema.safeParse({
        ...upcoming,
        promotion: { validUntil: "20/12/2039" },
      }).success,
    ).toBe(false);
  });

  it("takes the promotion used when scheduling", () => {
    const appointment = {
      patientId: "11111111-1111-4111-8111-111111111111",
      professionalId: "22222222-2222-4222-8222-222222222222",
      roomId: "33333333-3333-4333-8333-333333333333",
      serviceId: "44444444-4444-4444-8444-444444444444",
      startsAt: "2039-06-20T13:00:00.000Z",
    };
    const promotion = {
      campaignId: "55555555-5555-4555-8555-555555555555",
      occurrenceKey: "cliente:2039",
    };
    expect(
      appointmentCreateInputSchema.parse({ ...appointment, promotion })
        .promotion,
    ).toEqual(promotion);
    expect(
      recurringAppointmentCreateInputSchema.parse({
        ...appointment,
        occurrences: 4,
        promotion,
      }),
    ).toMatchObject({ occurrences: 4, promotion });
    expect(
      appointmentCreateInputSchema.safeParse({
        ...appointment,
        promotion: { campaignId: "x", occurrenceKey: "" },
      }).success,
    ).toBe(false);
  });
});

describe("patientImportFileSchema", () => {
  const file = { fileName: "clientes.csv", contentBase64: "bm9tZQ==" };

  it("aceita mapeamento de colunas com colunas ignoradas e sem mapeamento", () => {
    expect(patientImportFileSchema.parse(file).mapping).toBeUndefined();
    expect(
      patientImportFileSchema.parse({
        ...file,
        mapping: ["fullName", null, "phoneAreaCode", "phone", "city"],
      }).mapping,
    ).toEqual(["fullName", null, "phoneAreaCode", "phone", "city"]);
  });

  it("recusa campo desconhecido e o mesmo campo em duas colunas", () => {
    expect(
      patientImportFileSchema.safeParse({ ...file, mapping: ["recordNumber"] })
        .success,
    ).toBe(false);
    const repeated = patientImportFileSchema.safeParse({
      ...file,
      mapping: ["phone", null, "phone"],
    });
    expect(repeated.success).toBe(false);
    expect(repeated.error?.issues[0]?.message).toBe(
      "O campo Telefone foi escolhido em mais de uma coluna.",
    );
  });
});

describe("edit history changes", () => {
  it("lists only the labeled fields that changed, in readable pt-BR", () => {
    expect(
      diffAuditFields(
        {
          fullName: "Ana",
          phone: "1199",
          tags: ["VIP"],
          birthDate: "",
          imageConsent: false,
          secret: "a",
        },
        {
          fullName: "Ana",
          phone: "1188",
          tags: [],
          birthDate: "1990-05-20",
          imageConsent: true,
          secret: "b",
        },
        patientAuditLabels,
      ),
    ).toEqual([
      { field: "phone", label: "Telefone", before: "1199", after: "1188" },
      {
        field: "birthDate",
        label: "Data de nascimento",
        before: null,
        after: "20/05/1990",
      },
      { field: "tags", label: "Etiquetas", before: "VIP", after: null },
      {
        field: "imageConsent",
        label: "Autoriza uso de imagem",
        before: "Não",
        after: "Sim",
      },
    ]);
    expect(diffAuditFields({ notes: "" }, {}, patientAuditLabels)).toEqual([]);
    expect(
      diffAuditFields(
        { gender: "female" },
        {
          gender: "male",
          discount: { type: "percentage", percent: 10, scope: "permanent" },
        },
        patientAuditLabels,
      ),
    ).toEqual([
      {
        field: "gender",
        label: "Gênero",
        before: "Feminino",
        after: "Masculino",
      },
      {
        field: "discount",
        label: "Desconto",
        before: null,
        after: "10% de desconto · permanente",
      },
    ]);
  });

  it("trims the reason and limits it to 500 characters", () => {
    expect(changeReasonSchema.parse("  motivo  ")).toBe("motivo");
    expect(changeReasonSchema.parse(undefined)).toBeUndefined();
    expect(changeReasonSchema.safeParse("x".repeat(501)).success).toBe(false);
    expect(auditChangesOf({ changes: [{ field: "a" }] })).toEqual([]);
  });
});

describe("vale da folha", () => {
  it("valida o vale e descreve a despesa e o item da folha", () => {
    const employeeId = "33333333-3333-4333-8333-333333333333";
    expect(
      payrollAdvanceInputSchema.parse({
        employeeId,
        competence: "2026-11",
        amountInCents: 20000,
      }),
    ).toMatchObject({ paymentMethod: "pix" });
    for (const input of [
      { employeeId, competence: "2026-11", amountInCents: 0 },
      { employeeId, competence: "2026-13", amountInCents: 100 },
      {
        employeeId,
        competence: "2026-11",
        amountInCents: 100,
        paidAt: "ontem",
      },
    ])
      expect(payrollAdvanceInputSchema.safeParse(input).success).toBe(false);
    expect(payrollAdvanceDescription("Ana Souza", "2026-11")).toBe(
      "Vale · Ana Souza (desconto em 11/2026)",
    );
    const advance = { kind: "advance", mode: "amount", value: 100 } as const;
    expect(payrollEntryDescription({ ...advance, reason: "" })).toBe("Vale");
    expect(payrollEntryDescription({ ...advance, reason: "Mercado" })).toBe(
      "Vale · Mercado",
    );
  });
});

describe("Telegram (TG1)", () => {
  it("usa só admin como padrão provisório e remove perfis repetidos", () => {
    expect(resolveTelegramLinkRoles(undefined)).toEqual(["admin"]);
    expect(resolveTelegramLinkRoles(["gestora"])).toEqual(["admin"]);
    expect(resolveTelegramLinkRoles([])).toEqual([]);
    expect(
      telegramSettingsInputSchema.parse({
        linkRoles: ["user", "user", "admin"],
      }),
    ).toEqual({ linkRoles: ["user", "admin"] });
    expect(
      telegramSettingsInputSchema.safeParse({ linkRoles: ["gestora"] }).success,
    ).toBe(false);
  });
});
