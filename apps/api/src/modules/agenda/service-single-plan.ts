import {
  isSinglePlanTemplate,
  planTemplateInputSchema,
  type PlanTemplate,
  type Service,
} from "@crm/contracts";
import type { ClinicRepository } from "../../repository.js";

/** Nome do plano avulso gerado para o serviço (limite de 120 caracteres do modelo). */
export function singlePlanName(serviceName: string) {
  const suffix = " (avulso)";
  return `${serviceName.trim().slice(0, 120 - suffix.length)}${suffix}`;
}

/** Plano avulso ativo do serviço: o cadastrado primeiro, como em `singlePlanSessionPrices`. */
export function serviceSinglePlan(
  templates: readonly PlanTemplate[],
  serviceId: string,
): PlanTemplate | undefined {
  return [...templates]
    .filter(
      (template) =>
        template.active &&
        isSinglePlanTemplate(template) &&
        template.services.some((item) => item.serviceId === serviceId),
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )[0];
}

/**
 * O preço de tabela de um serviço ativo vira o valor da sessão do plano avulso dele: cria
 * "<Nome> (avulso)" com 1 sessão quando ainda não existe e atualiza o valor do existente
 * (sem duplicar). Preço zero não mexe no plano. Modelo avulso com outros serviços fica como está.
 */
export async function syncServiceSinglePlan(
  repository: ClinicRepository,
  clinicId: string,
  actorUserId: string,
  service: Pick<Service, "id" | "name" | "priceInCents" | "active">,
) {
  if (!service.active || service.priceInCents <= 0) return;
  const templates = await repository.listPlanTemplates(clinicId);
  const current = serviceSinglePlan(templates, service.id);
  if (!current) {
    await repository.createPlanTemplate(
      clinicId,
      actorUserId,
      planTemplateInputSchema.parse({
        name: singlePlanName(service.name),
        totalValueInCents: service.priceInCents,
        planType: "single",
        kind: "single",
        services: [
          {
            serviceId: service.id,
            totalSessions: 1,
            totalValueInCents: service.priceInCents,
          },
        ],
      }),
    );
    return;
  }
  if (current.services.length !== 1) return;
  const entry = current.services[0]!;
  const totalValueInCents = service.priceInCents * entry.totalSessions;
  if (
    current.totalValueInCents === totalValueInCents &&
    entry.totalValueInCents === totalValueInCents
  )
    return;
  await repository.updatePlanTemplate(clinicId, actorUserId, current.id, {
    totalValueInCents,
    services: [{ ...entry, totalValueInCents }],
  });
}
