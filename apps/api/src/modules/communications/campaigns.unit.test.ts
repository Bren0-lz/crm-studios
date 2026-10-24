import {
  whatsappCampaignSegmentSchema,
  type Appointment,
  type Patient,
  type PatientPlan,
} from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  ageOn,
  buildCampaignAudience,
  filterCampaignSegment,
  type CampaignFilterData,
} from "./campaigns.js";

const today = "2026-10-21";
const now = new Date("2026-10-21T15:00:00Z");

function patient(id: string, overrides: Partial<Patient> = {}): Patient {
  return {
    id,
    clinicId: "c",
    recordNumber: id,
    fullName: `Cliente ${id}`,
    phone: "11999990000",
    tags: [],
    status: "active",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  } as Patient;
}

function appointment(
  patientId: string,
  startsAt: string,
  overrides: Partial<Appointment> = {},
): Appointment {
  return {
    id: `${patientId}-${startsAt}`,
    patientId,
    startsAt,
    status: "completed",
    serviceId: "s-pilates",
    professionalId: "pro-ana",
    ...overrides,
  } as Appointment;
}

const data = (
  overrides: Partial<CampaignFilterData> = {},
): CampaignFilterData => ({
  plans: [],
  preferences: [],
  appointments: [],
  overduePatientIds: new Set(),
  contactedPatientIds: new Set(),
  now,
  timezone: "America/Sao_Paulo",
  ...overrides,
});

const ids = (
  patients: Patient[],
  segment: Record<string, unknown>,
  extra: Partial<CampaignFilterData> = {},
) =>
  filterCampaignSegment(
    patients,
    data(extra),
    whatsappCampaignSegmentSchema.parse(segment),
    today,
  ).map((item) => item.id);

