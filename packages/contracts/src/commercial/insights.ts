import { z } from "zod";
import { leadStageSchema } from "../patients/model.js";
import type { Lead } from "./types.js";
export const leadFilterSchema = z
  .object({
    search: z.string().trim().max(160).optional(),
    source: z.string().max(80).optional(),
    interest: z.string().max(120).optional(),
    contactMethod: z.string().max(80).optional(),
    lostReason: z.string().max(500).optional(),
    stage: leadStageSchema.optional(),
    responsibleUserId: z.uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    tasks: z.enum(["open", "overdue", "none"]).optional(),
    contact: z.enum(["with", "without"]).optional(),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    "O fim do período deve ser posterior ao início.",
  );
export type LeadFilter = z.infer<typeof leadFilterSchema>;
/** Normalização da busca do funil (sem acento, minúscula), igual no SQL e em memória. */
export const normalizeLeadSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
export function matchesLead(
  lead: Lead,
  filter: LeadFilter,
  timezone = "America/Sao_Paulo",
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(lead.createdAt));
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  return (
    (!filter.search ||
      normalizeLeadSearch(
        [lead.fullName, lead.phone, lead.email, lead.tags.join(" ")].join(" "),
      ).includes(normalizeLeadSearch(filter.search))) &&
    (!filter.source || lead.source === filter.source) &&
    (!filter.interest ||
      [lead.interest, ...(lead.interests ?? [])].includes(filter.interest)) &&
    (!filter.contactMethod || lead.contactMethod === filter.contactMethod) &&
    (!filter.lostReason || lead.lostReason === filter.lostReason) &&
    (!filter.stage || lead.stage === filter.stage) &&
    (!filter.responsibleUserId ||
      lead.responsibleUserId === filter.responsibleUserId) &&
    (!filter.from || day >= filter.from) &&
    (!filter.to || day <= filter.to) &&
    (!filter.tasks ||
      (filter.tasks === "open"
        ? lead.openTasks > 0
        : filter.tasks === "overdue"
          ? lead.overdueTasks > 0
          : lead.openTasks === 0)) &&
    (!filter.contact ||
      (filter.contact === "with"
        ? Boolean(lead.lastContactAt)
        : !lead.lastContactAt))
  );
}
export interface LeadInsights {
  total: number;
  open: number;
  won: number;
  lost: number;
  conversionRate: number;
  openTasks: number;
  overdueTasks: number;
  withoutContact: number;
  sources: Array<{
    name: string;
    leads: number;
    won: number;
    lost: number;
    conversionRate: number;
  }>;
  contactMethods: Array<{
    name: string;
    leads: number;
    won: number;
    lost: number;
    conversionRate: number;
  }>;
  lostReasons: Array<{ name: string; leads: number }>;
}
/**
 * Linha agregada do funil: o PostgreSQL devolve estas linhas num GROUP BY, em vez de carregar
 * todos os leads, e `buildLeadInsightsFromGroups` monta o mesmo resultado que a versão em memória.
 */
export interface LeadInsightGroup {
  stage: Lead["stage"];
  source: string;
  contactMethod: string;
  lostReason: string;
  leads: number;
  openTasks: number;
  overdueTasks: number;
  withoutContact: number;
}
export function groupLeadsForInsights(leads: Lead[]): LeadInsightGroup[] {
  const groups = new Map<string, LeadInsightGroup>();
  for (const lead of leads) {
    const group = {
      stage: lead.stage,
      source: lead.source || "",
      contactMethod: lead.contactMethod || "",
      lostReason: lead.lostReason || "",
    };
    const key = JSON.stringify(group);
    const current = groups.get(key) ?? {
      ...group,
      leads: 0,
      openTasks: 0,
      overdueTasks: 0,
      withoutContact: 0,
    };
    current.leads += 1;
    current.openTasks += lead.openTasks;
    current.overdueTasks += lead.overdueTasks;
    if (!lead.lastContactAt) current.withoutContact += 1;
    groups.set(key, current);
  }
  return [...groups.values()];
}
const byLeadsThenName = (
  a: { name: string; leads: number },
  b: { name: string; leads: number },
) => b.leads - a.leads || a.name.localeCompare(b.name, "pt-BR");
const sum = (groups: LeadInsightGroup[], key: keyof LeadInsightGroup) =>
  groups.reduce((total, group) => total + Number(group[key]), 0);
export function buildLeadInsightsFromGroups(
  groups: LeadInsightGroup[],
): LeadInsights {
  const count = (items: LeadInsightGroup[]) => sum(items, "leads");
  const breakdown = (key: "source" | "contactMethod") =>
    [...new Set(groups.map((group) => group[key] || "Não informado"))]
      .map((name) => {
        const selected = groups.filter(
            (group) => (group[key] || "Não informado") === name,
          ),
          total = count(selected),
          won = count(selected.filter((group) => group.stage === "won"));
        return {
          name,
          leads: total,
          won,
          lost: count(selected.filter((group) => group.stage === "lost")),
          conversionRate: total ? Math.round((100 * won) / total) : 0,
        };
      })
      .sort(byLeadsThenName);
  const total = count(groups),
    won = count(groups.filter((group) => group.stage === "won")),
    lost = groups.filter((group) => group.stage === "lost");
  return {
    total,
    open: count(
      groups.filter((group) => !["won", "lost"].includes(group.stage)),
    ),
    won,
    lost: count(lost),
    conversionRate: total ? Math.round((100 * won) / total) : 0,
    openTasks: sum(groups, "openTasks"),
    overdueTasks: sum(groups, "overdueTasks"),
    withoutContact: sum(groups, "withoutContact"),
    sources: breakdown("source"),
    contactMethods: breakdown("contactMethod"),
    lostReasons: [
      ...new Set(lost.map((group) => group.lostReason || "Não informado")),
    ]
      .map((name) => ({
        name,
        leads: count(
          lost.filter(
            (group) => (group.lostReason || "Não informado") === name,
          ),
        ),
      }))
      .sort(byLeadsThenName),
  };
}
export function buildLeadInsights(leads: Lead[]): LeadInsights {
  return buildLeadInsightsFromGroups(groupLeadsForInsights(leads));
}
