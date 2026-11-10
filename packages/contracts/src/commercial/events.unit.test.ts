import { describe, expect, it } from "vitest";
import {
  appModuleSchema,
  buildEventIndicators,
  EVENT_LEAD_DEFAULT_INTEREST,
  EVENT_NAME_MAX,
  eventInputSchema,
  eventLeadInputSchema,
  eventImportFileSchema,
  eventLeadSource,
  eventListQuerySchema,
  eventParticipantStatus,
  eventParticipantStatusLabels,
  eventParticipantStatuses,
  hasEventInterest,
  LEAD_NOTES_MAX,
  leadContactInputSchema,
  leadInputSchema,
  normalizePermissions,
  permissionCatalog,
  type EventParticipant,
} from "../index.js";

const participant = (
  fields: Partial<EventParticipant> = {},
): EventParticipant => ({
  id: "lead",
  clinicId: "clinic",
  fullName: "Participante",
  phone: "11999990000",
  source: eventLeadSource("Aulão"),
  interest: EVENT_LEAD_DEFAULT_INTEREST,
  tags: [],
  stage: "new_contact",
  openTasks: 0,
  overdueTasks: 0,
  createdAt: "2026-11-08T12:00:00.000Z",
  updatedAt: "2026-11-08T12:00:00.000Z",
  ...fields,
});

