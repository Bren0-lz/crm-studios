import {
  appointmentPricing,
  planHasSessionBalance,
  type AppointmentVisitType,
} from "@crm/contracts";
import { DomainError, type ClinicRepository } from "../../repository.js";
import {
  clinicDateOf,
  DEFAULT_CLINIC_TIMEZONE,
} from "../finance/daily-cash.js";

/** Regra única para criação, recorrência, edição e remarcação (AP3). */
export async function assertAppointmentPlan(
  repository: ClinicRepository,
  clinicId: string,
  input: {
    patientId?: string | undefined;
    serviceId: string;
    visitType: AppointmentVisitType;
    planId?: string | undefined;
  },
  starts: readonly string[],
  sourceAppointmentId?: string,
): Promise<void> {
  if (!input.patientId) {
    if (input.visitType === "trial") return;
    throw new DomainError(
      "PLAN_REQUIRED",
      "Agende uma aula experimental para o lead ou converta-o em cliente para usar um plano.",
      409,
    );
  }
  if (input.visitType === "trial")
    return assertTrialOutsidePlans(
      repository,
      clinicId,
      { patientId: input.patientId, serviceId: input.serviceId },
      starts,
    );
  const required = () =>
    new DomainError(
      "PLAN_REQUIRED",
      "Selecione um plano ativo do cliente, válido para o serviço, as datas e a quantidade de sessões.",
      409,
    );
  if (!input.planId) throw required();
  const [plans, settings] = await Promise.all([
    repository.listPatientPlans(clinicId, input.patientId),
    repository.getClinicSettings(clinicId),
  ]);
  const plan = plans.find(
    (item) =>
      item.id === input.planId &&
      item.clinicId === clinicId &&
      item.patientId === input.patientId &&
      (!item.sourceAppointmentId ||
        item.sourceAppointmentId === sourceAppointmentId),
  );
  if (!plan || starts.length === 0) throw required();
  for (const startsAt of starts) {
    const date = clinicDateOf(
      new Date(startsAt),
      settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE,
    );
    const available = appointmentPricing(
      input.serviceId,
      [plan],
      [],
      date,
    ).plans.find((item) => item.planId === plan.id);
    if (
      !available ||
      (planHasSessionBalance(plan) &&
        available.remainingSessions < starts.length)
    )
      throw required();
  }
}

/**
 * Experimental de cliente (EX2): só para serviço fora dos planos dele. Bloqueia plano ativo,
 * não avulso (nem crédito de comanda), vigente na data e que cubra o serviço — com ou sem saldo.
 */
async function assertTrialOutsidePlans(
  repository: ClinicRepository,
  clinicId: string,
  input: { patientId: string; serviceId: string },
  starts: readonly string[],
): Promise<void> {
  const [plans, settings] = await Promise.all([
    repository.listPatientPlans(clinicId, input.patientId),
    repository.getClinicSettings(clinicId),
  ]);
  const timezone = settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE;
  const covered = starts.some((startsAt) => {
    const date = clinicDateOf(new Date(startsAt), timezone);
    return plans.some(
      (plan) =>
        plan.clinicId === clinicId &&
        plan.patientId === input.patientId &&
        plan.status === "active" &&
        plan.kind !== "single" &&
        !plan.sourceAppointmentId &&
        plan.validFrom <= date &&
        (!plan.validUntil || plan.validUntil >= date) &&
        plan.services.some((service) => service.serviceId === input.serviceId),
    );
  });
  if (covered)
    throw new DomainError(
      "TRIAL_SERVICE_IN_PLAN",
      "O cliente já tem plano deste serviço. A aula experimental é só para serviço fora do plano.",
      409,
    );
}
