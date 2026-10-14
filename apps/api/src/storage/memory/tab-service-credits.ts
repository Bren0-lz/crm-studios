import type { PatientPlan, PatientTab } from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function prepareTabServiceCredits(
  context: MemoryRepositoryContext,
  tab: PatientTab,
): PatientPlan[] {
  return (tab.services ?? []).map((item) => {
    const appointment = context.appointments.find(
      (a) =>
        a.clinicId === tab.clinicId &&
        a.id === item.appointmentId &&
        a.patientId === tab.patientId,
    );
    if (
      !appointment ||
      !["scheduled", "confirmed"].includes(appointment.status)
    )
      throw new DomainError(
        "TAB_SERVICE_NOT_SCHEDULED",
        "A comanda exige serviços com atendimento agendado. Revise os itens antes de fechar.",
        409,
      );
    const date = clinicDateOf(
      new Date(appointment.startsAt),
      context.clinicSettings.timezone,
    );
    if (
      context.patientPlans.some(
        (p) =>
          p.clinicId === tab.clinicId &&
          p.patientId === tab.patientId &&
          !p.sourceTabId &&
          p.status === "active" &&
          p.validFrom <= date &&
          (!p.validUntil || p.validUntil >= date) &&
          p.services.some((s) => s.serviceId === item.serviceId),
      )
    )
      throw new DomainError(
        "APPOINTMENT_ALREADY_BILLED",
        "O atendimento já está coberto por um plano. Remova o serviço da comanda.",
        409,
      );
    const timestamp = now();
    return {
      id: uuid(),
      clinicId: tab.clinicId,
      patientId: tab.patientId,
      patientName: tab.patientName,
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      name: `${item.serviceName} · Comanda ${tab.id.slice(0, 8).toUpperCase()}`,
      kind: "single",
      services: [
        {
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          totalSessions: 1,
          remainingSessions: 1,
          totalValueInCents: item.amountInCents,
        },
      ],
      totalSessions: 1,
      remainingSessions: 1,
      totalValueInCents: item.amountInCents,
      validFrom: date,
      installments: 1,
      firstDueDate: date,
      status: "active",
      autoRenew: false,
      sourceTabId: tab.id,
      sourceAppointmentId: appointment.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

export function assertTabCreditsReversible(
  context: MemoryRepositoryContext,
  tab: PatientTab,
) {
  for (const plan of context.patientPlans.filter(
    (p) => p.clinicId === tab.clinicId && p.sourceTabId === tab.id,
  )) {
    if (
      context.sessionMovements
        .filter(
          (m) =>
            m.planId === plan.id && (m.appointmentId || m.groupAttendanceId),
        )
        .reduce((sum, m) => sum + m.quantity, 0) < 0
    )
      throw new DomainError(
        "TAB_SERVICE_CORRECTION_REQUIRED",
        "Corrija a presença dos serviços realizados na agenda antes de cancelar a comanda.",
        409,
      );
  }
}

export function cancelTabCredits(
  context: MemoryRepositoryContext,
  tab: PatientTab,
) {
  for (const plan of context.patientPlans.filter(
    (p) =>
      p.clinicId === tab.clinicId &&
      p.sourceTabId === tab.id &&
      p.status !== "cancelled",
  )) {
    for (const service of plan.services) {
      if (service.remainingSessions > 0)
        context.sessionMovements.push({
          id: uuid(),
          planId: plan.id,
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          kind: "adjustment",
          quantity: -service.remainingSessions,
          reason: "Cancelamento da comanda",
          createdAt: now(),
        });
      service.remainingSessions = 0;
    }
    plan.remainingSessions = 0;
    plan.status = "cancelled";
    plan.cancelledAt = now();
    plan.updatedAt = plan.cancelledAt;
    plan.cancelledValueInCents = plan.totalValueInCents;
  }
}
