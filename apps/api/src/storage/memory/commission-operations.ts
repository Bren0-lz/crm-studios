import type {
  CommissionRule,
  CommissionRuleInput,
  AdminUserCommissionInput,
  CommissionRecalculationPreviewInput,
} from "@crm/contracts";
import { sessionValueInCents, singlePlanSessionPrices } from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import {
  selectCommissionRule,
  commissionAmount,
} from "../../modules/finance/commission-calculation.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";
import { createMemoryCommissionRecalculation } from "./commission-recalculation.js";
import type { CommissionRecalculationRequest } from "../../repository.js";
/**
 * Base da comissão percentual (serviço não tem preço): o valor por sessão do serviço no
 * plano consumido pelo atendimento/presença; sem consumo de plano, o valor por sessão do
 * plano avulso do serviço; sem nenhum, 0.
 */
export function commissionBaseInCents(
  context: MemoryRepositoryContext,
  clinicId: string,
  source: {
    appointmentId?: string | undefined;
    groupAttendanceId?: string | undefined;
    serviceId: string;
  },
): number {
  const movement = context.sessionMovements.find(
    (item) =>
      item.kind === "consumption" &&
      ((source.appointmentId && item.appointmentId === source.appointmentId) ||
        (source.groupAttendanceId &&
          item.groupAttendanceId === source.groupAttendanceId)),
  );
  const plan = movement
    ? context.patientPlans.find(
        (item) => item.clinicId === clinicId && item.id === movement.planId,
      )
    : undefined;
  const serviceId = movement?.serviceId ?? source.serviceId;
  return sessionValueInCents(
    plan?.services.find((item) => item.serviceId === serviceId),
    singlePlanSessionPrices(
      context.planTemplates.filter((item) => item.clinicId === clinicId),
    ).get(source.serviceId) ?? 0,
  );
}

/**
 * Sessões concluídas da competência ainda sem comissão, com a regra e o serviço que a
 * geração usaria (mesma seleção de `generateCommissions`).
 */