describe("filtros da campanha", () => {
  it("combina etiquetas em 'todas' e exclui etiquetas", () => {
    const list = [
      patient("a", { tags: ["Pilates", "Frequente"] }),
      patient("b", { tags: ["Pilates"] }),
      patient("c", { tags: ["Pilates", "Frequente", "Sem retorno"] }),
    ];
    expect(ids(list, { tags: ["Pilates", "Frequente"] })).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      ids(list, { tags: ["Pilates", "Frequente"], tagMode: "all" }),
    ).toEqual(["a", "c"]);
    expect(
      ids(list, {
        tags: ["Pilates"],
        excludeTags: ["Sem retorno"],
      }),
    ).toEqual(["a", "b"]);
  });

  it("filtra por idade, mês de aniversário e clientes novos", () => {
    expect(ageOn("1990-10-22", today)).toBe(35);
    expect(ageOn("1990-10-21", today)).toBe(36);
    const list = [
      patient("a", { birthDate: "1990-03-10" }),
      patient("b", { birthDate: "2001-12-01", clientSince: "2026-10-01" }),
      patient("c"),
    ];
    expect(ids(list, { ageMin: 30 })).toEqual(["a"]);
    expect(ids(list, { ageMax: 30 })).toEqual(["b"]);
    expect(ids(list, { birthMonth: 12 })).toEqual(["b"]);
    expect(ids(list, { newClientDays: 30 })).toEqual(["b"]);
  });

  it("usa a agenda: serviço, profissional, ausência, visita recente e agendamento futuro", () => {
    const list = [patient("a"), patient("b"), patient("c")];
    const appointments = [
      appointment("a", "2026-10-10T12:00:00Z"),
      appointment("b", "2026-06-01T12:00:00Z", {
        serviceId: "s-danca",
        professionalId: "pro-clara",
      }),
      appointment("b", "2026-11-02T12:00:00Z", { status: "scheduled" }),
      appointment("c", "2026-10-15T12:00:00Z", { status: "cancelled" }),
    ];
    const run = (segment: Record<string, unknown>) =>
      ids(list, segment, { appointments });
    expect(
      run({ serviceIds: ["11111111-1111-4111-8111-111111111111"] }),
    ).toEqual([]);
    expect(
      filterCampaignSegment(
        list,
        data({ appointments }),
        {
          ...whatsappCampaignSegmentSchema.parse({}),
          serviceIds: ["s-danca"],
        },
        today,
      ).map((item) => item.id),
    ).toEqual(["b"]);
    expect(
      filterCampaignSegment(
        list,
        data({ appointments }),
        {
          ...whatsappCampaignSegmentSchema.parse({}),
          professionalIds: ["pro-ana"],
        },
        today,
      ).map((item) => item.id),
    ).toEqual(["a", "b"]);
    // Ausentes há 60+ dias: b (última em junho) e c (nunca veio; o cancelado não conta).
    expect(run({ absentDays: 60 })).toEqual(["b", "c"]);
    expect(run({ visitedWithinDays: 30 })).toEqual(["a"]);
    expect(run({ noUpcomingAppointment: true })).toEqual(["a", "c"]);
  });

  it("usa planos, parcelas vencidas e quem já recebeu campanha", () => {
    const list = [patient("a"), patient("b"), patient("c")];
    const plans = [
      {
        patientId: "a",
        status: "active",
        validUntil: "2026-11-01",
        remainingSessions: 6,
      },
      {
        patientId: "b",
        status: "active",
        validUntil: "2027-03-01",
        remainingSessions: 1,
      },
      {
        patientId: "c",
        status: "expired",
        validUntil: "2026-10-25",
        remainingSessions: 0,
      },
    ] as PatientPlan[];
    expect(ids(list, { planExpiringDays: 15 }, { plans })).toEqual(["a"]);
    expect(ids(list, { maxRemainingSessions: 2 }, { plans })).toEqual(["b"]);
    expect(
      ids(list, { overdue: true }, { overduePatientIds: new Set(["c"]) }),
    ).toEqual(["c"]);
    expect(
      ids(
        list,
        { excludeContactedDays: 7 },
        { contactedPatientIds: new Set(["a"]) },
      ),
    ).toEqual(["b", "c"]);
  });

  it("filtra quem tem atendimento aberto no dia, no fuso da clínica", () => {
    const list = [patient("a"), patient("b"), patient("c"), patient("d")];
    const appointments = [
      // 22/10 às 23:30 em São Paulo = 23/10 02:30 UTC: conta como dia 22.
      appointment("a", "2026-10-23T02:30:00Z", { status: "scheduled" }),
      appointment("b", "2026-10-22T13:00:00Z", { status: "cancelled" }),
      appointment("c", "2026-10-23T13:00:00Z", { status: "confirmed" }),
      appointment("d", "2026-10-22T12:00:00Z", { status: "confirmed" }),
    ];
    expect(
      ids(
        list,
        { appointmentFrom: "2026-10-22", appointmentTo: "2026-10-22" },
        { appointments },
      ),
    ).toEqual(["a", "d"]);
  });

  it("filtra atendimentos num período, pela situação escolhida", () => {
    const list = [patient("a"), patient("b"), patient("c"), patient("d")];
    const appointments = [
      appointment("a", "2026-09-05T13:00:00Z", { status: "completed" }),
      appointment("b", "2026-09-30T13:00:00Z", { status: "no_show" }),
      appointment("c", "2026-10-01T13:00:00Z", { status: "completed" }),
      appointment("d", "2026-10-25T13:00:00Z", { status: "scheduled" }),
      appointment("d", "2026-09-10T13:00:00Z", { status: "cancelled" }),
    ];
    const september = {
      appointmentFrom: "2026-09-01",
      appointmentTo: "2026-09-30",
    };
    expect(ids(list, september, { appointments })).toEqual([]);
    expect(
      ids(
        list,
        { ...september, appointmentStatus: "completed" },
        { appointments },
      ),
    ).toEqual(["a"]);
    expect(
      ids(list, { ...september, appointmentStatus: "any" }, { appointments }),
    ).toEqual(["a", "b"]);
    // Só início: a partir do dia; só fim: até o dia.
    expect(
      ids(
        list,
        { appointmentFrom: "2026-10-01", appointmentStatus: "any" },
        { appointments },
      ),
    ).toEqual(["c", "d"]);
    expect(
      ids(
        list,
        { appointmentTo: "2026-09-05", appointmentStatus: "any" },
        { appointments },
      ),
    ).toEqual(["a"]);
  });

  it("com período, serviço e profissional valem só para os atendimentos dele", () => {
    const list = [patient("a"), patient("b")];
    const pilates = "00000000-0000-4000-8000-000000000001";
    const danca = "00000000-0000-4000-8000-000000000002";
    const appointments = [
      // a: Pilates em setembro; b: Pilates só em agosto, outro serviço em setembro.
      appointment("a", "2026-09-05T13:00:00Z", { serviceId: pilates }),
      appointment("b", "2026-08-05T13:00:00Z", { serviceId: pilates }),
      appointment("b", "2026-09-05T13:00:00Z", { serviceId: danca }),
    ];
    expect(
      ids(
        list,
        {
          appointmentFrom: "2026-09-01",
          appointmentTo: "2026-09-30",
          appointmentStatus: "completed",
          serviceIds: [pilates],
        },
        { appointments },
      ),
    ).toEqual(["a"]);
    expect(ids(list, { serviceIds: [pilates] }, { appointments })).toEqual([
      "a",
      "b",
    ]);
  });

  it("recusa período com fim antes do início", () => {
    expect(
      whatsappCampaignSegmentSchema.safeParse({
        appointmentFrom: "2026-10-10",
        appointmentTo: "2026-10-01",
      }).success,
    ).toBe(false);
  });
});

