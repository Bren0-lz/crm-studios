import { createHash } from "node:crypto";
import { planHasSessionBalance, type PlanPurchaseInput } from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { clinicDateOf } from "../finance/daily-cash.js";
export function purchaseFingerprint(input: PlanPurchaseInput): string {
  function sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, sorted(entry)]),
      );
    return value;
  }
  return createHash("sha256")
    .update(JSON.stringify(sorted(input)))
    .digest("hex");
}
export function validatePurchaseSchedule(
  input: PlanPurchaseInput,
  timezone: string,
) {
  for (const appointment of input.appointments) {
    const date = clinicDateOf(new Date(appointment.startsAt), timezone);
    if (
      !input.plan.services.some(
        (item) => item.serviceId === appointment.serviceId,
      ) ||
      date < input.plan.validFrom ||
      (input.plan.validUntil && date > input.plan.validUntil)
    )
      throw new DomainError(
        "PLAN_SCHEDULE_MISMATCH",
        "Os atendimentos devem usar os serviços e a vigência do plano.",
        400,
      );
  }
  // Plano com saldo de sessões: não dá para reservar mais horários do que as sessões compradas.
  if (!planHasSessionBalance(input.plan)) return;
  const scheduled = new Map<string, number>();
  for (const appointment of input.appointments)
    scheduled.set(
      appointment.serviceId,
      (scheduled.get(appointment.serviceId) ?? 0) + 1,
    );
  for (const [serviceId, count] of scheduled) {
    const sessions = input.plan.services
      .filter((item) => item.serviceId === serviceId)
      .reduce((total, item) => total + item.totalSessions, 0);
    if (count > sessions)
      throw new DomainError(
        "PLAN_SCHEDULE_SESSIONS_MISMATCH",
        `A contratação reserva ${count} horários para um serviço com ${sessions} ${sessions === 1 ? "sessão" : "sessões"}. Reserve no máximo a quantidade de sessões do plano.`,
        409,
      );
  }
}

/**
 * Venda de plano com turma (cadastro guiado e contratação) só com vaga confirmada (TW3): turma
 * cheia não gera plano, cobrança nem contrato — o cliente vai para a Lista de espera do serviço.
 * Chamado dentro da transação, depois da matrícula, para desfazer tudo se ela ficou na espera.
 */
export function assertPlanEnrollmentSeat(
  enrollment: { status: string } | undefined,
) {
  if (enrollment?.status === "waitlisted")
    throw new DomainError(
      "GROUP_FULL",
      "A turma está cheia: coloque o cliente na lista de espera.",
      409,
    );
}
