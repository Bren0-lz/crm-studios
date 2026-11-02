import {
  patientPlanInputSchema,
  planPurchaseInputSchema,
  planAutoRenewInputSchema,
  planCatalogInputSchema,
  planRenewalInputSchema,
  planTemplateInputSchema,
  planTemplateUpdateSchema,
  planTransitionSchema,
  planCancellationDetailsSchema,
  planPauseDetailsSchema,
  isRecurringChargeValid,
  recurringSingleChargeIssue,
  autoRenewPaymentPartsIssue,
  autoRenewPaymentPartsValid,
  type ApiError,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { optionalPatientFilterSchema } from "../../infrastructure/route-utils.js";
import { DomainError } from "../../repository.js";

export function registerPlansRoutes(context: RouteContext) {
  const {
    app,
    authenticate,
    repository,
    assertPermissions,
    assertNoHoliday,
    assertServiceAvailable,
    assertInstallmentsAllowed,
    withServerFirstCharge,
    requestAccess,
  } = context;
  app.post(
    "/plans/purchases",
    { preHandler: authenticate },
    async (request, reply) => {
      const parsed = planPurchaseInputSchema.parse(request.body);
      const input = {
        ...parsed,
        plan: await withServerFirstCharge(
          request.user.clinicId,
          parsed.plan,
          parsed.groupId,
        ),
      };
      if (input.groupId) assertPermissions(request, "groups.enroll");
      if (input.appointments.length)
        assertPermissions(request, "agenda.create");
      if (input.document)
        assertPermissions(request, "contracts.issue", "contracts.status");
      if (input.appointments.length)
        await assertNoHoliday(
          request.user.clinicId,
          input.appointments.map((item) => item.startsAt),
        );
      await assertServiceAvailable(request.user.clinicId, input.appointments);
      await assertInstallmentsAllowed(request.user.clinicId, input.plan);
      return reply
        .status(201)
        .send(
          await repository.purchasePatientPlan(
            request.user.clinicId,
            request.user.sub,
            input,
          ),
        );
    },
  );

  app.get("/plan-catalog", { preHandler: authenticate }, async (request) =>
    repository.listPlanCatalog(request.user.clinicId),
  );

  app.post(
    "/plan-catalog",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createPlanCatalogEntry(
            request.user.clinicId,
            request.user.sub,
            planCatalogInputSchema.parse(request.body),
          ),
        ),
  );

  app.put(
    "/plan-catalog/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = planCatalogInputSchema.parse(request.body);
      const updated = z.uuid().safeParse(id).success
        ? await repository.updatePlanCatalogEntry(
            request.user.clinicId,
            request.user.sub,
            id,
            input,
          )
        : null;
      if (!updated)
        return reply.status(404).send({
          code: "PLAN_CATALOG_NOT_FOUND",
          message: "Plano do catálogo não encontrado.",
        } satisfies ApiError);
      return updated;
    },
  );

  app.delete(
    "/plan-catalog/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted =
        z.uuid().safeParse(id).success &&
        (await repository.deletePlanCatalogEntry(
          request.user.clinicId,
          request.user.sub,
          id,
        ));
      if (!deleted)
        return reply.status(404).send({
          code: "PLAN_CATALOG_NOT_FOUND",
          message: "Plano do catálogo não encontrado.",
        } satisfies ApiError);
      return reply.status(204).send();
    },
  );

  app.get("/plan-templates", { preHandler: authenticate }, async (request) =>
    repository.listPlanTemplates(request.user.clinicId),
  );

  app.post(
    "/plan-templates",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createPlanTemplate(
            request.user.clinicId,
            request.user.sub,
            planTemplateInputSchema.parse(request.body),
          ),
        ),
  );

  app.patch(
    "/plan-templates/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = planTemplateUpdateSchema.parse(request.body);
      const item = z.uuid().safeParse(id).success
        ? await repository.updatePlanTemplate(
            request.user.clinicId,
            request.user.sub,
            id,
            input,
          )
        : null;
      if (!item)
        return reply.status(404).send({
          code: "PLAN_TEMPLATE_NOT_FOUND",
          message: "Plano do catálogo não encontrado.",
        } satisfies ApiError);
      return item;
    },
  );

  app.get("/plans", { preHandler: authenticate }, async (request) => {
    const query = optionalPatientFilterSchema.parse(request.query);
    await repository.renewDuePatientPlans(
      request.user.clinicId,
      request.user.sub,
    );
    const plans = await repository.listPatientPlans(
      request.user.clinicId,
      query.patientId,
    );
    // Situação das parcelas só para quem vê o Financeiro (como "Pagamento atrasado").
    if (requestAccess.get(request)?.modules.includes("finance")) return plans;
    return plans.map((plan) => {
      const { paymentSummary, ...rest } = plan;
      void paymentSummary;
      return rest;
    });
  });

  app.post("/plans", { preHandler: authenticate }, async (request, reply) => {
    // Sem turma nesta rota: o 1º pagamento proporcional não se aplica.
    const input = await withServerFirstCharge(
      request.user.clinicId,
      patientPlanInputSchema.parse(request.body),
    );
    await assertInstallmentsAllowed(request.user.clinicId, input);
    return reply
      .status(201)
      .send(
        await repository.createPatientPlan(
          request.user.clinicId,
          request.user.sub,
          input,
        ),
      );
  });

  app.patch(
    "/plans/:id/status",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const status = planTransitionSchema.parse(
        (request.body as { status?: unknown }).status,
      );
      const pause = planPauseDetailsSchema.parse(
        (request.body as { pause?: unknown }).pause ?? {},
      );
      const cancellation = planCancellationDetailsSchema.parse(
        (request.body as { cancellation?: unknown }).cancellation ?? {},
      );

      assertPermissions(
        request,
        status === "cancelled" ? "plans.cancel" : "plans.status",
      );
      const plan = await repository.updatePatientPlanStatus(
        request.user.clinicId,
        request.user.sub,
        id,
        status,
        pause,
        cancellation,
      );
      if (!plan)
        return reply.status(404).send({
          code: "PLAN_NOT_FOUND",
          message: "Plano não encontrado.",
        });
      return plan;
    },
  );

  app.post(
    "/plans/:id/renew",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      // A renovação cobra o valor cheio: nada de 1º pagamento proporcional.
      const input = await withServerFirstCharge(
        request.user.clinicId,
        planRenewalInputSchema.parse(request.body),
      );
      const current = (
        await repository.listPatientPlans(request.user.clinicId)
      ).find((item) => item.id === id);
      if (
        current &&
        !isRecurringChargeValid({
          kind: current.kind,
          installments: input.installments,
          paymentParts: input.paymentParts,
        })
      )
        throw new DomainError(
          "RECURRING_SINGLE_CHARGE",
          recurringSingleChargeIssue,
          400,
        );
      await assertInstallmentsAllowed(request.user.clinicId, {
        installments: input.installments,
        paymentMethod: input.paymentMethod,
        paymentParts: input.paymentParts,
        planTemplateId: current?.planTemplateId,
      });
      const plan = await repository.renewPatientPlan(
        request.user.clinicId,
        request.user.sub,
        id,
        input,
      );
      if (!plan)
        return reply.status(404).send({
          code: "PLAN_NOT_FOUND",
          message: "Plano não encontrado.",
        });
      return reply.status(201).send(plan);
    },
  );

  app.patch(
    "/plans/:id/auto-renew",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { autoRenew } = planAutoRenewInputSchema.parse(request.body);
      if (autoRenew) {
        const current = (
          await repository.listPatientPlans(request.user.clinicId)
        ).find((item) => item.id === id);
        if (
          current &&
          !autoRenewPaymentPartsValid({
            autoRenew,
            paymentParts: current.paymentParts,
          })
        )
          throw new DomainError(
            "AUTO_RENEW_NEEDS_RECURRING_PAYMENT",
            autoRenewPaymentPartsIssue.message,
            400,
          );
      }
      const plan = await repository.updatePatientPlanAutoRenew(
        request.user.clinicId,
        request.user.sub,
        id,
        autoRenew,
      );
      if (!plan)
        return reply.status(404).send({
          code: "PLAN_NOT_FOUND",
          message: "Plano não encontrado.",
        });
      return plan;
    },
  );

  app.get(
    "/plans/:id/movements",
    { preHandler: authenticate },
    async (request) => {
      const { id } = request.params as { id: string };
      return repository.listSessionMovements(request.user.clinicId, id);
    },
  );
}
