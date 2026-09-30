import { describe, expect, it } from "vitest";
import {
  defaultRelationshipSettings,
  type Appointment,
  type ContactActivity,
  type Patient,
  type PatientPlan,
  type PatientTab,
  type Receivable,
  type SatisfactionSurvey,
} from "@crm/contracts";
import {
  buildContactSuggestions,
  type ContactSuggestionData,
} from "./contact-suggestions.js";

const today = "2026-09-29";
const settings = defaultRelationshipSettings;
const ana = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bia = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: ana,
    clinicId: "clinic",
    recordNumber: "1",
    status: "active",
    fullName: "Ana Souza",
    phone: "11999990000",
    whatsapp: "",
    birthDate: "",
    tags: [],
    createdAt: "2025-01-01T12:00:00Z",
    updatedAt: "2025-01-01T12:00:00Z",
    ...overrides,
  } as Patient;
}

function plan(overrides: Partial<PatientPlan> = {}): PatientPlan {
  return {
    id: "plan-1",
    clinicId: "clinic",
    patientId: ana,
    patientName: "Ana Souza",
    serviceId: "service",
    serviceName: "Pilates",
    name: "Pacote Pilates",
    kind: "fixed_package",
    totalSessions: 10,
    validFrom: "2026-09-01",
    validUntil: "2026-12-31",
    totalValueInCents: 100000,
    installments: 1,
    firstDueDate: "2026-09-01",
    status: "active",
    remainingSessions: 8,
    autoRenew: false,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
    ...overrides,
  } as PatientPlan;
}

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt-1",
    clinicId: "clinic",
    patientId: ana,
    professionalId: "prof",
    roomId: "room",
    serviceId: "service",
    startsAt: "2026-09-20T13:00:00Z",
    endsAt: "2026-09-20T14:00:00Z",
    status: "completed",
    patientName: "Ana Souza",
    professionalName: "Prof",
    professionalColor: "#000000",
    roomName: "Sala",
    serviceName: "Pilates",
    createdAt: "2026-09-01T12:00:00Z",
    sessions: [],
    attendance: [],
    replacementCredits: [],
    ...overrides,
  } as Appointment;
}

function tab(overrides: Partial<PatientTab> = {}): PatientTab {
  return {
    id: "tab-1",
    clinicId: "clinic",
    patientId: ana,
    patientName: "Ana Souza",
    status: "closed",
    paymentStatus: "paid",
    totalInCents: 5000,
    items: [],
    openedAt: "2026-07-01T12:00:00Z",
    closedAt: "2026-07-01T13:00:00Z",
    ...overrides,
  } as PatientTab;
}

function receivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    id: "rec-1",
    clinicId: "clinic",
    patientId: ana,
    patientName: "Ana Souza",
    description: "Parcela",
    installmentNumber: 1,
    installmentCount: 1,
    dueDate: "2026-09-20",
    amountInCents: 10000,
    status: "open",
    overdue: true,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
    ...overrides,
  };
}

function activity(overrides: Partial<ContactActivity>): ContactActivity {
  return {
    id: "act-1",
    clinicId: "clinic",
    patientId: ana,
    reason: "birthday",
    referenceKey: "",
    outcome: "contacted",
    actorUserId: "user",
    createdAt: "2026-09-28T12:00:00Z",
    ...overrides,
  };
}

function survey(overrides: Partial<SatisfactionSurvey> = {}): SatisfactionSurvey {
  return {
    id: "survey-1",
    clinicId: "clinic",
    patientId: ana,
    patientName: "Ana Souza",
    score: 4,
    actorUserId: "user",
    createdAt: "2026-09-20T13:00:00Z",
    ...overrides,
  };
}

function build(
  data: Partial<ContactSuggestionData>,
  role: Parameters<typeof buildContactSuggestions>[3] = "owner",
) {
  return buildContactSuggestions(
    {
      patients: [patient()],
      plans: [],
      appointments: [],
      receivables: [],
      tabs: [],
      activities: [],
      ...data,
    },
    settings,
    today,
    role,
  );
}

const reasons = (data: Partial<ContactSuggestionData>) =>
  build(data).map((item) => item.reason);

