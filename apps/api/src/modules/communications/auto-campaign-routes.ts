import { z } from "zod";
import {
  autoCampaignDeliveryInputSchema,
  autoCampaignInputSchema,
  type AutoCampaign,
} from "@crm/contracts";
import type { FastifyRequest } from "fastify";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import {
  loadAutoCampaignQueue,
  promotionValidUntil,
} from "./auto-campaigns.js";

const idParams = z.object({ id: z.uuid() });
const campaignNotFound = () =>
  new DomainError(
    "AUTO_CAMPAIGN_NOT_FOUND",
    "Campanha automática não encontrada.",
    404,
  );

/**
 * Campanhas automáticas: a equipe configura mensagens por momento do evento e a fila do
 * dia é recalculada a cada consulta. O envio é manual (WhatsApp) e registrado aqui.
 */
export function registerAutoCampaignRoutes(context: RouteContext) {
  const { app, authenticate, repository, assertPermissions, requestAccess } =
    context;
  const modulesOf = (request: FastifyRequest) =>
    requestAccess.get(request)?.modules ?? [];

  /** Criar, alterar e excluir campanha ficam no Histórico (nome, evento e mensagens). */
  const audit = (
    request: FastifyRequest,
    action: "created" | "updated" | "deleted",
    campaign: AutoCampaign,
  ) =>
    repository.recordAdminAuditEvent(
      request.user.clinicId,
      request.user.sub,
      `auto_campaign.${action}`,
      "auto_campaign",
      {
        name: campaign.name,
        trigger: campaign.trigger,
        active: campaign.active,
        steps: campaign.steps.length,
        promotional: Boolean(campaign.promotion),
      },
      campaign.id,
    );

  function parseCampaign(request: FastifyRequest) {
    const input = autoCampaignInputSchema.parse(request.body);
    if (input.trigger === "overdue_payment")
      assertPermissions(request, "finance.view");
    return input;
  }

  app.get(
    "/communications/auto-campaigns",
    { preHandler: authenticate },
    async (request) => repository.listAutoCampaigns(request.user.clinicId),
  );

  app.get(
    "/communications/auto-campaigns/queue",
    { preHandler: authenticate },
    async (request) =>
      loadAutoCampaignQueue(
        repository,
        request.user.clinicId,
        modulesOf(request),
      ),
  );

  app.post(
    "/communications/auto-campaigns",
    { preHandler: authenticate },
    async (request, reply) => {
      const campaign = await repository.createAutoCampaign(
        request.user.clinicId,
        request.user.sub,
        parseCampaign(request),
      );
      await audit(request, "created", campaign);
      return reply.status(201).send(campaign);
    },
  );

  app.put(
    "/communications/auto-campaigns/:id",
    { preHandler: authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const campaign = await repository.updateAutoCampaign(
        request.user.clinicId,
        id,
        parseCampaign(request),
      );
      if (!campaign) throw campaignNotFound();
      await audit(request, "updated", campaign);
      return campaign;
    },
  );

  app.delete(
    "/communications/auto-campaigns/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const campaign = await repository.getAutoCampaign(
        request.user.clinicId,
        id,
      );
      if (
        !campaign ||
        !(await repository.deleteAutoCampaign(request.user.clinicId, id))
      )
        throw campaignNotFound();
      await audit(request, "deleted", campaign);
      return reply.status(204).send();
    },
  );

  /** Marca enviada ou não enviada (com motivo) a mensagem que está na fila de hoje. */
  app.post(
    "/communications/auto-campaigns/deliveries",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = autoCampaignDeliveryInputSchema.parse(request.body);
      const queue = await loadAutoCampaignQueue(
        repository,
        request.user.clinicId,
        modulesOf(request),
      );
      const item = queue.items.find(
        (entry) =>
          entry.campaignId === input.campaignId &&
          entry.stepId === input.stepId &&
          entry.occurrenceKey === input.occurrenceKey &&
          entry.patientId === input.patientId,
      );
      if (!item)
        throw new DomainError(
          "AUTO_CAMPAIGN_ITEM_GONE",
          "Essa mensagem não está mais na fila. Atualize a lista.",
          409,
        );
      const campaign =
        input.status === "sent"
          ? await repository.getAutoCampaign(
              request.user.clinicId,
              input.campaignId,
            )
          : null;
      return reply.status(201).send(
        await repository.saveAutoCampaignDelivery(
          request.user.clinicId,
          request.user.sub,
          {
            ...input,
            message: item.message,
            ...(campaign?.promotion
              ? {
                  promotionValidUntil: promotionValidUntil(
                    campaign,
                    campaign.promotion,
                    item.eventDate,
                    queue.date,
                  ),
                }
              : {}),
          },
        ),
      );
    },
  );

  app.delete(
    "/communications/auto-campaigns/deliveries/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      if (
        !(await repository.deleteAutoCampaignDelivery(
          request.user.clinicId,
          id,
        ))
      )
        throw new DomainError(
          "AUTO_CAMPAIGN_DELIVERY_NOT_FOUND",
          "Registro de envio não encontrado.",
          404,
        );
      return reply.status(204).send();
    },
  );
}
