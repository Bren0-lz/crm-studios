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
const normalized = (value: string) =>
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
      normalized(
        [lead.fullName, lead.phone, lead.email, lead.tags.join(" ")].join(" "),
      ).includes(normalized(filter.search))) &&
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
export function buildLeadInsights(leads: Lead[]): LeadInsights {
  const breakdown = (key: "source" | "contactMethod") =>
    [...new Set(leads.map((lead) => lead[key] || "Não informado"))]
      .map((name) => {
        const selected = leads.filter(
            (lead) => (lead[key] || "Não informado") === name,
          ),
          won = selected.filter((lead) => lead.stage === "won").length;
        return {
          name,
          leads: selected.length,
          won,
          lost: selected.filter((lead) => lead.stage === "lost").length,
          conversionRate: selected.length
            ? Math.round((100 * won) / selected.length)
            : 0,
        };
      })
      .sort(
        (a, b) => b.leads - a.leads || a.name.localeCompare(b.name, "pt-BR"),
      );
  const won = leads.filter((lead) => lead.stage === "won").length;
  return {
    total: leads.length,
    open: leads.filter((lead) => !["won", "lost"].includes(lead.stage)).length,
    won,
    lost: leads.filter((lead) => lead.stage === "lost").length,
    conversionRate: leads.length ? Math.round((100 * won) / leads.length) : 0,
    openTasks: leads.reduce((sum, lead) => sum + lead.openTasks, 0),
    overdueTasks: leads.reduce((sum, lead) => sum + lead.overdueTasks, 0),
    withoutContact: leads.filter((lead) => !lead.lastContactAt).length,
    sources: breakdown("source"),
    contactMethods: breakdown("contactMethod"),
    lostReasons: [
      ...new Set(
        leads
          .filter((lead) => lead.stage === "lost")
          .map((lead) => lead.lostReason || "Não informado"),
      ),
    ].map((name) => ({
      name,
      leads: leads.filter(
        (lead) =>
          lead.stage === "lost" &&
          (lead.lostReason || "Não informado") === name,
      ).length,
    })),
  };
}
