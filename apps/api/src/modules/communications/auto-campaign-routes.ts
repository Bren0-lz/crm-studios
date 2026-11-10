import { z } from "zod";
import {
  autoCampaignDeliveryInputSchema,
  autoCampaignInputSchema,
  type AutoCampaign,
  type AutoCampaignInput,
  type AutoCampaignProductOption,
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

  async function parseCampaign(request: FastifyRequest) {
    const input = autoCampaignInputSchema.parse(request.body);
    if (input.trigger === "overdue_payment")
      assertPermissions(request, "finance.view");
    const promotion = input.promotion;
    if (promotion) {
      // Os planos só valem com desconto; sem desconto, a lista é descartada.
      if (!promotion.discount) delete promotion.planTemplateIds;
      const planIds = [...new Set(promotion.planTemplateIds ?? [])];
      if (planIds.length) {
        const known = new Set(
          (await repository.listPlanTemplates(request.user.clinicId)).map(
            (template) => template.id,
          ),
        );
        if (planIds.some((id) => !known.has(id)))
          throw new DomainError(
            "AUTO_CAMPAIGN_PLAN_NOT_FOUND",
            "Um dos planos escolhidos para o desconto não existe mais.",
            400,
          );
      }
      if (promotion.planTemplateIds) promotion.planTemplateIds = planIds;
      await normalizeProductScope(request.user.clinicId, promotion);
    }
    return input;
  }

  /**
   * Onde o desconto vale além dos planos: sem desconto, nada; planos desligados descartam a
   * lista de planos; produtos só com `appliesToProducts` e todos precisam existir na clínica.
   */
  async function normalizeProductScope(
    clinicId: string,
    promotion: NonNullable<AutoCampaignInput["promotion"]>,
  ) {
    if (!promotion.discount) {
      delete promotion.appliesToPlans;
      delete promotion.appliesToProducts;
      delete promotion.productIds;
      return;
    }
    if (promotion.appliesToPlans !== false) delete promotion.appliesToPlans;
    else delete promotion.planTemplateIds;
    if (promotion.appliesToProducts !== true) {
      delete promotion.appliesToProducts;
      delete promotion.productIds;
      return;
    }
    const productIds = [...new Set(promotion.productIds ?? [])];
    if (productIds.length) {
      const known = new Set(
        (await repository.getInventoryWorkspace(clinicId)).products.map(
          (product) => product.id,
        ),
      );
      if (productIds.some((id) => !known.has(id)))
        throw new DomainError(
          "AUTO_CAMPAIGN_PRODUCT_NOT_FOUND",
          "Um dos produtos escolhidos para o desconto não existe mais.",
          400,
        );
    }
    promotion.productIds = productIds;
  }

  app.get(
    "/communications/auto-campaigns",
    { preHandler: authenticate },
    async (request) => repository.listAutoCampaigns(request.user.clinicId),
  );

  /** Produtos para escolher onde o desconto da promoção vale (só nome e se está ativo). */
  app.get(
    "/communications/auto-campaigns/products",
    { preHandler: authenticate },
    async (request): Promise<AutoCampaignProductOption[]> =>
      (await repository.getInventoryWorkspace(request.user.clinicId)).products
        .map((product) => ({
          id: product.id,
          name: product.name,
          active: product.active,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
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
        await parseCampaign(request),
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
        await parseCampaign(request),
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
