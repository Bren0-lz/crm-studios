import {
  buildLeadFilterOptions,
  LEAD_AUDIENCE_CLOSED_STAGES,
  leadAudienceFilterSchema,
  type CampaignLeadFilterOptions,
  type Lead,
  type LeadAudienceFilter,
} from "@crm/contracts";
import type { ClinicRepository } from "../../repository.js";
import { clinicDateOf } from "../finance/daily-cash.js";
import { destination } from "./broadcast.js";

function dayNumber(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!) / 86_400_000;
}

/** Dias inteiros entre duas datas aaaa-mm-dd (positivo quando `to` é depois). */
export function daysBetweenDates(from: string, to: string) {
  return dayNumber(to) - dayNumber(from);
}

const normalized = (value: string) => value.trim().toLocaleLowerCase("pt-BR");

/**
 * Leads que o filtro da campanha alcança. Sem etapas escolhidas, só os em aberto (fora
 * ganhos e perdidos); lead convertido em cliente só entra com a etapa `won` escolhida.
 * `today` é a data da clínica (aaaa-mm-dd).
 */
export function filterLeadsForAudience(
  leads: readonly Lead[],
  input: LeadAudienceFilter | undefined,
  today: string,
  timezone: string,
): Lead[] {
  const filter = leadAudienceFilterSchema.parse(input ?? {});
  const stages = new Set(filter.stages);
  const closed = new Set<string>(LEAD_AUDIENCE_CLOSED_STAGES);
  const tags = filter.tags.map(normalized);
  const sources = new Set(filter.sources.map(normalized));
  const interests = new Set(filter.interests.map(normalized));
  const responsible = new Set(filter.responsibleUserIds);
  return leads.filter((lead) => {
    if (stages.size ? !stages.has(lead.stage) : closed.has(lead.stage))
      return false;
    if (lead.convertedPatientId && !stages.has("won")) return false;
    if (tags.length) {
      const own = new Set((lead.tags ?? []).map(normalized));
      const matches =
        filter.tagMode === "all"
          ? tags.every((tag) => own.has(tag))
          : tags.some((tag) => own.has(tag));
      if (!matches) return false;
    }
    if (sources.size && !sources.has(normalized(lead.source))) return false;
    if (interests.size && !interests.has(normalized(lead.interest)))
      return false;
    if (
      responsible.size &&
      !(lead.responsibleUserId && responsible.has(lead.responsibleUserId))
    )
      return false;
    if (
      filter.createdWithinDays !== undefined &&
      daysBetweenDates(clinicDateOf(lead.createdAt, timezone), today) >
        filter.createdWithinDays
    )
      return false;
    if (
      filter.noContactDays !== undefined &&
      lead.lastContactAt &&
      daysBetweenDates(clinicDateOf(lead.lastContactAt, timezone), today) <
        filter.noContactDays
    )
      return false;
    return true;
  });
}

/** WhatsApp do lead (ou o telefone de contato), com pelo menos 10 dígitos. */
export function leadDestination(lead: Lead) {
  return destination(
    { whatsapp: lead.whatsapp, phone: lead.phone, email: lead.email },
    "whatsapp",
  );
}

/** Etapas do funil, origens, interesses, etiquetas e responsáveis para o filtro de leads. */
export async function campaignLeadFilterOptions(
  repository: ClinicRepository,
  clinicId: string,
): Promise<CampaignLeadFilterOptions> {
  const [leads, stages] = await Promise.all([
    repository.listLeads(clinicId),
    repository.listLeadStages(clinicId),
  ]);
  const options = buildLeadFilterOptions(leads);
  return {
    stages: stages.map(({ stage, label }) => ({ stage, label })),
    sources: options.sources,
    interests: options.interests,
    tags: [...new Set(leads.flatMap((lead) => lead.tags ?? []))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    ),
    responsibles: options.responsibles,
  };
}
