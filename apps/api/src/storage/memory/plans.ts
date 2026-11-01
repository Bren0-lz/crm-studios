import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import {
  nextPlanPeriod,
  planPaymentSummary,
  validityAfterPause,
  planTemplateInputSchema,
  type PatientPlan,
  type PatientPlanInput,
  type PlanCatalogEntry,
  type PlanCatalogInput,
  type PlanRenewalInput,
  planRefundCategoryName,
  planRefundPayableDescription,
  type Payable,
  type PaymentMethod,
  type PlanCancellationDetails,
  type PlanPauseDetails,
  type PlanStatus,
  type PlanTemplate,
  type PlanTemplateInput,
  type PlanTemplateUpdate,
} from "@crm/contracts";
import {
  assertRefundWithinPlan,
  validatePlanComposition,
} from "../../modules/plans/plan-services.js";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { CLINIC_ID, now, today, uuid } from "./helpers.js";

export function createPlansRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  /** Categoria de despesa dos estornos; criada na primeira vez (grupo "Impostos e deduções"). */
  function refundCategory(clinicId: string) {
    const found = repositoryContext.financialCategories.find(
      (item) =>
        item.clinicId === clinicId &&
        item.kind === "expense" &&
        item.name === planRefundCategoryName,
    );
    if (found) return found;
    const created = {
      id: uuid(),
      clinicId,
      name: planRefundCategoryName,
      kind: "expense" as const,
      active: true,
      dreGroup: "tax" as const,
    };
    repositoryContext.financialCategories.push(created);
    return created;
  }

  /** Lança o estorno do cancelamento como conta já paga (saída de caixa) e devolve o id. */
  function recordRefundPayable(
    plan: PatientPlan,
    amountInCents: number,
    paymentMethod: PaymentMethod,
    note: string | undefined,
  ) {
    const category = refundCategory(plan.clinicId);
    const timestamp = plan.updatedAt;
    const postedOn = clinicDateOf(
      new Date(timestamp),
      repositoryContext.clinicSettings.timezone,
    );
    const payable: Payable = {
      id: uuid(),
      clinicId: plan.clinicId,
      branchId: plan.branchId ?? repositoryContext.writeBranchId(plan.clinicId),
      description: planRefundPayableDescription(plan.patientName, plan.name),
      supplier: plan.patientName,
      ...(note ? { notes: note } : {}),
      categoryId: category.id,
      categoryName: category.name,
      dueDate: postedOn,
      amountInCents,
      postedOn,
      dreCompetence: postedOn.slice(0, 7),
      status: "paid",
      paymentMethod,
      paidAt: timestamp,
      overdue: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    repositoryContext.payables.push(payable);
    return payable.id;
  }

  return {
    async listPlanTemplates(clinicId: string) {
      return repositoryContext.planTemplates
        .filter((item) => item.clinicId === clinicId)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((item) => structuredClone(item));
    },

    async createPlanTemplate(
      clinicId: string,
      actorUserId: string,
      input: PlanTemplateInput,
    ) {
      input = planTemplateInputSchema.parse(input);
      repositoryContext.assertTemplateServices(clinicId, input.services);
      const timestamp = now();
      const { maxInstallments, ...fields } = input;
      const item: PlanTemplate = {
        ...structuredClone(fields),
        ...(maxInstallments ? { maxInstallments } : {}),
        id: uuid(),
        clinicId,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.planTemplates.push(item);
      repositoryContext.addAdminAudit(
        actorUserId,
        "plan_template.created",
        "plan_template",
        item.id,
        { ...structuredClone(item) },
        clinicId,
      );
      return structuredClone(item);
    },

    async updatePlanTemplate(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: PlanTemplateUpdate,
    ) {
      const item = repositoryContext.planTemplates.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (!item) return null;
      const merged = {
        ...item,
        ...input,
        services: input.services ?? item.services,
      };
      if (merged.active || merged.services.length)
        planTemplateInputSchema.parse(merged);
      if (input.services || input.active)
        repositoryContext.assertTemplateServices(clinicId, merged.services);
      const previous = structuredClone(item);
      Object.assign(item, structuredClone(input), { updatedAt: now() });
      // null apaga o limite próprio (volta a valer só o da forma de pagamento).
      if (!item.maxInstallments) delete item.maxInstallments;
      repositoryContext.addAdminAudit(
        actorUserId,
        "plan_template.updated",
        "plan_template",
        id,
        { ...structuredClone(item), previous },
        clinicId,
      );
      return structuredClone(item);
    },

    async listPlanCatalog(clinicId: string) {
      return repositoryContext.planCatalog
        .filter((item) => item.clinicId === clinicId)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((item) => structuredClone(item));
    },

    async createPlanCatalogEntry(
      clinicId: string,
      actorUserId: string,
      input: PlanCatalogInput,
    ) {
      const timestamp = now();
      const entry: PlanCatalogEntry = {
        ...input,
        id: uuid(),
        clinicId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.planCatalog.push(entry);
      if (clinicId === CLINIC_ID)
        repositoryContext.addAdminAudit(
          actorUserId,
          "plan_catalog.created",
          "plan_catalog",
          entry.id,
          { ...input },
          clinicId,
        );
      return structuredClone(entry);
    },

    async updatePlanCatalogEntry(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: PlanCatalogInput,
    ) {
      const entry = repositoryContext.planCatalog.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (!entry) return null;
      Object.assign(entry, input, { updatedAt: now() });
      if (clinicId === CLINIC_ID)
        repositoryContext.addAdminAudit(
          actorUserId,
          "plan_catalog.updated",
          "plan_catalog",
          id,
          { ...input },
          clinicId,
        );
      return structuredClone(entry);
    },

    async deletePlanCatalogEntry(
      clinicId: string,
      actorUserId: string,
      id: string,
    ) {
      const index = repositoryContext.planCatalog.findIndex(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      const entry = repositoryContext.planCatalog[index];
      if (!entry) return false;
      repositoryContext.planCatalog.splice(index, 1);
      if (clinicId === CLINIC_ID)
        repositoryContext.addAdminAudit(
          actorUserId,
          "plan_catalog.deleted",
          "plan_catalog",
          id,
          { name: entry.name },
          clinicId,
        );
      return true;
    },

    async listPatientPlans(clinicId: string, patientId?: string) {
      const currentDate = clinicDateOf(
        new Date(),
        repositoryContext.clinicSettings.timezone,
      );
      for (const plan of repositoryContext.patientPlans) {
        if (
          plan.clinicId === clinicId &&
          plan.status === "active" &&
          plan.validUntil &&
          plan.validUntil < currentDate
        ) {
          plan.status = "expired";
        }
      }
      return repositoryContext.patientPlans
        .filter(
          (plan) =>
            plan.clinicId === clinicId &&
            // Planos do cliente valem em todas as filiais (cadastro único).
            (patientId
              ? plan.patientId === patientId
              : repositoryContext.inBranchScope(plan)),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((plan) => {
          const paymentSummary = planPaymentSummary(
            repositoryContext.receivables
              .filter(
                (item) => item.clinicId === clinicId && item.planId === plan.id,
              )
              .map((item) => ({
                ...item,
                overdue: item.status === "open" && item.dueDate < currentDate,
              })),
          );
          return paymentSummary ? { ...plan, paymentSummary } : plan;
        });
    },

    async createPatientPlan(
      clinicId: string,
      _actorUserId: string,
      input: PatientPlanInput,
    ) {
      const template = repositoryContext.planTemplates.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.planTemplateId &&
          item.active,
      );
      if (!template)
        throw new DomainError(
          "PLAN_TEMPLATE_NOT_FOUND",
          "Selecione um plano ativo cadastrado nesta clínica.",
          404,
        );
      validatePlanComposition(
        input.services,
        input.totalValueInCents,
        template.services.map((item) => item.serviceId),
      );
      const patient = repositoryContext.patients.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.patientId &&
          item.status === "active",
      );
      if (
        !patient ||
        input.services.some(
          (entry) =>
            !repositoryContext.services.some(
              (item) =>
                item.clinicId === clinicId &&
                item.id === entry.serviceId &&
                item.active,
            ),
        )
      ) {
        throw new DomainError(
          "PLAN_CONTEXT_NOT_FOUND",
          "Cliente ou serviço não encontrado.",
          404,
        );
      }
      return repositoryContext.insertPatientPlan(
        clinicId,
        patient,
        { ...input, name: template.name },
        "Crédito inicial do plano",
      );
    },

    async renewPatientPlan(
      clinicId: string,
      _actorUserId: string,
      planId: string,
      input: PlanRenewalInput,
    ) {
      const current = repositoryContext.patientPlans.find(
        (item) => item.clinicId === clinicId && item.id === planId,
      );
      if (!current) return null;
      repositoryContext.assertRenewable(current);
      const patient = repositoryContext.patients.find(
        (item) => item.id === current.patientId,
      );
      if (
        patient?.status !== "active" ||
        input.services.some(
          (entry) =>
            !repositoryContext.services.some(
              (item) =>
                item.id === entry.serviceId &&
                item.clinicId === clinicId &&
                item.active,
            ),
        )
      ) {
        throw new DomainError(
          "PLAN_CONTEXT_NOT_FOUND",
          "Cliente ou serviço não encontrado.",
          404,
        );
      }
      return repositoryContext.insertPatientPlan(
        clinicId,
        patient,
        {
          ...input,
          patientId: current.patientId,
          kind: current.kind,
          planTemplateId: current.planTemplateId,
        },
        "Crédito da renovação do plano",
        current,
      );
    },

    async updatePatientPlanAutoRenew(
      clinicId: string,
      _actorUserId: string,
      planId: string,
      autoRenew: boolean,
    ) {
      const plan = repositoryContext.patientPlans.find(
        (item) => item.clinicId === clinicId && item.id === planId,
      );
      if (!plan) return null;
      if (plan.sourceTabId)
        throw new DomainError(
          "TAB_PLAN_MANAGED",
          "O serviço avulso deve ser administrado pela comanda de origem.",
          409,
        );
      if (autoRenew) {
        repositoryContext.assertRenewable(plan);
        if (plan.status === "expired") {
          throw new DomainError(
            "PLAN_EXPIRED",
            "Um plano vencido deve ser renovado manualmente.",
            409,
          );
        }
        if (!plan.validUntil) {
          throw new DomainError(
            "PLAN_WITHOUT_END",
            "A renovação automática exige o fim da validade.",
            409,
          );
        }
      }
      if (plan.autoRenew !== autoRenew) {
        plan.autoRenew = autoRenew;
        plan.updatedAt = now();
      }
      return plan;
    },

    async renewDuePatientPlans(clinicId: string) {
      const currentDate = today();
      let renewed = 0;
      const due = (plan: PatientPlan) =>
        plan.clinicId === clinicId &&
        plan.autoRenew &&
        !plan.renewedByPlanId &&
        (plan.status === "active" || plan.status === "expired") &&
        Boolean(plan.validUntil) &&
        plan.validUntil! < currentDate;
      // Um sucessor ainda vencido entra na fila de novo, recuperando períodos perdidos.
      for (
        let plan = repositoryContext.patientPlans.find(due);
        plan;
        plan = repositoryContext.patientPlans.find(due)
      ) {
        const patient = repositoryContext.patients.find(
          (item) => item.id === plan!.patientId,
        );
        const period = nextPlanPeriod(plan);
        if (
          patient?.status !== "active" ||
          !period ||
          plan.services.some(
            (entry) =>
              !repositoryContext.services.some(
                (item) =>
                  item.id === entry.serviceId &&
                  item.clinicId === clinicId &&
                  item.active,
              ),
          )
        ) {
          plan.autoRenew = false;
          plan.updatedAt = now();
          continue;
        }
        repositoryContext.insertPatientPlan(
          clinicId,
          patient,
          {
            patientId: plan.patientId,
            name: plan.name,
            ...(plan.planTemplateId
              ? { planTemplateId: plan.planTemplateId }
              : {}),
            kind: plan.kind,
            services: plan.services.map(
              ({ serviceId, totalSessions, totalValueInCents }) => ({
                serviceId,
                totalSessions,
                totalValueInCents,
              }),
            ),
            totalValueInCents: plan.totalValueInCents,
            installments: plan.installments,
            // A renovação segue as formas de pagamento combinadas.
            ...(plan.paymentMethod
              ? { paymentMethod: plan.paymentMethod }
              : {}),
            ...(plan.paymentParts ? { paymentParts: plan.paymentParts } : {}),
            autoRenew: true,
            ...period,
          },
          "Crédito da renovação automática",
          plan,
        );
        renewed += 1;
      }
      return renewed;
    },

    async updatePatientPlanStatus(
      clinicId: string,
      _actorUserId: string,
      planId: string,
      status: PlanStatus,
      pause: PlanPauseDetails = {},
      cancellation: PlanCancellationDetails = {},
    ) {
      const plan = repositoryContext.patientPlans.find(
        (item) => item.clinicId === clinicId && item.id === planId,
      );
      if (!plan) return null;
      if (plan.sourceTabId)
        throw new DomainError(
          "TAB_PLAN_MANAGED",
          "O serviço avulso deve ser administrado pela comanda de origem.",
          409,
        );
      if (plan.status === "cancelled" && status !== "cancelled") {
        throw new DomainError(
          "PLAN_CANCELLED",
          "Um plano cancelado não pode ser reativado.",
          409,
        );
      }
      if (plan.status === status) return plan;
      if (status === "cancelled")
        assertRefundWithinPlan(plan, cancellation.refundedInCents);
      const previous = plan.status;
      plan.status = status;
      plan.updatedAt = now();
      const timezone = repositoryContext.clinicSettings.timezone;
      if (status === "paused") {
        plan.pausedAt = plan.updatedAt;
        if (pause.reason) plan.pauseReason = pause.reason;
        else delete plan.pauseReason;
        if (pause.expectedReturn)
          plan.pauseExpectedReturn = pause.expectedReturn;
        else delete plan.pauseExpectedReturn;
      } else if (previous === "paused") {
        // Reativado: a validade avança os dias em pausa (U29).
        if (status === "active" && plan.pausedAt) {
          const validUntil = validityAfterPause(
            plan.validUntil,
            clinicDateOf(new Date(plan.pausedAt), timezone),
            clinicDateOf(new Date(plan.updatedAt), timezone),
          );
          if (validUntil) plan.validUntil = validUntil;
        }
        delete plan.pausedAt;
        delete plan.pauseReason;
        delete plan.pauseExpectedReturn;
      }
      if (status === "cancelled") {
        plan.cancelledAt = plan.updatedAt;
        plan.cancelledValueInCents = repositoryContext.receivables
          .filter((item) => item.planId === plan.id && item.status === "open")
          .reduce((sum, item) => sum + item.amountInCents, 0);
        if (cancellation.refundedInCents) {
          plan.refundedInCents = cancellation.refundedInCents;
          plan.refundPaymentMethod = cancellation.refundPaymentMethod!;
          if (cancellation.refundNote)
            plan.refundNote = cancellation.refundNote;
          plan.refundPayableId = recordRefundPayable(
            plan,
            cancellation.refundedInCents,
            cancellation.refundPaymentMethod!,
            cancellation.refundNote,
          );
        }
        for (const receivable of repositoryContext.receivables) {
          if (receivable.planId === plan.id && receivable.status === "open") {
            receivable.status = "cancelled";
            receivable.overdue = false;
            receivable.updatedAt = plan.updatedAt;
          }
        }
      }
      return plan;
    },

    async listSessionMovements(clinicId: string, planId: string) {
      const belongs = repositoryContext.patientPlans.some(
        (plan) => plan.clinicId === clinicId && plan.id === planId,
      );
      return belongs
        ? repositoryContext.sessionMovements
            .filter((movement) => movement.planId === planId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [];
    },
  };
}
