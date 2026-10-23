import {
  whatsappCampaignSegmentSchema,
  type Appointment,
  type Patient,
  type PatientPlan,
} from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  ageOn,
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
});
