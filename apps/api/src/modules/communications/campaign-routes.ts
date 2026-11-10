import { z } from "zod";
import {
  campaignRecipientStatusInputSchema,
  messageTemplateArchiveInputSchema,
  messageTemplateInputSchema,
  whatsappCampaignInputSchema,
  whatsappCampaignPreviewInputSchema,
  usesAppointmentVariables,
  type CampaignFilterOptions,
  type WhatsappCampaignPreview,
} from "@crm/contracts";
import type { FastifyRequest } from "fastify";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import {
  clinicDateOf,
  DEFAULT_CLINIC_TIMEZONE,
} from "../finance/daily-cash.js";
import {
  buildCampaignAudience,
  inspectTemplateImages,
  segmentNeedsAppointments,
} from "./campaigns.js";

const dayMs = 24 * 60 * 60 * 1000;

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
  const { app, authenticate, repository, assertPermissions, requestAccess } =
    context;

  async function planAudience(request: FastifyRequest, body: unknown) {
    const clinicId = request.user.clinicId;
    const input = whatsappCampaignPreviewInputSchema.parse(body);
    const template = (await repository.listMessageTemplates(clinicId)).find(
      (item) => item.id === input.templateId && !item.archivedAt,
    );
    if (!template) throw templateNotFound();
    const segment =
      input.audience.mode === "segment" ? input.audience.segment : null;
    if (segment?.overdue) assertPermissions(request, "finance.view");
    const now = new Date();
    const settings = await repository.getClinicSettings(clinicId);
    const timezone = settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE;
    const today = clinicDateOf(now, timezone);
    const needsPlans = Boolean(
      segment &&
      (segment.activePlan !== undefined ||
        segment.planExpiringDays ||
        segment.maxRemainingSessions !== undefined),
    );
    const [patients, plans, center, appointments, overdue, contacted] =
      await Promise.all([
        repository.listPatients(clinicId),
        needsPlans ? repository.listPatientPlans(clinicId) : [],
        repository.getCommunicationCenter(clinicId),
        (segment && segmentNeedsAppointments(segment)) ||
        usesAppointmentVariables(template.body)
          ? repository.listAppointments(
              clinicId,
              new Date(now.getTime() - 3 * 365 * dayMs).toISOString(),
              new Date(now.getTime() + 365 * dayMs).toISOString(),
            )
          : [],
        segment?.overdue
          ? repository.listOverduePatientIds(clinicId, today)
          : [],
        segment?.excludeContactedDays
          ? contactedPatientIds(
              clinicId,
              now.getTime() - segment.excludeContactedDays * dayMs,
            )
          : [],
      ]);
    return buildCampaignAudience(
      patients,
      {
        plans,
        preferences: center.preferences,
        appointments,
        overduePatientIds: new Set(overdue),
        contactedPatientIds: new Set(contacted),
        now,
        timezone,
      },
      input.audience,
      template.body,
      today,
    );
  }

  /** Clientes marcados como "enviada" em alguma campanha desde `since` (ms). */
  async function contactedPatientIds(clinicId: string, since: number) {
    const campaigns = (await repository.listWhatsappCampaigns(clinicId)).filter(
      (campaign) =>
        campaign.sent > 0 &&
        Date.parse(campaign.completedAt ?? new Date().toISOString()) >= since,
    );
    const details = await Promise.all(
      campaigns.map((campaign) =>
        repository.getWhatsappCampaign(clinicId, campaign.id),
      ),
    );
    return details.flatMap((detail) =>
      (detail?.recipients ?? [])
        .filter(
          (item) =>
            item.status === "sent" &&
            item.handledAt !== undefined &&
            Date.parse(item.handledAt) >= since,
        )
        .map((item) => item.patientId),
    );
  }

  app.get(
    "/communications/campaigns/filter-options",
    { preHandler: authenticate },
    async (request): Promise<CampaignFilterOptions> => {
      const clinicId = request.user.clinicId;
      const [patients, services, professionals] = await Promise.all([
        repository.listPatients(clinicId),
        repository.listServices(clinicId),
        repository.listProfessionals(clinicId),
      ]);
      const distinct = (values: Array<string | undefined>) =>
        [...new Set(values.map((value) => value?.trim()).filter(Boolean))]
          .map(String)
          .sort((a, b) => a.localeCompare(b, "pt-BR"));
      return {
        services: services
          .filter((item) => item.active)
          .map(({ id, name }) => ({ id, name })),
        professionals: professionals
          .filter((item) => item.active)
          .map(({ id, fullName }) => ({ id, name: fullName })),
        cities: distinct(patients.map((item) => item.city)),
        neighborhoods: distinct(patients.map((item) => item.neighborhood)),
        sources: distinct(patients.map((item) => item.source)),
        occupations: distinct(patients.map((item) => item.occupation)),
        interests: distinct(patients.flatMap((item) => item.interests ?? [])),
        levels: distinct(patients.map((item) => item.level)),
        finance: Boolean(
          requestAccess.get(request)?.permissions.includes("finance.view"),
        ),
      };
    },
  );

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
      const plan = await planAudience(request, request.body);
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
      if (input.promotion?.validUntil) {
        const settings = await repository.getClinicSettings(
          request.user.clinicId,
        );
        const today = clinicDateOf(
          new Date(),
          settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE,
        );
        if (input.promotion.validUntil < today)
          throw new DomainError(
            "CAMPAIGN_PROMOTION_EXPIRED",
            "A data final da promoção já passou.",
            400,
          );
      }
      const plan = await planAudience(request, input);
      const campaign = await repository.createWhatsappCampaign(
        request.user.clinicId,
        request.user.sub,
        {
          templateId: input.templateId,
          name: input.name,
          recipients: plan.drafts,
          ...(input.promotion ? { promotion: input.promotion } : {}),
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