describe("buildContactSuggestions", () => {
  describe("birthday", () => {
    it("suggests birthdays today and within the next days", () => {
      const [suggestion] = build({
        patients: [patient({ birthDate: "1990-10-03", whatsapp: "11988887777" })],
      });
      expect(suggestion).toMatchObject({
        reason: "birthday",
        referenceKey: `${ana}:2026`,
        dueDate: "2026-10-03",
        phone: "11999990000",
        whatsapp: "11988887777",
      });
      expect(build({ patients: [patient({ birthDate: "1990-09-29" })] })[0]?.detail).toBe(
        "Aniversário hoje",
      );
    });

    it("ignores birthdays outside the window, missing birth dates and inactive clients", () => {
      expect(reasons({ patients: [patient({ birthDate: "1990-10-07" })] })).toEqual([]);
      expect(reasons({ patients: [patient({ birthDate: "1990-09-28" })] })).toEqual([]);
      expect(reasons({ patients: [patient({ birthDate: "" })] })).toEqual([]);
      expect(
        reasons({ patients: [patient({ birthDate: "1990-09-29", status: "inactive" })] }),
      ).toEqual([]);
    });

    it("crosses the year and moves 29/02 to 28/02 in non-leap years", () => {
      const newYear = buildContactSuggestions(
        { patients: [patient({ birthDate: "1990-01-02" })], plans: [], appointments: [], receivables: [], tabs: [], activities: [] },
        settings,
        "2026-12-30",
        "owner",
      );
      expect(newYear[0]).toMatchObject({ referenceKey: `${ana}:2027`, dueDate: "2027-01-02" });
      const leap = buildContactSuggestions(
        { patients: [patient({ birthDate: "2000-02-29" })], plans: [], appointments: [], receivables: [], tabs: [], activities: [] },
        settings,
        "2027-02-28",
        "owner",
      );
      expect(leap[0]).toMatchObject({ reason: "birthday", dueDate: "2027-02-28" });
    });
  });

  describe("single_no_return", () => {
    it("suggests when the last purchase is older than the limit", () => {
      const single = plan({
        id: "single-1",
        kind: "single",
        totalSessions: 1,
        remainingSessions: 0,
        status: "expired",
        createdAt: "2026-07-01T12:00:00Z",
      });
      expect(build({ plans: [single] })[0]).toMatchObject({
        reason: "single_no_return",
        referenceKey: "single-1",
      });
      expect(build({ tabs: [tab()] })[0]).toMatchObject({
        reason: "single_no_return",
        referenceKey: "tab-1",
      });
    });

    it("ignores recent purchases, later appointments, later plans and open tabs", () => {
      expect(reasons({ tabs: [tab({ closedAt: "2026-09-01T12:00:00Z" })] })).toEqual([]);
      expect(reasons({ tabs: [tab({ status: "open" })] })).toEqual([]);
      expect(
        reasons({
          tabs: [tab()],
          appointments: [appointment({ status: "scheduled", startsAt: "2026-10-05T13:00:00Z" })],
        }),
      ).toEqual([]);
      expect(
        reasons({
          tabs: [tab()],
          plans: [plan({ status: "expired", validUntil: "2026-01-01", remainingSessions: 0, createdAt: "2026-08-01T12:00:00Z" })],
        }),
      ).toEqual([]);
      // a compra mais recente é a que conta
      expect(
        reasons({ tabs: [tab(), tab({ id: "tab-2", closedAt: "2026-09-10T12:00:00Z" })] }),
      ).toEqual([]);
    });
  });

  describe("plan_expiring", () => {
    it("suggests active plans ending within the limit", () => {
      expect(build({ plans: [plan({ validUntil: "2026-10-03" })] })[0]).toMatchObject({
        reason: "plan_expiring",
        referenceKey: "plan-1",
        dueDate: "2026-10-03",
      });
    });

    it("ignores distant, auto-renewing and already renewed plans", () => {
      expect(reasons({ plans: [plan({ validUntil: "2026-10-07" })] })).toEqual([]);
      expect(reasons({ plans: [plan({ validUntil: "2026-10-03", autoRenew: true })] })).toEqual([]);
      expect(
        reasons({ plans: [plan({ validUntil: "2026-10-03", renewedByPlanId: "plan-2" })] }),
      ).toEqual([]);
    });
  });

  describe("low_balance", () => {
    it("suggests active plans with few sessions left", () => {
      expect(build({ plans: [plan({ remainingSessions: 2 })] })[0]).toMatchObject({
        reason: "low_balance",
        referenceKey: "plan-1",
      });
    });

    it("ignores plans with enough balance, renewed plans and single services", () => {
      expect(reasons({ plans: [plan({ remainingSessions: 3 })] })).toEqual([]);
      expect(reasons({ plans: [plan({ remainingSessions: 1, renewedByPlanId: "plan-2" })] })).toEqual([]);
      expect(
        reasons({
          plans: [plan({ kind: "single", remainingSessions: 1, createdAt: "2026-09-20T12:00:00Z" })],
        }),
      ).toEqual([]);
    });
  });

  describe("expired_with_balance", () => {
    it("suggests recently expired plans with remaining sessions", () => {
      expect(
        build({ plans: [plan({ status: "expired", validUntil: "2026-09-10", remainingSessions: 3 })] })[0],
      ).toMatchObject({ reason: "expired_with_balance", referenceKey: "plan-1" });
    });

    it("ignores old, empty or renewed expired plans", () => {
      expect(
        reasons({ plans: [plan({ status: "expired", validUntil: "2026-07-20", remainingSessions: 3 })] }),
      ).toEqual([]);
      expect(
        reasons({ plans: [plan({ status: "expired", validUntil: "2026-09-10", remainingSessions: 0 })] }),
      ).toEqual([]);
      expect(
        reasons({
          plans: [plan({ status: "expired", validUntil: "2026-09-10", remainingSessions: 3, renewedByPlanId: "p2" })],
        }),
      ).toEqual([]);
    });
  });

  describe("treatment_paused", () => {
    it("suggests when the last completed appointment is old and nothing is booked", () => {
      expect(
        build({
          appointments: [
            appointment({ id: "old", startsAt: "2026-07-01T13:00:00Z" }),
            appointment({ id: "last", startsAt: "2026-08-01T13:00:00Z" }),
          ],
        })[0],
      ).toMatchObject({ reason: "treatment_paused", referenceKey: "last", dueDate: "2026-08-01" });
    });

    it("ignores recent treatment and clients with a future appointment", () => {
      expect(reasons({ appointments: [appointment({ startsAt: "2026-09-10T13:00:00Z" })] })).toEqual([]);
      expect(
        reasons({
          appointments: [
            appointment({ startsAt: "2026-08-01T13:00:00Z" }),
            appointment({ id: "next", status: "confirmed", startsAt: "2026-10-02T13:00:00Z" }),
          ],
        }),
      ).toEqual([]);
    });
  });

  describe("repeated_no_show", () => {
    it("suggests after repeated no-shows in the window", () => {
      expect(
        build({
          appointments: [
            appointment({ id: "ns1", status: "no_show", startsAt: "2026-09-10T13:00:00Z" }),
            appointment({ id: "ns2", status: "no_show", startsAt: "2026-09-25T13:00:00Z" }),
          ],
        })[0],
      ).toMatchObject({ reason: "repeated_no_show", referenceKey: "ns2" });
    });

    it("ignores a single no-show or no-shows outside the window", () => {
      expect(
        reasons({
          appointments: [
            appointment({ id: "ns1", status: "no_show", startsAt: "2026-08-10T13:00:00Z" }),
            appointment({ id: "ns2", status: "no_show", startsAt: "2026-09-25T13:00:00Z" }),
          ],
        }),
      ).toEqual([]);
    });
  });

  describe("former_client", () => {
    it("suggests clients whose plan was cancelled within the window", () => {
      expect(
        build({ plans: [plan({ status: "cancelled", cancelledAt: "2026-08-01T12:00:00Z" })] })[0],
      ).toMatchObject({ reason: "former_client", referenceKey: "plan-1" });
    });

    it("ignores recent or old cancellations and clients with an active plan", () => {
      expect(
        reasons({ plans: [plan({ status: "cancelled", cancelledAt: "2026-09-20T12:00:00Z" })] }),
      ).toEqual([]);
      expect(
        reasons({ plans: [plan({ status: "cancelled", cancelledAt: "2026-05-01T12:00:00Z" })] }),
      ).toEqual([]);
      expect(
        reasons({
          plans: [
            plan({ status: "cancelled", cancelledAt: "2026-08-01T12:00:00Z" }),
            plan({ id: "plan-2" }),
          ],
        }),
      ).toEqual([]);
    });
  });

  describe("overdue_payment", () => {
    it("shows the oldest open overdue installment to owner and finance only", () => {
      const receivables = [
        receivable({ id: "rec-2", dueDate: "2026-09-25" }),
        receivable({ id: "rec-1", dueDate: "2026-09-10" }),
      ];
      for (const role of ["owner", "finance"] as const) {
        expect(build({ receivables }, role)).toMatchObject([
          { reason: "overdue_payment", referenceKey: "rec-1", dueDate: "2026-09-10" },
        ]);
      }
      for (const role of ["reception", "physiotherapist"] as const) {
        expect(build({ receivables }, role)).toEqual([]);
      }
    });

    it("ignores installments due today or later and paid ones", () => {
      expect(reasons({ receivables: [receivable({ dueDate: today })] })).toEqual([]);
      expect(reasons({ receivables: [receivable({ status: "paid" })] })).toEqual([]);
    });
  });

  describe("nps_detractor", () => {
    it("suggests the most recent detractor survey of the last 30 days", () => {
      expect(
        build({
          surveys: [
            survey({ id: "survey-old", score: 2, createdAt: "2026-09-05T13:00:00Z" }),
            survey({ id: "survey-new", score: 6, createdAt: "2026-09-20T13:00:00Z" }),
          ],
        }),
      ).toMatchObject([
        {
          reason: "nps_detractor",
          referenceKey: "survey-new",
          dueDate: "2026-09-20",
          priority: 10,
        },
      ]);
    });

    it("uses the clinic date and a 30-day window", () => {
      // 30/08 às 23h30 em São Paulo = 31/08 02h30 UTC: 30 dias antes de hoje.
      expect(
        reasons({ surveys: [survey({ createdAt: "2026-08-31T02:30:00Z" })] }),
      ).toEqual(["nps_detractor"]);
      expect(
        reasons({ surveys: [survey({ createdAt: "2026-08-30T02:30:00Z" })] }),
      ).toEqual([]);
    });

    it("ignores passives, promoters, other clients and inactive clients", () => {
      expect(reasons({ surveys: [survey({ score: 7 })] })).toEqual([]);
      expect(reasons({ surveys: [survey({ score: 10 })] })).toEqual([]);
      expect(reasons({ surveys: [survey({ patientId: bia })] })).toEqual([]);
      expect(
        reasons({
          patients: [patient({ status: "inactive" })],
          surveys: [survey({ score: 0 })],
        }),
      ).toEqual([]);
    });

    it("is hidden by an activity for the same survey", () => {
      expect(
        reasons({
          surveys: [survey()],
          activities: [activity({ reason: "nps_detractor", referenceKey: "survey-1" })],
        }),
      ).toEqual([]);
      expect(
        reasons({
          surveys: [survey({ id: "survey-2" })],
          activities: [activity({ reason: "nps_detractor", referenceKey: "survey-1" })],
        }),
      ).toEqual(["nps_detractor"]);
    });
  });

  describe("suppression", () => {
    const data = { plans: [plan({ validUntil: "2026-10-03" })] };

    it("hides a suggestion with a matching activity", () => {
      expect(
        reasons({
          ...data,
          activities: [activity({ reason: "plan_expiring", referenceKey: "plan-1" })],
        }),
      ).toEqual([]);
      // outra referência não esconde
      expect(
        reasons({
          ...data,
          activities: [activity({ reason: "plan_expiring", referenceKey: "plan-0" })],
        }),
      ).toEqual(["plan_expiring"]);
    });

    it("hides a snoozed suggestion until snoozeUntil inclusive", () => {
      const snoozed = (snoozeUntil: string) => ({
        ...data,
        activities: [
          activity({ reason: "plan_expiring", referenceKey: "plan-1", outcome: "snoozed", snoozeUntil }),
        ],
      });
      expect(reasons(snoozed("2026-10-01"))).toEqual([]);
      expect(reasons(snoozed(today))).toEqual([]);
      expect(reasons(snoozed("2026-09-28"))).toEqual(["plan_expiring"]);
    });
  });

  it("orders overdue payments, today's birthdays, then the table order", () => {
    const result = build({
      patients: [
        patient({ birthDate: "1990-10-02" }),
        patient({ id: bia, fullName: "Bia Lima", birthDate: "1991-09-29" }),
      ],
      plans: [
        plan({ validUntil: "2026-10-05" }),
        plan({ id: "plan-b", patientId: bia, validUntil: "2026-10-01" }),
        plan({ id: "plan-low", patientId: bia, remainingSessions: 1 }),
      ],
      receivables: [receivable({ patientId: bia })],
    });
    expect(result.map((item) => [item.reason, item.patientId])).toEqual([
      ["overdue_payment", bia],
      ["birthday", bia],
      ["birthday", ana],
      ["plan_expiring", bia],
      ["plan_expiring", ana],
      ["low_balance", bia],
    ]);
  });

  it("ignores lead appointments (sem cliente) in every rule", () => {
    const base: Partial<Appointment> = appointment();
    delete base.patientId;
    const leadAppointment = (overrides: Partial<Appointment>) =>
      ({
        ...base,
        leadId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        leadName: "Ana Souza",
        visitType: "trial",
        ...overrides,
      }) as Appointment;
    // Faltas seguidas e tratamento parado só com atendimentos de lead: nada.
    expect(
      reasons({
        appointments: [
          leadAppointment({ id: "l1", status: "no_show", startsAt: "2026-09-10T13:00:00Z" }),
          leadAppointment({ id: "l2", status: "no_show", startsAt: "2026-09-17T13:00:00Z" }),
          leadAppointment({ id: "l3", status: "no_show", startsAt: "2026-09-24T13:00:00Z" }),
          leadAppointment({ id: "l4", status: "completed", startsAt: "2026-06-01T13:00:00Z" }),
        ],
      }),
    ).toEqual([]);
    // Atendimento de lead depois da última compra não conta como retorno.
    expect(
      reasons({
        tabs: [tab()],
        appointments: [
          leadAppointment({ id: "l5", status: "scheduled", startsAt: "2026-10-05T13:00:00Z" }),
        ],
      }),
    ).toEqual(["single_no_return"]);
  });
});
