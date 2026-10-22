import type { LeadFilter, LeadFilterOptions } from "@crm/contracts";
import { formatIsoDate } from "../../shared/lib/formatting";
import { leadStages } from "../relationship/index";

/** Filtros configurados no modal (a busca fica na barra do funil). */
export type ModalFilterKey = Exclude<keyof LeadFilter, "search">;

export const modalFilterLabels: Record<ModalFilterKey, string> = {
  stage: "Etapa",
  source: "Origem",
  interest: "Interesse",
  contactMethod: "Forma de contato",
  lostReason: "Motivo de perda",
  responsibleUserId: "Responsável",
  tasks: "Tarefas",
  contact: "Histórico",
  from: "Desde",
  to: "Até",
};

export const taskFilterLabels = {
  open: "Com tarefas abertas",
  overdue: "Com tarefas atrasadas",
  none: "Sem tarefas abertas",
} as const;

export const contactFilterLabels = {
  with: "Com contato registrado",
  without: "Sem contato registrado",
} as const;

export function activeModalFilters(filter: LeadFilter) {
  return (Object.keys(modalFilterLabels) as ModalFilterKey[]).filter(
    (key) => filter[key],
  );
}

/** Valor legível de um filtro ativo, para o chip "Origem: Instagram". */
export function filterValueLabel(
  key: ModalFilterKey,
  filter: LeadFilter,
  options: LeadFilterOptions,
) {
  const value = filter[key] ?? "";
  if (key === "stage")
    return leadStages.find((stage) => stage.value === value)?.label ?? value;
  if (key === "responsibleUserId")
    return (
      options.responsibles.find((item) => item.id === value)?.name ??
      "Responsável cadastrado"
    );
  if (key === "tasks")
    return taskFilterLabels[value as keyof typeof taskFilterLabels];
  if (key === "contact")
    return contactFilterLabels[value as keyof typeof contactFilterLabels];
  if (key === "from" || key === "to") return formatIsoDate(value);
  return value;
}
