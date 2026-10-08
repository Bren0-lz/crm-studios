import {
  planServicesSchema,
  planServiceTotals,
  type PlanServiceInput,
  type PatientPlanService,
} from "@crm/contracts";
import { DomainError } from "./repository.js";

export function validatePlanComposition(
  services: PlanServiceInput[],
  totalValueInCents: number,
  allowedServiceIds?: string[],
) {
  planServicesSchema.parse(services);
  if (
    services.reduce((sum, item) => sum + item.totalValueInCents, 0) !==
    totalValueInCents
  )
    throw new DomainError(
      "PLAN_SERVICE_TOTAL_MISMATCH",
      "A soma dos serviços deve corresponder ao valor total do plano.",
      400,
    );
  if (
    allowedServiceIds &&
    (allowedServiceIds.length !== services.length ||
      services.some((item) => !allowedServiceIds.includes(item.serviceId)))
  )
    throw new DomainError(
      "PLAN_SERVICE_COMPOSITION_MISMATCH",
      "Os serviços devem corresponder à composição do plano selecionado.",
      400,
    );
  return planServiceTotals({ services });
}

export function formatPlanServices(
  services: Pick<
    PatientPlanService,
    "serviceName" | "totalSessions" | "totalValueInCents"
  >[],
) {
  const currency = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return services
    .map(
      (entry) =>
        `${entry.serviceName}: ${entry.totalSessions} ${entry.totalSessions === 1 ? "sessão" : "sessões"}, ${currency.format(entry.totalValueInCents / 100)}`,
    )
    .join("; ");
}
