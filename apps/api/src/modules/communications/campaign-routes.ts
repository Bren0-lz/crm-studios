import { z } from "zod";
import {
  campaignRecipientStatusInputSchema,
  messageTemplateArchiveInputSchema,
  messageTemplateInputSchema,
  whatsappCampaignInputSchema,
  whatsappCampaignPreviewInputSchema,
  type WhatsappCampaignPreview,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import {
  clinicDateOf,
  DEFAULT_CLINIC_TIMEZONE,
} from "../finance/daily-cash.js";
import { buildCampaignAudience, inspectTemplateImages } from "./campaigns.js";

const idParams = z.object({ id: z.uuid() });
const templateNotFound = () =>
  new DomainError(
    "MESSAGE_TEMPLATE_NOT_FOUND",
    "Mensagem padrão não encontrada ou arquivada.",
    404,
  );
const campaignNotFound = () =>
  new DomainError("CAMPAIGN_NOT_FOUND", "Campanha não encontrada.", 404);

/** Mensagens padrão e campanhas de WhatsApp enviadas manualmente pela equipe. */
export function registerCampaignRoutes(context: RouteContext) {
  const { app, authenticate, repository } = context;

  async function planAudience(clinicId: string, body: unknown) {
    const input = whatsappCampaignPreviewInputSchema.parse(body);
    const template = (await repository.listMessageTemplates(clinicId)).find(
      (item) => item.id === input.templateId && !item.archivedAt,
    );
    if (!template) throw templateNotFound();
    const needsPlans =
      input.audience.mode === "segment" &&
      input.audience.segment.activePlan !== undefined;
    const [patients, plans, center, settings] = await Promise.all([
      repository.listPatients(clinicId),
      needsPlans ? repository.listPatientPlans(clinicId) : Promise.resolve([]),
      repository.getCommunicationCenter(clinicId),
      repository.getClinicSettings(clinicId),
    ]);
    return buildCampaignAudience(
      patients,
      plans,
      center.preferences,
      input.audience,
      template.body,
      clinicDateOf(new Date(), settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE),
    );
  }

  app.get(
    "/communications/templates",
    { preHandler: authenticate },
    async (request) => repository.listMessageTemplates(request.user.clinicId),
  );

  app.get(
    "/communications/template-images/:id",
    { preHandler: authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const image = await repository.getMessageTemplateImage(
        request.user.clinicId,
        id,
      );
      if (!image)
        throw new DomainError(
          "MESSAGE_IMAGE_NOT_FOUND",
          "Imagem não encontrada.",
          404,
        );
      return image;
    },
  );

  app.post(
    "/communications/templates",
    { preHandler: authenticate, bodyLimit: 12 * 1024 * 1024 },
    async (request, reply) => {
      const input = messageTemplateInputSchema.parse(request.body);
      const template = await repository.createMessageTemplate(
        request.user.clinicId,
        request.user.sub,
        { ...input, images: inspectTemplateImages(input.images) },
      );
      return reply.status(201).send(template);
    },
  );

  app.put(
    "/communications/templates/:id",
    { preHandler: authenticate, bodyLimit: 12 * 1024 * 1024 },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const input = messageTemplateInputSchema.parse(request.body);
      const template = await repository.updateMessageTemplate(
        request.user.clinicId,
        request.user.sub,
        id,
        { ...input, images: inspectTemplateImages(input.images) },
      );
      if (!template) throw templateNotFound();
      return template;
    },
  );

  app.post(
    "/communications/templates/:id/archive",
    { preHandler: authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const { archived } = messageTemplateArchiveInputSchema.parse(
        request.body,
      );
      const template = await repository.setMessageTemplateArchived(
        request.user.clinicId,
        request.user.sub,
        id,
        archived,
      );
      if (!template) throw templateNotFound();
      return template;
    },
  );

  app.get(
    "/communications/campaigns",
    { preHandler: authenticate },
    async (request) => repository.listWhatsappCampaigns(request.user.clinicId),
  );

  app.get(
    "/communications/campaigns/:id",
    { preHandler: authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const campaign = await repository.getWhatsappCampaign(
        request.user.clinicId,
        id,
      );
      if (!campaign) throw campaignNotFound();
      return campaign;
    },
  );

  app.post(
    "/communications/campaigns/preview",
    { preHandler: authenticate },
    async (request): Promise<WhatsappCampaignPreview> => {
      const plan = await planAudience(request.user.clinicId, request.body);
      const first = plan.drafts[0];
      return {
        matched: plan.matched,
        recipients: plan.drafts.length,
        included: plan.drafts.map(({ patientId, patientName, phone }) => ({
          patientId,
          patientName,
          phone,
        })),
        skipped: plan.skipped,
        ...(first
          ? {
              sample: {
                patientName: first.patientName,
                message: first.message,
              },
            }
          : {}),
      };
    },
  );

  app.post(
    "/communications/campaigns",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = whatsappCampaignInputSchema.parse(request.body);
      const plan = await planAudience(request.user.clinicId, input);
      const campaign = await repository.createWhatsappCampaign(
        request.user.clinicId,
        request.user.sub,
        {
          templateId: input.templateId,
          name: input.name,
          recipients: plan.drafts,
        },
      );
      return reply.status(201).send(campaign);
    },
  );

  app.post(
    "/communications/campaigns/:id/recipients/:recipientId",
    { preHandler: authenticate },
    async (request) => {
      const { id, recipientId } = z
        .object({ id: z.uuid(), recipientId: z.uuid() })
        .parse(request.params);
      const { status } = campaignRecipientStatusInputSchema.parse(request.body);
      const result = await repository.setWhatsappCampaignRecipientStatus(
        request.user.clinicId,
        request.user.sub,
        id,
        recipientId,
        status,
      );
      if (!result) throw campaignNotFound();
      return result;
    },
  );
}