export function commissionCandidates(
  context: MemoryRepositoryContext,
  clinicId: string,
  competence: string,
) {
  const individual = context.appointments
    .filter(
      (item) =>
        item.clinicId === clinicId &&
        item.patientId &&
        item.status === "completed",
    )
    .map((item) => ({
      appointmentId: item.id,
      professionalId: item.professionalId,
      professionalName: item.professionalName,
      serviceId: item.serviceId,
      startsAt: item.startsAt,
    }));
  const collective = context.groupAttendance
    .filter(
      (item) =>
        item.clinicId === clinicId &&
        (item.status === "present" || item.outcome === "present"),
    )
    .flatMap((item) => {
      const meeting = context.groupSessions.find(
          (entry) =>
            entry.clinicId === clinicId &&
            entry.id === item.sessionId &&
            entry.status !== "cancelled",
        ),
        group = context.groupClasses.find(
          (entry) =>
            entry.clinicId === clinicId && entry.id === meeting?.groupId,
        );
      return meeting && group
        ? [
            {
              groupAttendanceId: item.id,
              professionalId: meeting.professionalId,
              professionalName: meeting.professionalName,
              serviceId: group.serviceId,
              startsAt: meeting.startsAt,
            },
          ]
        : [];
    });
  const candidates = [];
  for (const source of [...individual, ...collective]) {
    const date = clinicDateOf(
      new Date(source.startsAt),
      context.clinicSettings.timezone,
    );
    if (
      date.slice(0, 7) !== competence ||
      context.commissions.some(
        (item) =>
          item.clinicId === clinicId &&
          ("appointmentId" in source
            ? item.appointmentId === source.appointmentId
            : item.groupAttendanceId === source.groupAttendanceId),
      )
    )
      continue;
    const userId = context.professionalUsers.get(source.professionalId),
      rule = selectCommissionRule(
        [
          ...context.commissionRules.filter(
            (item) => item.clinicId === clinicId,
          ),
          ...context.userCommissionRules.filter(
            (item) => item.clinicId === clinicId,
          ),
        ],
        source.professionalId,
        userId,
        source.serviceId,
        date,
      ),
      service = context.services.find(
        (item) => item.clinicId === clinicId && item.id === source.serviceId,
      );
    if (!rule || !service) continue;
    candidates.push({
      source,
      rule,
      service,
      baseAmountInCents: commissionBaseInCents(context, clinicId, source),
    });
  }
  return candidates;
}
export function createCommissionOperationsRepository(
  context: MemoryRepositoryContext,
) {
  const recalculation = createMemoryCommissionRecalculation(context);
  const insertRule = (clinicId: string, input: CommissionRuleInput) => {
    const professional = context.professionals.find(
      (item) => item.clinicId === clinicId && item.id === input.professionalId,
    );
    if (!professional)
      throw new DomainError(
        "PROFESSIONAL_NOT_FOUND",
        "Profissional não encontrado.",
        404,
      );
    if (
      input.serviceId &&
      !context.services.some(
        (item) => item.clinicId === clinicId && item.id === input.serviceId,
      )
    )
      throw new DomainError(
        "SERVICE_NOT_FOUND",
        "Serviço não encontrado.",
        404,
      );
    if (
      context.commissionRules.some(
        (item) =>
          item.clinicId === clinicId &&
          item.professionalId === input.professionalId &&
          item.serviceId === input.serviceId &&
          item.effectiveFrom === input.effectiveFrom,
      )
    )
      throw new DomainError(
        "COMMISSION_RULE_DUPLICATE",
        "Já existe uma regra nesta vigência para este serviço.",
        409,
      );
    const rule: CommissionRule = {
      ...input,
      id: uuid(),
      clinicId,
      professionalName: professional.fullName,
      active: true,
      createdAt: now(),
    };
    context.commissionRules.push(rule);
    return { ...rule };
  };
  return {
    async createCommissionRule(
      clinicId: string,
      input: CommissionRuleInput,
      request?: CommissionRecalculationRequest & { actorId: string },
    ) {
      if (!request) return insertRule(clinicId, input);
      const { professionalId, ...terms } = input;
      return recalculation.saveAndApply(
        clinicId,
        request.actorId,
        { professionalId },
        [terms],
        request.expectedDigest,
        () => insertRule(clinicId, input),
      );
    },
    async previewCommissionRecalculation(
      clinicId: string,
      input: CommissionRecalculationPreviewInput,
    ) {
      return recalculation.preview(
        clinicId,
        input.userId
          ? { userId: input.userId }
          : { professionalId: input.professionalId! },
        input.rules,
      );
    },
    async generateCommissions(clinicId: string, competence: string) {
      for (const {
        source,
        rule,
        service,
        baseAmountInCents,
      } of commissionCandidates(context, clinicId, competence)) {
        const snapshot: AdminUserCommissionInput = {
          percentage: rule.percentage,
          effectiveFrom: rule.effectiveFrom,
          ...(rule.kind ? { kind: rule.kind } : {}),
          ...(rule.fixedAmountInCents !== undefined
            ? { fixedAmountInCents: rule.fixedAmountInCents }
            : {}),
          ...(rule.serviceId ? { serviceId: rule.serviceId } : {}),
          ...(rule.effectiveUntil
            ? { effectiveUntil: rule.effectiveUntil }
            : {}),
        };
        context.commissionEntryRuleIds.add(rule.id);
        context.commissions.push({
          id: uuid(),
          clinicId,
          ...("appointmentId" in source
            ? {
                appointmentId: source.appointmentId,
                sourceType: "appointment" as const,
              }
            : {
                groupAttendanceId: source.groupAttendanceId,
                sourceType: "group_attendance" as const,
              }),
          professionalId: source.professionalId,
          professionalName: source.professionalName,
          serviceId: service.id,
          ruleId: rule.id,
          ruleSnapshot: snapshot,
          competence,
          baseAmountInCents,
          percentage: rule.percentage,
          amountInCents: commissionAmount(rule, baseAmountInCents),
          status: "open",
          createdAt: now(),
        });
      }
      return structuredClone(
        context.commissions.filter(
          (item) =>
            item.clinicId === clinicId && item.competence === competence,
        ),
      );
    },
  };
}