describe("mensagem da campanha com data e hora do atendimento", () => {
  const body =
    "Oi, {{nome}}! Até {{data_atendimento}} às {{hora_atendimento}}.";

  it("usa o atendimento do período filtrado e pula quem não tem atendimento", () => {
    const plan = buildCampaignAudience(
      [patient("a", { fullName: "Ana Souza" }), patient("b")],
      data({
        appointments: [
          appointment("a", "2026-10-22T18:00:00Z", { status: "scheduled" }),
          appointment("a", "2026-10-22T12:30:00Z", { status: "confirmed" }),
          appointment("b", "2026-10-23T12:00:00Z", { status: "scheduled" }),
        ],
      }),
      { mode: "patients", patientIds: ["a", "b"] },
      body,
      today,
    );
    expect(plan.drafts.map((item) => item.message)).toEqual([
      "Oi, Ana! Até 22/10 às 09:30.",
      "Oi, Cliente! Até 23/10 às 09:00.",
    ]);

    const filtered = buildCampaignAudience(
      [patient("a", { fullName: "Ana Souza" })],
      data({
        appointments: [
          appointment("a", "2026-10-22T18:00:00Z", { status: "scheduled" }),
          appointment("a", "2026-10-23T12:30:00Z", { status: "confirmed" }),
        ],
      }),
      {
        mode: "segment",
        segment: whatsappCampaignSegmentSchema.parse({
          appointmentFrom: "2026-10-23",
          appointmentTo: "2026-10-23",
        }),
      },
      body,
      today,
    );
    expect(filtered.drafts[0]?.message).toBe("Oi, Ana! Até 23/10 às 09:30.");

    const none = buildCampaignAudience(
      [patient("c")],
      data({
        appointments: [
          appointment("c", "2026-10-01T12:00:00Z", { status: "completed" }),
        ],
      }),
      { mode: "patients", patientIds: ["c"] },
      body,
      today,
    );
    expect(none.drafts).toEqual([]);
    expect(none.skipped).toEqual([
      { patientId: "c", patientName: "Cliente c", reason: "no_appointment" },
    ]);
  });
});
