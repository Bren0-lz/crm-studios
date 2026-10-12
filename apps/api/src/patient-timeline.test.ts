import { describe, expect, it } from "vitest";
import type {
  Appointment,
  ContactActivity,
  OutboundMessage,
  PatientPlan,
  ReceivedPayment,
  SatisfactionSurvey,
} from "@crm/contracts";
import { buildPatientTimeline } from "./patient-timeline.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const patientId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherPatientId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function appointment(
  id: string,
  startsAt: string,
  status: Appointment["status"],
  owner = patientId,
): Appointment {
  return {
    id,
    clinicId,
    patientId: owner,
    professionalId: "p1",
    roomId: "r1",
    serviceId: "s1",
    startsAt,
    endsAt: startsAt,
    status,
    patientName: "Ana",
    professionalName: "Dra. Paula",
    professionalColor: "#000000",
    roomName: "Sala 1",
    serviceName: "Pilates",
    createdAt: startsAt,
    updatedAt: startsAt,
  } as Appointment;
}

function plan(overrides: Partial<PatientPlan>): PatientPlan {
  return {
    services: [{ serviceId: "s1", totalSessions: 8, totalValueInCents: 40000, remainingSessions: 8, serviceName: "Pilates" }],
    id: "plan-1",
    clinicId,
    patientId,
    patientName: "Ana",
    serviceId: "s1",
    serviceName: "Pilates",
    name: "Pacote mensal",
    kind: "fixed_package",
    totalSessions: 8,
    validFrom: "2026-08-01",
    totalValueInCents: 40000,
    installments: 1,
    firstDueDate: "2026-08-01",
    status: "active",
    remainingSessions: 8,
    autoRenew: false,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    ...overrides,
  } as PatientPlan;
}

