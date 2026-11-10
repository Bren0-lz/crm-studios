import { z } from "zod";
import { leadStageSchema } from "../patients/model.js";
import { leadFilterSchema } from "./insights.js";
import type { Lead } from "./types.js";

/** Cartões carregados por coluna do funil a cada página ("Carregar mais"). */
export const LEAD_BOARD_PAGE_SIZE = 30;
export const LEAD_BOARD_MAX_PAGE_SIZE = 100;

export const leadPageSchema = z.object({
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LEAD_BOARD_MAX_PAGE_SIZE)
    .default(LEAD_BOARD_PAGE_SIZE),
});
export type LeadPage = z.infer<typeof leadPageSchema>;

/** Filtros do funil + paginação, como chegam na query string. */
export function parseLeadPageQuery(query: unknown) {
  return {
    filter: leadFilterSchema.parse(query),
    page: leadPageSchema.parse(query),
  };
}

export const leadStageParamSchema = z.object({ stage: leadStageSchema });

export interface LeadStagePage {
  stage: Lead["stage"];
  /** Total de leads da etapa com os filtros aplicados (não só os desta página). */
  total: number;
  /** Leads da etapa (com os filtros) que têm tarefa atrasada. */
  overdue: number;
  leads: Lead[];
}

export interface LeadBoard {
  columns: LeadStagePage[];
}

export interface LeadFilterOptions {
  sources: string[];
  interests: string[];
  contactMethods: string[];
  lostReasons: string[];
  responsibles: Array<{ id: string; name: string }>;
}

const sorted = (values: Iterable<string | undefined>) =>
  [
    ...new Set([...values].filter((value): value is string => Boolean(value))),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

/** Valores distintos para os selects de filtro (versão em memória; o SQL usa DISTINCT). */
export function buildLeadFilterOptions(leads: Lead[]): LeadFilterOptions {
  const responsibles = new Map<string, string>();
  for (const lead of leads)
    if (lead.responsibleUserId)
      responsibles.set(
        lead.responsibleUserId,
        lead.responsibleName ?? "Responsável cadastrado",
      );
  return {
    sources: sorted(leads.map((lead) => lead.source)),
    interests: sorted(
      leads.flatMap((lead) => [lead.interest, ...(lead.interests ?? [])]),
    ),
    contactMethods: sorted(leads.map((lead) => lead.contactMethod)),
    lostReasons: sorted(leads.map((lead) => lead.lostReason)),
    responsibles: [...responsibles]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}
