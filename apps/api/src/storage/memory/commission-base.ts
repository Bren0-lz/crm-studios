import { planSessionPaidValueInCents } from "@crm/contracts";
import type { MemoryRepositoryContext } from "./context.js";

/**
 * Base da comissão de um atendimento/presença: o valor que o cliente pagou por ele. Sessão
 * consumida de um plano (inclusive plano avulso; sessão estornada não conta) → valor da sessão
 * no plano com o desconto do cliente das cobranças. Sem consumo de plano → `undefined` (não gera
 * comissão; o plano avulso só cadastrado não entra). Mesma regra de
 * `commissionBase` no MySQL.
 */
export function commissionBaseInCents(
  context: MemoryRepositoryContext,
  clinicId: string,
  source: {
    appointmentId?: string | undefined;
    groupAttendanceId?: string | undefined;
    serviceId: string;
  },
): number | undefined {
  const sameSource = (item: {
    appointmentId?: string | undefined;
    groupAttendanceId?: string | undefined;
  }) =>
    Boolean(
      (source.appointmentId && item.appointmentId === source.appointmentId) ||
      (source.groupAttendanceId &&
        item.groupAttendanceId === source.groupAttendanceId),
    );
  const movements = context.sessionMovements.filter(
    (item) =>
      sameSource(item) &&
      context.patientPlans.some(
        (plan) => plan.clinicId === clinicId && plan.id === item.planId,
      ),
  );
  const consumption = movements.find(
    (item) =>
      item.kind === "consumption" &&
      !movements.some(
        (other) => other.kind === "reversal" && other.planId === item.planId,
      ),
  );
  const plan =
    consumption &&
    context.patientPlans.find((item) => item.id === consumption.planId);
  const planService = plan?.services.find(
    (item) => item.serviceId === (consumption?.serviceId ?? source.serviceId),
  );
  if (!plan || !planService) return undefined;
  const discount = context.receivables
    .filter(
      (item) =>
        item.clinicId === clinicId &&
        item.planId === plan.id &&
        item.status !== "cancelled",
    )
    .reduce((sum, item) => sum + (item.customerDiscountInCents ?? 0), 0);
  return planSessionPaidValueInCents(
    planService,
    plan.totalValueInCents,
    discount,
  );
}