describe("patient timeline", () => {
  it("merges every source from the most recent to the oldest, only for the patient", () => {
    const payments: ReceivedPayment[] = [
      {
        id: "pay-1",
        receivableId: "rec-1",
        kind: "payment",
        occurredAt: "2026-08-02T12:00:00.000Z",
        patientId,
        patientName: "Ana",
        description: "Pacote mensal 1/1",
        amountInCents: 40000,
        paymentMethod: "pix",
      },
      {
        id: "rev-1",
        receivableId: "rec-1",
        kind: "reversal",
        occurredAt: "2026-08-03T12:00:00.000Z",
        patientId,
        patientName: "Ana",
        description: "Pacote mensal 1/1",
        amountInCents: -40000,
      },
      {
        id: "pay-other",
        receivableId: "rec-2",
        kind: "payment",
        occurredAt: "2026-08-03T13:00:00.000Z",
        patientId: otherPatientId,
        patientName: "Bia",
        description: "Outro",
        amountInCents: 100,
      },
    ];
    const contacts: ContactActivity[] = [
      {
        id: "contact-1",
        clinicId,
        patientId,
        reason: "plan_expiring",
        referenceKey: "plan-1",
        outcome: "scheduled",
        notes: "Vai renovar",
        actorUserId: "u1",
        createdAt: "2026-08-20T12:00:00.000Z",
      },
    ];
    const messages: OutboundMessage[] = [
      {
        id: "msg-1",
        clinicId,
        patientId,
        patientName: "Ana",
        channel: "whatsapp",
        kind: "appointment_reminder",
        recipient: "11999990000",
        body: "Lembrete do seu horário",
        status: "sent",
        scheduledFor: "2026-08-09T12:00:00.000Z",
        sentAt: "2026-08-09T12:05:00.000Z",
        attempts: 1,
        createdAt: "2026-08-08T12:00:00.000Z",
      },
      {
        id: "msg-2",
        clinicId,
        patientId,
        patientName: "Ana",
        channel: "email",
        kind: "manual",
        recipient: "ana@example.com",
        body: "Olá",
        status: "queued",
        scheduledFor: "2026-08-25T12:00:00.000Z",
        attempts: 0,
        createdAt: "2026-08-24T12:00:00.000Z",
      },
    ];
    const surveys: SatisfactionSurvey[] = [
      {
        id: "survey-1",
        clinicId,
        patientId,
        patientName: "Ana",
        appointmentId: "appt-1",
        score: 9,
        comment: "Ótimo",
        actorUserId: "u1",
        createdAt: "2026-08-10T15:00:00.000Z",
      },
      {
        id: "survey-2",
        clinicId,
        patientId,
        patientName: "Ana",
        score: 4,
        actorUserId: "u1",
        createdAt: "2026-08-11T15:00:00.000Z",
      },
    ];

    const timeline = buildPatientTimeline(patientId, {
      appointments: [
        appointment("appt-1", "2026-08-10T13:00:00.000Z", "completed"),
        appointment("appt-other", "2026-08-10T14:00:00.000Z", "completed", otherPatientId),
      ],
      plans: [
        plan({
          id: "plan-1",
          cancelledAt: "2026-08-15T12:00:00.000Z",
          cancelledValueInCents: 30000,
          status: "cancelled",
        }),
        plan({
          id: "plan-2",
          renewedFromPlanId: "plan-1",
          createdAt: "2026-09-01T12:00:00.000Z",
          totalValueInCents: 45000,
        }),
        plan({ id: "plan-other", patientId: otherPatientId }),
      ],
      payments,
      contacts,
      messages,
      surveys,
    });

    expect(timeline.map((item) => item.id)).toEqual([
      "plan_renewed:plan-2",
      "message:msg-2",
      "contact:contact-1",
      "plan_cancelled:plan-1",
      "satisfaction:survey-2",
      "satisfaction:survey-1",
      "appointment:appt-1",
      "message:msg-1",
      "payment_reversal:rev-1",
      "payment:pay-1",
      "plan_created:plan-1",
    ]);
    const byId = new Map(timeline.map((item) => [item.id, item]));
    expect(byId.get("appointment:appt-1")).toEqual({
      id: "appointment:appt-1",
      kind: "appointment",
      occurredAt: "2026-08-10T13:00:00.000Z",
      title: "Pilates com Dra. Paula",
      detail: "Finalizado",
      status: "completed",
    });
    expect(byId.get("plan_created:plan-1")).toMatchObject({
      kind: "plan_created",
      title: "Plano contratado: Pacote mensal",
      detail: "Pilates",
      amountInCents: 40000,
    });
    expect(byId.get("plan_renewed:plan-2")).toMatchObject({
      kind: "plan_renewed",
      title: "Plano renovado: Pacote mensal",
      amountInCents: 45000,
    });
    expect(byId.get("plan_cancelled:plan-1")).toMatchObject({
      kind: "plan_cancelled",
      occurredAt: "2026-08-15T12:00:00.000Z",
      amountInCents: -30000,
    });
    expect(byId.get("payment:pay-1")).toMatchObject({
      kind: "payment",
      title: "Pagamento recebido",
      detail: "Pacote mensal 1/1 · Pix",
      amountInCents: 40000,
    });
    expect(byId.get("payment_reversal:rev-1")).toMatchObject({
      kind: "payment_reversal",
      title: "Estorno de pagamento",
      detail: "Pacote mensal 1/1",
      amountInCents: -40000,
    });
    expect(byId.get("contact:contact-1")).toMatchObject({
      kind: "contact",
      title: "Contato: Plano acabando",
      detail: "Agendou horário · Vai renovar",
      status: "scheduled",
    });
    expect(byId.get("message:msg-1")).toMatchObject({
      kind: "message",
      occurredAt: "2026-08-09T12:05:00.000Z",
      title: "Lembrete de atendimento por WhatsApp",
      detail: "Lembrete do seu horário",
      status: "sent",
    });
    expect(byId.get("message:msg-2")).toMatchObject({
      occurredAt: "2026-08-25T12:00:00.000Z",
      status: "queued",
    });
    expect(byId.get("satisfaction:survey-1")).toMatchObject({
      title: "Pesquisa de satisfação: nota 9",
      detail: "Ótimo",
      score: 9,
    });
    expect(byId.get("satisfaction:survey-2")).not.toHaveProperty("detail");
  });

  it("uses the full plan value when the cancellation value is missing and returns an empty list without data", () => {
    expect(
      buildPatientTimeline(patientId, {
        appointments: [],
        plans: [],
        payments: [],
        contacts: [],
        messages: [],
        surveys: [],
      }),
    ).toEqual([]);
    const timeline = buildPatientTimeline(patientId, {
      appointments: [],
      plans: [plan({ cancelledAt: "2026-08-15T12:00:00.000Z" })],
      payments: [],
      contacts: [],
      messages: [],
      surveys: [],
    });
    expect(timeline[0]).toMatchObject({
      kind: "plan_cancelled",
      amountInCents: -40000,
    });
  });

  it("leaves lead appointments (sem cliente) out of the client history", () => {
    const leadAppointment: Partial<Appointment> = appointment(
      "lead-appt",
      "2026-08-20T12:00:00.000Z",
      "completed",
    );
    delete leadAppointment.patientId;
    Object.assign(leadAppointment, {
      leadId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      leadName: "Ana",
      visitType: "trial",
    });
    const timeline = buildPatientTimeline(patientId, {
      appointments: [
        leadAppointment as Appointment,
        appointment("own", "2026-08-21T12:00:00.000Z", "completed"),
      ],
      plans: [],
      payments: [],
      contacts: [],
      messages: [],
      surveys: [],
    });
    expect(timeline.map((entry) => entry.id)).toEqual(["appointment:own"]);
  });
});
