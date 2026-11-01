import {
  addDaysToIsoDate,
  type AppointmentPromotion,
  type AutoCampaignPromotionOffer,
  type AutoCampaignRedemption,
  type WhatsappCampaignDetail,
  type WhatsappCampaignPromotion,
  type WhatsappCampaignRecipient,
} from "@crm/contracts";
import type {
  AutoCampaignRedemptionWrite,
  ClinicRepository,
} from "../../repository.js";
import { DomainError } from "../../repository.js";
import {
  clinicDateOf,
  DEFAULT_CLINIC_TIMEZONE,
} from "../finance/daily-cash.js";
import {
  loadPromotionOffers,
  resolvePromotionRedemption,
} from "./auto-campaigns.js";

/**
 * Último dia da promoção da campanha manual para quem recebeu a mensagem: a data final da
 * campanha ou `validDays` dias depois do dia (na clínica) em que a mensagem foi marcada como
 * enviada. Sem envio, não há promoção.
 */
export function manualPromotionValidUntil(
  promotion: WhatsappCampaignPromotion,
  recipient: Pick<WhatsappCampaignRecipient, "status" | "handledAt">,
  timezone: string,
): string | undefined {
  if (recipient.status !== "sent" || !recipient.handledAt) return undefined;
  if (promotion.validUntil) return promotion.validUntil;
  return addDaysToIsoDate(
    clinicDateOf(recipient.handledAt, timezone),
    promotion.validDays ?? 0,
  );
}

/** A campanha ainda pode ter promoção vigente hoje para alguém? (evita ler os destinatários) */
function mayStillBeValid(
  campaign: Pick<WhatsappCampaignDetail, "promotion" | "completedAt">,
  today: string,
  timezone: string,
) {
  const promotion = campaign.promotion;
  if (!promotion) return false;
  if (promotion.validUntil) return promotion.validUntil >= today;
  // Envios só acontecem até a campanha ser concluída.
  if (!campaign.completedAt) return true;
  return (
    addDaysToIsoDate(
      clinicDateOf(campaign.completedAt, timezone),
      promotion.validDays ?? 0,
    ) >= today
  );
}

/**
 * Promoções de campanhas manuais que o cliente pode usar ao agendar hoje: mensagem marcada
 * como enviada, prazo vigente e sem uso (cancelar o atendimento desfaz o uso).
 */
export function listManualPromotionOffers(
  campaigns: readonly WhatsappCampaignDetail[],
  redemptions: readonly AutoCampaignRedemption[],
  patientId: string,
  today: string,
  timezone: string,
): AutoCampaignPromotionOffer[] {
  const used = redemptions.filter(
    (item) =>
      item.patientId === patientId && item.appointmentStatus !== "cancelled",
  );
  const offers: AutoCampaignPromotionOffer[] = [];
  for (const campaign of campaigns) {
    if (!campaign.promotion) continue;
    for (const recipient of campaign.recipients) {
      if (recipient.patientId !== patientId) continue;
      const validUntil = manualPromotionValidUntil(
        campaign.promotion,
        recipient,
        timezone,
      );
      if (!validUntil || validUntil < today) continue;
      if (used.some((item) => item.campaignId === campaign.id)) continue;
      offers.push({
        source: "manual",
        campaignId: campaign.id,
        campaignName: campaign.name,
        occurrenceKey: recipient.id,
        validUntil,
      });
    }
  }
  return offers;
}

async function clinicTodayAndTimezone(
  repository: ClinicRepository,
  clinicId: string,
) {
  const settings = await repository.getClinicSettings(clinicId);
  const timezone = settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE;
  return { today: clinicDateOf(new Date(), timezone), timezone };
}

/** Promoções vigentes hoje para o cliente nas campanhas manuais. */
export async function loadManualPromotionOffers(
  repository: ClinicRepository,
  clinicId: string,
  patientId: string,
) {
  const { today, timezone } = await clinicTodayAndTimezone(
    repository,
    clinicId,
  );
  const candidates = (await repository.listWhatsappCampaigns(clinicId)).filter(
    (campaign) => mayStillBeValid(campaign, today, timezone),
  );
  if (candidates.length === 0) return { today, offers: [] };
  const [details, redemptions] = await Promise.all([
    Promise.all(
      candidates.map((campaign) =>
        repository.getWhatsappCampaign(clinicId, campaign.id),
      ),
    ),
    repository.listWhatsappCampaignRedemptions(clinicId),
  ]);
  return {
    today,
    offers: listManualPromotionOffers(
      details.filter((item) => item !== null),
      redemptions,
      patientId,
      today,
      timezone,
    ),
  };
}

/** Promoções que o cliente pode usar ao agendar hoje: automáticas e manuais. */
export async function loadAppointmentPromotionOffers(
  repository: ClinicRepository,
  clinicId: string,
  patientId: string,
): Promise<AutoCampaignPromotionOffer[]> {
  const [auto, manual] = await Promise.all([
    loadPromotionOffers(repository, clinicId, patientId),
    loadManualPromotionOffers(repository, clinicId, patientId),
  ]);
  return [...auto.offers, ...manual.offers].sort(
    (a, b) =>
      a.validUntil.localeCompare(b.validUntil) ||
      a.campaignName.localeCompare(b.campaignName, "pt-BR"),
  );
}

/**
 * Confere que a promoção escolhida ao agendar ainda vale para o cliente hoje e monta o uso.
 * Campanha automática segue `resolvePromotionRedemption` (com o bloqueio da campanha).
 */
export async function resolveAppointmentPromotion(
  repository: ClinicRepository,
  clinicId: string,
  patientId: string,
  promotion: AppointmentPromotion,
): Promise<AutoCampaignRedemptionWrite> {
  if (promotion.source !== "manual")
    return resolvePromotionRedemption(
      repository,
      clinicId,
      patientId,
      promotion,
    );
  const { today, offers } = await loadManualPromotionOffers(
    repository,
    clinicId,
    patientId,
  );
  const offer = offers.find(
    (item) =>
      item.campaignId === promotion.campaignId &&
      item.occurrenceKey === promotion.occurrenceKey,
  );
  if (!offer)
    throw new DomainError(
      "CAMPAIGN_PROMOTION_UNAVAILABLE",
      "Essa promoção não está mais disponível para o cliente.",
      409,
    );
  return {
    source: "manual",
    campaignId: offer.campaignId,
    occurrenceKey: offer.occurrenceKey,
    redeemedOn: today,
  };
}
