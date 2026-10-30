import type {
  AdminUserCommissionInput,
  CommissionAdjustment,
  CommissionRecalculationPreview,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { CommissionTerms } from "../../modules/finance/commission-calculation.js";
import {
  assertCommissionRecalculationDigest,
  commissionRecalculationAudit,
  commissionRecalculationRange,
  commissionRecalculationReason,
  planCommissionRecalculation,
  sameCommissionRuleSlot,
  withDraftCommissionRules,
  type CommissionRecalculationSource,
  type CommissionRuleOwner,
} from "../../modules/finance/commission-recalculation.js";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

/**
 * Recálculo retroativo de comissões (memória): prévia antes de gravar regras e aplicação
 * depois de gravá-las. Abertas mudam de valor; pagas ganham ajuste para o próximo pagamento.
 */
export function createMemoryCommissionRecalculation(
  context: MemoryRepositoryContext,
) {
  const rules = (clinicId: string): CommissionTerms[] => [
    ...context.commissionRules.filter((item) => item.clinicId === clinicId),
    ...context.userCommissionRules.filter((item) => item.clinicId === clinicId),
  ];
  const today = () => clinicDateOf(new Date(), context.clinicSettings.timezone);
  const sources = (clinicId: string): CommissionRecalculationSource[] =>
    context.commissions
      .filter((item) => item.clinicId === clinicId)
      .flatMap((commission) => {
        const appointment = commission.appointmentId
          ? context.appointments.find(
              (entry) =>
                entry.clinicId === clinicId &&
                entry.id === commission.appointmentId &&
                entry.status === "completed",
            )
          : undefined;
        const attendance = commission.groupAttendanceId
          ? context.groupAttendance.find(
              (entry) =>
                entry.clinicId === clinicId &&
                entry.id === commission.groupAttendanceId &&
                (entry.status === "present" || entry.outcome === "present"),
            )
          : undefined;
        const meeting = attendance
          ? context.groupSessions.find(
              (entry) =>
                entry.clinicId === clinicId &&
                entry.id === attendance.sessionId &&
                entry.status !== "cancelled",
            )
          : undefined;
        const group = meeting
          ? context.groupClasses.find(
              (entry) =>
                entry.clinicId === clinicId && entry.id === meeting.groupId,
            )
          : undefined;
        const origin =
          appointment ??
          (meeting && group
            ? { startsAt: meeting.startsAt, serviceId: group.serviceId }
            : undefined);
        if (!origin) return [];
        const adjustments = context.commissionAdjustments.filter(
          (entry) =>
            entry.clinicId === clinicId && entry.commissionId === commission.id,
        );
        const userId = context.professionalUsers.get(commission.professionalId);
        return [
          {
            commission,
            date: clinicDateOf(
              new Date(origin.startsAt),
              context.clinicSettings.timezone,
            ),
            serviceId: origin.serviceId,
            ...(userId ? { userId } : {}),
            adjustmentsInCents: adjustments
              .filter(
                (entry) => entry.professionalId === commission.professionalId,
              )
              .reduce((total, entry) => total + entry.amountInCents, 0),
            hasAdjustments: adjustments.length > 0,
            // Despesa própria da comissão ou despesa da folha que a inclui.
            managedByExpense:
              Boolean(commission.payrollPayableId) ||
              context.payables.some(
                (entry) =>
                  entry.clinicId === clinicId &&
                  entry.commissionId === commission.id &&
                  entry.status !== "cancelled",
              ),
          },
        ];
      });
  const assertOwner = (clinicId: string, owner: CommissionRuleOwner) => {
    if (
      "userId" in owner
        ? !context.users.some(
            (item) => item.clinicId === clinicId && item.id === owner.userId,
          )
        : !context.professionals.some(
            (item) =>
              item.clinicId === clinicId && item.id === owner.professionalId,
          )
    )
      throw "userId" in owner
        ? new DomainError("USER_NOT_FOUND", "Usuário não encontrado.", 404)
        : new DomainError(
            "PROFESSIONAL_NOT_FOUND",
            "Profissional não encontrado.",
            404,
          );
  };
  /** Prévia com as regras como ficariam depois de gravar `drafts`. */
  const preview = (
    clinicId: string,
    owner: CommissionRuleOwner,
    drafts: AdminUserCommissionInput[],
  ): CommissionRecalculationPreview => {
    assertOwner(clinicId, owner);
    const draft = withDraftCommissionRules(rules(clinicId), owner, drafts);
    return planCommissionRecalculation(
      draft.rules,
      draft.changed,
      sources(clinicId),
      commissionRecalculationRange(drafts, today()),
    );
  };
  /** Confere a prévia confirmada antes de gravar (a memória não tem transação). */
  const check = (
    clinicId: string,
    owner: CommissionRuleOwner,
    drafts: AdminUserCommissionInput[],
    expectedDigest: string | undefined,
  ) => {
    if (drafts.length)
      assertCommissionRecalculationDigest(
        preview(clinicId, owner, drafts),
        expectedDigest,
      );
  };
  /** Depois de gravar as regras: aplica o recálculo e registra a auditoria. */
  const apply = (
    clinicId: string,
    actorId: string,
    owner: CommissionRuleOwner,
    drafts: AdminUserCommissionInput[],
  ) => {
    if (!drafts.length) return;
    const current = rules(clinicId),
      changed = new Set(
        current
          .filter((rule) =>
            drafts.some((terms) => sameCommissionRuleSlot(rule, owner, terms)),
          )
          .map((rule) => rule.id),
      ),
      plan = planCommissionRecalculation(
        current,
        changed,
        sources(clinicId),
        commissionRecalculationRange(drafts, today()),
      );
    if (!plan.items.length) return;
    const reason = commissionRecalculationReason(plan.from),
      timestamp = now(),
      actorName =
        context.users.find(
          (user) => user.clinicId === clinicId && user.id === actorId,
        )?.fullName ?? "";
    for (const item of plan.items) {
      const commission = context.commissions.find(
        (entry) =>
          entry.clinicId === clinicId && entry.id === item.commissionId,
      )!;
      const rule = current.find(
        (entry) =>
          changed.has(entry.id) &&
          entry.effectiveFrom === item.ruleSnapshot.effectiveFrom &&
          (entry.serviceId ?? "") === (item.ruleSnapshot.serviceId ?? ""),
      );
      if (item.mode === "update") {
        commission.amountInCents = item.amountInCents;
        commission.percentage = item.ruleSnapshot.percentage;
        commission.ruleSnapshot = item.ruleSnapshot;
        if (rule) {
          commission.ruleId = rule.id;
          context.commissionEntryRuleIds.add(rule.id);
        }
        continue;
      }
      const reconciliationId = uuid(),
        adjustment: CommissionAdjustment = {
          id: uuid(),
          clinicId,
          commissionId: commission.id,
          reconciliationId,
          professionalId: commission.professionalId,
          professionalName: commission.professionalName,
          competence: commission.competence,
          amountInCents: item.differenceInCents,
          reason,
          actorId,
          createdAt: timestamp,
          status: "open",
        };
      context.commissionAdjustments.push(adjustment);
      context.commissionReconciliations.push({
        actorName,
        expectedDigest: plan.digest,
        id: reconciliationId,
        clinicId,
        commissionId: commission.id,
        idempotencyKey: uuid(),
        reason,
        actorId,
        createdAt: timestamp,
        expected: {
          professionalId: commission.professionalId,
          professionalName: commission.professionalName,
          competence: commission.competence,
          amountInCents: item.amountInCents,
          baseAmountInCents: commission.baseAmountInCents,
          serviceId: commission.serviceId ?? "",
          ruleId: rule?.id ?? "",
          ruleSnapshot: item.ruleSnapshot,
        },
        adjustments: [adjustment],
      });
    }
    context.recordAudit(
      clinicId,
      actorId,
      "commission.recalculated",
      "commission_rule",
      commissionRecalculationAudit(plan, [...changed]),
      [...changed][0],
    );
  };
  return {
    preview,
    check,
    apply,
    /** Confere a prévia, grava as regras com `save` e aplica o recálculo. */
    saveAndApply<T>(
      clinicId: string,
      actorId: string,
      owner: CommissionRuleOwner,
      drafts: AdminUserCommissionInput[],
      expectedDigest: string | undefined,
      save: () => T,
    ): T {
      check(clinicId, owner, drafts, expectedDigest);
      const result = save();
      apply(clinicId, actorId, owner, drafts);
      return result;
    },
  };
}