describe("eventos do comercial", () => {
  it("aceita o serviço do evento (opcional) e o filtro por serviço", () => {
    const serviceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const valid = { name: "Aulão", startsAt: "2026-11-08T12:00:00.000Z" };
    expect(eventInputSchema.parse({ ...valid, serviceId })).toMatchObject({
      serviceId,
    });
    expect(eventInputSchema.safeParse({ ...valid, serviceId: "" }).success).toBe(
      true,
    );
    expect(eventListQuerySchema.parse({ serviceId })).toEqual({ serviceId });
    expect(eventListQuerySchema.parse({})).toEqual({});
    expect(eventListQuerySchema.safeParse({ serviceId: "x" }).success).toBe(
      false,
    );
  });

  it("deriva um status único por participante, na ordem do funil do evento", () => {
    expect(eventParticipantStatuses).toEqual([
      "not_contacted",
      "contacted",
      "interested",
      "evaluation",
      "client",
    ]);
    expect(
      eventParticipantStatuses.map((key) => eventParticipantStatusLabels[key]),
    ).toEqual([
      "Não contatado",
      "Contatado",
      "Interessado",
      "Avaliação",
      "Cliente",
    ]);
    const at = "2026-11-10T13:00:00.000Z";
    expect(eventParticipantStatus(participant())).toBe("not_contacted");
    // Tentativa sem resposta não conta como contato (igual ao indicador).
    expect(eventParticipantStatus(participant({ lastContactAt: at }))).toBe(
      "not_contacted",
    );
    expect(eventParticipantStatus(participant({ contactedAt: at }))).toBe(
      "contacted",
    );
    expect(
      eventParticipantStatus(participant({ contactedAt: at, interest: "Pilates" })),
    ).toBe("interested");
    expect(eventParticipantStatus(participant({ interests: ["Dança"] }))).toBe(
      "interested",
    );
    // Perdido com interesse não conta como interessado (igual ao indicador).
    expect(
      eventParticipantStatus(
        participant({ contactedAt: at, interest: "Pilates", stage: "lost" }),
      ),
    ).toBe("contacted");
    expect(
      eventParticipantStatus(participant({ evaluationAt: at, contactedAt: at })),
    ).toBe("evaluation");
    expect(
      eventParticipantStatus(
        participant({ evaluationAt: at, convertedPatientId: "patient" }),
      ),
    ).toBe("client");
    // Cada participante cai em um status só; os indicadores contam etapas alcançadas.
    const items = [
      participant({ contactedAt: at }),
      participant({ interest: "Pilates" }),
      participant({ evaluationAt: at }),
      participant({ convertedPatientId: "patient" }),
    ];
    expect(items.map(eventParticipantStatus)).toEqual([
      "contacted",
      "interested",
      "evaluation",
      "client",
    ]);
  });

  it("valida o evento e cabe o nome na origem do lead", () => {
    const valid = {
      name: "Aulão na praça",
      startsAt: "2026-11-08T12:00:00.000Z",
    };
    expect(eventInputSchema.parse(valid)).toEqual(valid);
    expect(
      eventInputSchema.safeParse({
        ...valid,
        location: "Campinas",
        attendeeCount: 130,
        notes: "",
        branchId: "",
      }).success,
    ).toBe(true);
    for (const invalid of [
      { ...valid, name: " A " },
      { ...valid, name: "x".repeat(EVENT_NAME_MAX + 1) },
      { ...valid, startsAt: "2026-11-08" },
      { ...valid, attendeeCount: 1.5 },
      { ...valid, branchId: "matriz" },
      { ...valid, serviceId: "pilates" },
    ])
      expect(eventInputSchema.safeParse(invalid).success).toBe(false);
    const longest = eventLeadSource("x".repeat(EVENT_NAME_MAX));
    expect(longest).toMatch(/^Evento: x+$/);
    expect(
      leadInputSchema.safeParse({
        fullName: "Participante",
        phone: "11999990000",
        source: longest,
        interest: EVENT_LEAD_DEFAULT_INTEREST,
      }).success,
    ).toBe(true);
  });

  it("aceita participantes sem campos e valida o mapeamento", () => {
    const eventId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(eventLeadInputSchema.parse({ eventId })).toMatchObject({
      fullName: "",
      phone: "",
      interest: "Evento",
      tags: [],
    });
    expect(
      eventLeadInputSchema.parse({ eventId, phone: "123", fullName: "A" })
        .phone,
    ).toBe("123");
    expect(
      eventLeadInputSchema.parse({ eventId, phone: "+55 (11) 99999-1234" })
        .phone,
    ).toBe("11999991234");
    expect(eventLeadInputSchema.safeParse({ phone: "123" }).success).toBe(
      false,
    );
    const file = { fileName: "lista.csv", contentBase64: "eA==" };
    expect(
      eventImportFileSchema.safeParse({
        ...file,
        mapping: [null, "email", "notes"],
      }).success,
    ).toBe(true);
    expect(
      eventImportFileSchema.safeParse({ ...file, mapping: ["phone", "phone"] })
        .success,
    ).toBe(false);
    expect(
      eventImportFileSchema.safeParse({ ...file, mapping: ["desconhecido"] })
        .success,
    ).toBe(false);
  });

  it("conta interesse só quando diferente do padrão 'Evento'", () => {
    expect(hasEventInterest(participant())).toBe(false);
    expect(hasEventInterest(participant({ interest: " evento " }))).toBe(false);
    expect(hasEventInterest(participant({ interest: "Pilates" }))).toBe(true);
    expect(hasEventInterest(participant({ interests: ["Dança"] }))).toBe(true);
  });

  it("calcula os quatro indicadores", () => {
    expect(
      buildEventIndicators([
        participant({
          lastContactAt: "2026-11-09T12:00:00.000Z",
          contactedAt: "2026-11-09T12:00:00.000Z",
        }),
        participant({
          interest: "Pilates",
          lastContactAt: "2026-11-09T12:00:00.000Z",
          contactedAt: "2026-11-09T12:00:00.000Z",
          evaluationAt: "2026-11-12T13:00:00.000Z",
        }),
        participant({
          interest: "Dança",
          stage: "won",
          convertedPatientId: "patient",
          evaluationAt: "2026-11-12T15:00:00.000Z",
        }),
        participant({
          interest: "Pilates",
          stage: "lost",
          lostReason: "Mudou",
        }),
        // Tentativa sem resposta: tem último contato, mas não conta como contatado.
        participant({ lastContactAt: "2026-11-10T12:00:00.000Z" }),
      ]),
    ).toEqual({ contacted: 2, interested: 2, evaluations: 2, converted: 1 });
    expect(buildEventIndicators([])).toEqual({
      contacted: 0,
      interested: 0,
      evaluations: 0,
      converted: 0,
    });
  });

  it("registra contato feito ou tentativa, com observação de até 2000 caracteres", () => {
    const contact = {
      channel: "phone",
      direction: "outbound",
      notes: "Não atendeu",
    } as const;
    expect(LEAD_NOTES_MAX).toBe(2000);
    expect(
      leadContactInputSchema.parse({ ...contact, reached: false }).reached,
    ).toBe(false);
    expect(leadContactInputSchema.parse(contact).reached).toBeUndefined();
    expect(
      leadContactInputSchema.safeParse({
        ...contact,
        notes: "x".repeat(LEAD_NOTES_MAX),
      }).success,
    ).toBe(true);
    expect(
      leadContactInputSchema.safeParse({
        ...contact,
        notes: "x".repeat(LEAD_NOTES_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("tem módulo e permissões próprios, ao lado do CRM", () => {
    const modules = appModuleSchema.options;
    expect(modules.indexOf("events")).toBe(modules.indexOf("crm") + 1);
    expect(
      permissionCatalog
        .filter((item) => item.module === "events")
        .map(({ key, dependencies }) => ({ key, dependencies })),
    ).toEqual([
      { key: "events.view", dependencies: [] },
      { key: "events.manage", dependencies: ["events.view"] },
    ]);
    expect(normalizePermissions(["events.manage"])).toEqual([]);
  });
});
