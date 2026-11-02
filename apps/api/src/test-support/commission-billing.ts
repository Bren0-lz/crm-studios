import { randomUUID } from "node:crypto";
import {
  patientPlanInputSchema,
  planTemplateInputSchema,
  singlePlanSessionPrices,
} from "@crm/contracts";
import type { ClinicRepository } from "../repository.js";

/**
 * Vende ao cliente um plano de 1 sessão do serviço do atendimento (ainda agendado), válido no
 * dia dele: ao concluir, o atendimento consome essa sessão. A comissão sai do valor pago pelo
 * cliente, e sem consumo de plano o atendimento não gera comissão. Sem `amountInCents`, vale a
 * sessão do plano avulso do serviço ou, sem ele, o preço de tabela.
 */
export async function sellSessionForAppointment(
  repository: ClinicRepository,
  clinicId: string,
  actorUserId: string,
  appointment: {
    patientId?: string | undefined;
    serviceId: string;
    startsAt: string;
  },
  amountInCents?: number,
) {
  const value =
    amountInCents ??
    singlePlanSessionPrices(await repository.listPlanTemplates(clinicId)).get(
      appointment.serviceId,
    ) ??
    (await repository.listServices(clinicId)).find(
      (item) => item.id === appointment.serviceId,
    )!.priceInCents;
  const day = appointment.startsAt.slice(0, 10);
  const terms = {
    name: `Sessão avulsa ${randomUUID().slice(0, 8)}`,
    totalValueInCents: value,
    kind: "single" as const,
    services: [
      {
        serviceId: appointment.serviceId,
        totalSessions: 1,
        totalValueInCents: value,
      },
    ],
  };
  const template = await repository.createPlanTemplate(
    clinicId,
    actorUserId,
    planTemplateInputSchema.parse({ ...terms, planType: "single" }),
  );
  return repository.createPatientPlan(
    clinicId,
    actorUserId,
    patientPlanInputSchema.parse({
      ...terms,
      planTemplateId: template.id,
      patientId: appointment.patientId!,
      installments: 1,
      firstDueDate: day,
      validFrom: day,
      validUntil: day,
      autoRenew: false,
    }),
  );
}
