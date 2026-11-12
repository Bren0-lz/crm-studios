import type {
  AutoCampaignRedemption,
  CampaignRecipientStatus,
  MessageImageMimeType,
  MessageTemplate,
  MessageTemplateImage,
  WhatsappCampaign,
  WhatsappCampaignDetail,
  WhatsappCampaignPromotion,
  WhatsappCampaignRecipient,
  WhatsappCampaignRecipientDraft,
} from "@crm/contracts";
import { DomainError, type MessageTemplateWrite } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export interface StoredMessageTemplate {
  id: string;
  clinicId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface StoredMessageTemplateImage extends MessageTemplateImage {
  clinicId: string;
  templateId: string;
  position: number;
  dataUrl: string;
  removedAt?: string;
}

export interface StoredWhatsappCampaign {
  id: string;
  clinicId: string;
  templateId: string;
  templateTitle: string;
  name: string;
  body: string;
  imageIds: string[];
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  promotion?: WhatsappCampaignPromotion;
  recipients: Array<
    WhatsappCampaignRecipientDraft & {
      id: string;
      status: CampaignRecipientStatus;
      handledAt?: string;
      handledBy?: string;
    }
  >;
}

const imageSummary = (
  image: StoredMessageTemplateImage,
): MessageTemplateImage => ({
  id: image.id,
  fileName: image.fileName,
  mimeType: image.mimeType,
  sizeBytes: image.sizeBytes,
});

export function createCampaignsRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  const userName = (clinicId: string, userId?: string) =>
    repositoryContext.users.find(
      (item) => item.clinicId === clinicId && item.id === userId,
    )?.fullName ?? "Usuário removido";

  const templateImages = (template: StoredMessageTemplate) =>
    repositoryContext.messageTemplateImages
      .filter(
        (image) =>
          image.clinicId === template.clinicId &&
          image.templateId === template.id &&
          !image.removedAt,
      )
      .sort((a, b) => a.position - b.position);

  const toTemplate = (template: StoredMessageTemplate): MessageTemplate => ({
    id: template.id,
    title: template.title,
    body: template.body,
    images: templateImages(template).map(imageSummary),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    ...(template.archivedAt ? { archivedAt: template.archivedAt } : {}),
  });

  const findTemplate = (clinicId: string, templateId: string) =>
    repositoryContext.messageTemplates.find(
      (item) => item.clinicId === clinicId && item.id === templateId,
    );

  const toCampaign = (campaign: StoredWhatsappCampaign): WhatsappCampaign => {
    const images = campaign.imageIds
      .map((id) =>
        repositoryContext.messageTemplateImages.find(
          (image) => image.clinicId === campaign.clinicId && image.id === id,
        ),
      )
      .filter((image) => image !== undefined)
      .map(imageSummary);
    return {
      id: campaign.id,
      name: campaign.name,
      templateId: campaign.templateId,
      templateTitle: campaign.templateTitle,
      body: campaign.body,
      images,
      total: campaign.recipients.length,
      sent: campaign.recipients.filter((item) => item.status === "sent").length,
      skipped: campaign.recipients.filter((item) => item.status === "skipped")
        .length,
      createdAt: campaign.createdAt,
      createdByName: userName(campaign.clinicId, campaign.createdBy),
      ...(campaign.completedAt ? { completedAt: campaign.completedAt } : {}),
      ...(campaign.promotion ? { promotion: campaign.promotion } : {}),
    };
  };

  const toRecipient = (
    campaign: StoredWhatsappCampaign,
    recipient: StoredWhatsappCampaign["recipients"][number],
  ): WhatsappCampaignRecipient => ({
    id: recipient.id,
    ...(recipient.patientId ? { patientId: recipient.patientId } : {}),
    ...(recipient.leadId ? { leadId: recipient.leadId } : {}),
    patientName: recipient.patientName,
    phone: recipient.phone,
    message: recipient.message,
    status: recipient.status,
    ...(recipient.handledAt
      ? {
          handledAt: recipient.handledAt,
          handledByName: userName(campaign.clinicId, recipient.handledBy),
        }
      : {}),
  });

  const toDetail = (
    campaign: StoredWhatsappCampaign,
  ): WhatsappCampaignDetail => ({
    ...toCampaign(campaign),
    recipients: campaign.recipients.map((item) => toRecipient(campaign, item)),
  });

  /** Grava as imagens do modelo: mantém as com `id` (na nova ordem) e tira as demais. */
  function writeImages(
    clinicId: string,
    templateId: string,
    images: MessageTemplateWrite["images"],
  ) {
    const current = repositoryContext.messageTemplateImages.filter(
      (image) =>
        image.clinicId === clinicId &&
        image.templateId === templateId &&
        !image.removedAt,
    );
    for (const image of images)
      if ("id" in image && !current.some((item) => item.id === image.id))
        throw new DomainError(
          "MESSAGE_TEMPLATE_IMAGE_NOT_FOUND",
          "Imagem não encontrada nesta mensagem padrão.",
          400,
        );
    const kept = new Set(
      images.flatMap((image) => ("id" in image ? [image.id] : [])),
    );
    const removedAt = now();
    for (const image of current)
      if (!kept.has(image.id)) image.removedAt = removedAt;
    images.forEach((image, position) => {
      if ("id" in image) {
        current.find((item) => item.id === image.id)!.position = position;
        return;
      }
      repositoryContext.messageTemplateImages.push({
        id: uuid(),
        clinicId,
        templateId,
        position,
        fileName: image.fileName,
        mimeType: image.mimeType as MessageImageMimeType,
        sizeBytes: image.sizeBytes,
        dataUrl: image.dataUrl,
      });
    });
  }

  return {
    async listMessageTemplates(clinicId: string) {
      return repositoryContext.messageTemplates
        .filter((item) => item.clinicId === clinicId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(toTemplate);
    },

    async getMessageTemplateImage(clinicId: string, imageId: string) {
      const image = repositoryContext.messageTemplateImages.find(
        (item) => item.clinicId === clinicId && item.id === imageId,
      );
      return image ? { ...imageSummary(image), dataUrl: image.dataUrl } : null;
    },

    async createMessageTemplate(
      clinicId: string,
      actorUserId: string,
      input: MessageTemplateWrite,
    ) {
      if (input.images.some((image) => "id" in image))
        throw new DomainError(
          "MESSAGE_TEMPLATE_IMAGE_NOT_FOUND",
          "Imagem não encontrada nesta mensagem padrão.",
          400,
        );
      const timestamp = now();
      const template: StoredMessageTemplate = {
        id: uuid(),
        clinicId,
        title: input.title,
        body: input.body,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.messageTemplates.push(template);
      writeImages(clinicId, template.id, input.images);
      repositoryContext.recordAudit(
        clinicId,
        actorUserId,
        "message_template.saved",
        "message_template",
        { title: template.title },
        template.id,
      );
      return toTemplate(template);
    },

    async updateMessageTemplate(
      clinicId: string,
      actorUserId: string,
      templateId: string,
      input: MessageTemplateWrite,
    ) {
      const template = findTemplate(clinicId, templateId);
      if (!template) return null;
      writeImages(clinicId, template.id, input.images);
      template.title = input.title;
      template.body = input.body;
      template.updatedAt = now();
      repositoryContext.recordAudit(
        clinicId,
        actorUserId,
        "message_template.saved",
        "message_template",
        { title: template.title },
        template.id,
      );
      return toTemplate(template);
    },

    async setMessageTemplateArchived(
      clinicId: string,
      actorUserId: string,
      templateId: string,
      archived: boolean,
    ) {
      const template = findTemplate(clinicId, templateId);
      if (!template) return null;
      if (archived) template.archivedAt = template.archivedAt ?? now();
      else delete template.archivedAt;
      template.updatedAt = now();
      repositoryContext.recordAudit(
        clinicId,
        actorUserId,
        "message_template.archived",
        "message_template",
        { title: template.title, archived },
        template.id,
      );
      return toTemplate(template);
    },

    async listWhatsappCampaigns(clinicId: string) {
      return repositoryContext.whatsappCampaigns
        .filter((item) => item.clinicId === clinicId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(toCampaign);
    },

    async getWhatsappCampaign(clinicId: string, campaignId: string) {
      const campaign = repositoryContext.whatsappCampaigns.find(
        (item) => item.clinicId === clinicId && item.id === campaignId,
      );
      return campaign ? toDetail(campaign) : null;
    },

    async createWhatsappCampaign(
      clinicId: string,
      actorUserId: string,
      input: {
        templateId: string;
        name: string;
        recipients: WhatsappCampaignRecipientDraft[];
        promotion?: WhatsappCampaignPromotion | undefined;
      },
    ) {
      const template = findTemplate(clinicId, input.templateId);
      if (!template || template.archivedAt)
        throw new DomainError(
          "MESSAGE_TEMPLATE_NOT_FOUND",
          "Mensagem padrão não encontrada ou arquivada.",
          404,
        );
      if (input.recipients.length === 0)
        throw new DomainError(
          "CAMPAIGN_WITHOUT_RECIPIENTS",
          "Nenhum cliente ou lead com WhatsApp para receber a campanha.",
          400,
        );
      const campaign: StoredWhatsappCampaign = {
        id: uuid(),
        clinicId,
        templateId: template.id,
        templateTitle: template.title,
        name: input.name,
        body: template.body,
        imageIds: templateImages(template).map((image) => image.id),
        createdBy: actorUserId,
        createdAt: now(),
        ...(input.promotion ? { promotion: input.promotion } : {}),
        recipients: input.recipients.map((recipient) => ({
          ...recipient,
          id: uuid(),
          status: "pending" as const,
        })),
      };
      repositoryContext.whatsappCampaigns.push(campaign);
      repositoryContext.recordAudit(
        clinicId,
        actorUserId,
        "campaign.created",
        "whatsapp_campaign",
        {
          name: campaign.name,
          recipients: campaign.recipients.length,
          promotional: Boolean(campaign.promotion),
        },
        campaign.id,
      );
      return toDetail(campaign);
    },

    async setWhatsappCampaignRecipientStatus(
      clinicId: string,
      actorUserId: string,
      campaignId: string,
      recipientId: string,
      status: CampaignRecipientStatus,
    ) {
      const campaign = repositoryContext.whatsappCampaigns.find(
        (item) => item.clinicId === clinicId && item.id === campaignId,
      );
      const recipient = campaign?.recipients.find(
        (item) => item.id === recipientId,
      );
      if (!campaign || !recipient) return null;
      recipient.status = status;
      if (status === "pending") {
        delete recipient.handledAt;
        delete recipient.handledBy;
      } else {
        recipient.handledAt = now();
        recipient.handledBy = actorUserId;
      }
      if (campaign.recipients.some((item) => item.status === "pending"))
        delete campaign.completedAt;
      else campaign.completedAt = campaign.completedAt ?? now();
      return {
        campaign: toCampaign(campaign),
        recipient: toRecipient(campaign, recipient),
      };
    },

    async listWhatsappCampaignRedemptions(clinicId: string) {
      return repositoryContext.autoCampaignRedemptions
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.source === "manual" &&
            repositoryContext.whatsappCampaigns.some(
              (campaign) =>
                campaign.clinicId === clinicId &&
                campaign.id === item.campaignId,
            ),
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
            },
          ];
        });
    },
  };
}
