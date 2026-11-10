import { randomUUID } from "node:crypto";
import { planTemplateInputSchema, type Service } from "@crm/contracts";
import type { ClinicRepository } from "../repository.js";

/**
 * Serviço não tem preço: o valor da sessão avulsa vem do plano avulso. Cria um serviço próprio do teste com um plano avulso de 1 sessão (`valueInCents`), que é
 * a base da comissão percentual de atendimentos sem plano.
 */
export async function serviceWithSinglePlan(
  repository: ClinicRepository,
  clinicId: string,
  actorId: string,
  valueInCents: number,
): Promise<Service> {
  const service = await repository.createService(clinicId, {
    name: `Serviço avulso ${randomUUID().slice(0, 8)}`,
    durationMinutes: 50,
  });
  await repository.createPlanTemplate(
    clinicId,
    actorId,
    planTemplateInputSchema.parse({
      name: `${service.name} (avulso)`,
      totalValueInCents: valueInCents,
      planType: "single",
      kind: "single",
      services: [
        {
          serviceId: service.id,
          totalSessions: 1,
          totalValueInCents: valueInCents,
        },
      ],
    }),
  );
  return service;
}
