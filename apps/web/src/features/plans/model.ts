import type { PatientPlan } from "@crm/contracts";

export const planKindLabels: Record<PatientPlan["kind"], string> = {
  single: "Avulso",
  fixed_package: "Pacote fixo",
  recurring: "Recorrente",
  custom: "Personalizado",
};
