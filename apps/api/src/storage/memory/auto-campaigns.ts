import type {
  AutoCampaign,
  AutoCampaignDelivery,
  AutoCampaignPromotion,
  AutoCampaignRedemption,
  AutoCampaignTrigger,
} from "@crm/contracts";
import type {
  AutoCampaignDeliveryWrite,
  AutoCampaignWrite,
} from "../../repository.js";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export interface StoredAutoCampaign {
  id: string;
  clinicId: string;
  name: string;
  trigger: AutoCampaignTrigger;
  active: boolean;
  steps: Array<{ id: string; offset: number; message: string }>;
  promotion?: AutoCampaignPromotion;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface StoredAutoCampaignDelivery extends Omit<
  AutoCampaignDelivery,
  "handledByName"
> {
  clinicId: string;
  handledBy: string;
}

/** `source: "manual"` = uso de promoção de campanha manual (WhatsApp). */
export type StoredAutoCampaignRedemption = Omit<
  AutoCampaignRedemption,
  "appointmentStatus"
> & { clinicId: string; source?: "manual" };

export function createAutoCampaignsRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  const userName = (clinicId: string, userId: string) =>
    repositoryContext.users.find(
      (item) => item.clinicId === clinicId && item.id === userId,
    )?.fullName ?? "Usuário removido";

  const toCampaign = (campaign: StoredAutoCampaign): AutoCampaign =>
    structuredClone({
      id: campaign.id,
      name: campaign.name,
      trigger: campaign.trigger,
      active: campaign.active,
      steps: [...campaign.steps].sort((a, b) => a.offset - b.offset),
      ...(campaign.promotion ? { promotion: campaign.promotion } : {}),
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
      createdByName: userName(campaign.clinicId, campaign.createdBy),
    });

  const toDelivery = ({
    clinicId,
    handledBy,
    ...delivery
  }: StoredAutoCampaignDelivery): AutoCampaignDelivery => ({
    ...delivery,
    handledByName: userName(clinicId, handledBy),
  });

  const find = (clinicId: string, campaignId: string) =>
    repositoryContext.autoCampaigns.find(
      (item) =>
        item.clinicId === clinicId && item.id === campaignId && !item.deletedAt,
    );

  const steps = (
    input: AutoCampaignWrite,
    current: StoredAutoCampaign["steps"] = [],
  ) =>
    input.steps.map((step) => ({
      id:
        step.id && current.some((item) => item.id === step.id)
          ? step.id
          : uuid(),
      offset: step.offset,
      message: step.message,
    }));

  return {
    async listAutoCampaigns(clinicId: string) {
      return repositoryContext.autoCampaigns
        .filter((item) => item.clinicId === clinicId && !item.deletedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(toCampaign);
    },

    async getAutoCampaign(clinicId: string, campaignId: string) {
      const campaign = find(clinicId, campaignId);
      return campaign ? toCampaign(campaign) : null;
    },

    async createAutoCampaign(
      clinicId: string,
      actorUserId: string,
      input: AutoCampaignWrite,
    ) {
      const timestamp = now();
      const campaign: StoredAutoCampaign = {
        id: uuid(),
        clinicId,
        name: input.name,
        trigger: input.trigger,
        active: input.active,
        steps: steps(input),
        ...(input.promotion ? { promotion: input.promotion } : {}),
        createdBy: actorUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.autoCampaigns.push(campaign);
      return toCampaign(campaign);
    },

    async updateAutoCampaign(
      clinicId: string,
      campaignId: string,
      input: AutoCampaignWrite,
    ) {
      const campaign = find(clinicId, campaignId);
      if (!campaign) return null;
      campaign.steps = steps(input, campaign.steps);
      campaign.name = input.name;
      campaign.trigger = input.trigger;
      campaign.active = input.active;
      if (input.promotion) campaign.promotion = input.promotion;
      else delete campaign.promotion;
      campaign.updatedAt = now();
      return toCampaign(campaign);
    },

    async deleteAutoCampaign(clinicId: string, campaignId: string) {
      const campaign = find(clinicId, campaignId);
      if (!campaign) return false;
      campaign.deletedAt = now();
      return true;
    },

    async listAutoCampaignDeliveries(clinicId: string) {
      return repositoryContext.autoCampaignDeliveries
        .filter(
          (item) =>
            item.clinicId === clinicId && find(clinicId, item.campaignId),
        )
        .map(toDelivery);
    },

    async saveAutoCampaignDelivery(
      clinicId: string,
      actorUserId: string,
      input: AutoCampaignDeliveryWrite,
    ) {
      const campaign = find(clinicId, input.campaignId);
      if (!campaign?.steps.some((step) => step.id === input.stepId))
        throw new DomainError(
          "AUTO_CAMPAIGN_NOT_FOUND",
          "Campanha automática não encontrada.",
          404,
        );
      if (
        !repositoryContext.patients.some(
          (item) => item.clinicId === clinicId && item.id === input.patientId,
        )
      )
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      const deliveries = repositoryContext.autoCampaignDeliveries;
      const index = deliveries.findIndex(
        (item) =>
          item.clinicId === clinicId &&
          item.campaignId === input.campaignId &&
          item.stepId === input.stepId &&
          item.occurrenceKey === input.occurrenceKey,
      );
      const stored: StoredAutoCampaignDelivery = {
        id: index >= 0 ? deliveries[index]!.id : uuid(),
        clinicId,
        campaignId: input.campaignId,
        stepId: input.stepId,
        patientId: input.patientId,
        occurrenceKey: input.occurrenceKey,
        status: input.status,
        ...(input.status === "skipped" && input.skipReason
          ? { skipReason: input.skipReason }
          : {}),
        ...(input.note ? { note: input.note } : {}),
        message: input.message,
        ...(input.status === "sent" && input.promotionValidUntil
          ? { promotionValidUntil: input.promotionValidUntil }
          : {}),
        handledAt: now(),
        handledBy: actorUserId,
      };
      if (index >= 0) deliveries[index] = stored;
      else deliveries.push(stored);
      return toDelivery(stored);
    },

    async listAutoCampaignRedemptions(clinicId: string) {
      return repositoryContext.autoCampaignRedemptions
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.source !== "manual" &&
            find(clinicId, item.campaignId),
        )
        .flatMap((redemption): AutoCampaignRedemption[] => {
          const appointment = repositoryContext.appointments.find(
            (item) =>
              item.clinicId === clinicId &&
              item.id === redemption.appointmentId,
          );
          if (!appointment) return [];
          return [
            {
              id: redemption.id,
              campaignId: redemption.campaignId,
              patientId: redemption.patientId,
              occurrenceKey: redemption.occurrenceKey,
              appointmentId: redemption.appointmentId,
              appointmentStatus: appointment.status,
              redeemedOn: redemption.redeemedOn,
              ...(redemption.blockedUntil
                ? { blockedUntil: redemption.blockedUntil }
                : {}),
            },
          ];
        });
    },

    async deleteAutoCampaignDelivery(clinicId: string, deliveryId: string) {
      const deliveries = repositoryContext.autoCampaignDeliveries;
      const index = deliveries.findIndex(
        (item) => item.clinicId === clinicId && item.id === deliveryId,
      );
      if (index < 0) return false;
      deliveries.splice(index, 1);
      return true;
    },

    async getAutoCampaignSourceData(clinicId: string, surveysFrom: string) {
      const ofClinic = <T extends { clinicId: string }>(items: T[]) =>
        items.filter((item) => item.clinicId === clinicId);
      const [plans, surveys] = await Promise.all([
        repositoryContext.operations.listPatientPlans(clinicId),
        repositoryContext.operations.listSatisfactionSurveys(clinicId, {
          from: surveysFrom,
        }),
      ]);
      return {
        patients: ofClinic(repositoryContext.patients),
        plans,
        appointments: ofClinic(repositoryContext.appointments).map(
          (appointment) => ({
            ...appointment,
            branchId: repositoryContext.branchOf(appointment),
          }),
        ),
        receivables: ofClinic(repositoryContext.receivables),
        tabs: ofClinic(repositoryContext.patientTabs),
        surveys,
      };
    },
  };
}
