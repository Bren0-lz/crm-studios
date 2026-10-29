import {
  commissionAccountBalances,
  type CommissionExpectation,
  type CommissionReconciliationInput,
  type CommissionAdjustment,
  type CommissionAccountPayment,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import {
  commissionReconciliationDigest,
  commissionReconciliationChanges,
} from "../../modules/finance/commission-reconciliation.js";
import {
  selectCommissionRule,
  commissionAmount,
} from "../../modules/finance/commission-calculation.js";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";
export function createCommissionReconciliationRepository(
  context: MemoryRepositoryContext,
) {
  const original = (clinicId: string, id: string) => {
    const item = context.commissions.find(
      (item) => item.clinicId === clinicId && item.id === id,
    );
    if (!item)
      throw new DomainError(
        "COMMISSION_NOT_FOUND",
        "Comissão não encontrada.",
        404,
      );
    return item;
  };
  const actor = (clinicId: string, id: string) => {
    if (
      !context.users.some(
        (user) => user.clinicId === clinicId && user.id === id,
      )
    )
      throw new DomainError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
  };
  const expected = (
    clinicId: string,
    id: string,
  ): CommissionExpectation | null => {
    const item = original(clinicId, id),
      appointment = item.appointmentId
        ? context.appointments.find(
            (entry) =>
              entry.clinicId === clinicId &&
              entry.id === item.appointmentId &&
              entry.patientId &&
              entry.status === "completed",
          )
        : undefined;
    const attendance = item.groupAttendanceId
      ? context.groupAttendance.find(
          (entry) =>
            entry.clinicId === clinicId &&
            entry.id === item.groupAttendanceId &&
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
    const source =
      appointment ??
      (meeting && group
        ? {
            professionalId: meeting.professionalId,
            serviceId: group.serviceId,
            startsAt: meeting.startsAt,
          }
        : undefined);
    if (!source) return null;
    const professional = context.professionals.find(
        (entry) =>
          entry.clinicId === clinicId && entry.id === source.professionalId,
      ),
      service = context.services.find(
        (entry) => entry.clinicId === clinicId && entry.id === source.serviceId,
      );
    if (!professional || !service) return null;
    const date = clinicDateOf(
        new Date(source.startsAt),
        context.clinicSettings.timezone,
      ),
      rule = selectCommissionRule(
        [...context.commissionRules, ...context.userCommissionRules].filter(
          (entry) => entry.clinicId === clinicId,
        ),
        professional.id,
        context.professionalUsers.get(professional.id),
        service.id,
        date,
      );
    if (!rule) return null;
    const { id: ruleId, active, userId, professionalId, ...terms } = rule;
    void active;
    void userId;
    void professionalId;
    return {
      professionalId: professional.id,
      professionalName: professional.fullName,
      competence: date.slice(0, 7),
      amountInCents: commissionAmount(rule, service.priceInCents),
      baseAmountInCents: service.priceInCents,
      serviceId: service.id,
      ruleId,
      ruleSnapshot: {
        percentage: terms.percentage,
        effectiveFrom: terms.effectiveFrom,
        ...(terms.kind ? { kind: terms.kind } : {}),
        ...(terms.fixedAmountInCents !== undefined
          ? { fixedAmountInCents: terms.fixedAmountInCents }
          : {}),
        ...(terms.serviceId ? { serviceId: terms.serviceId } : {}),
        ...(terms.effectiveUntil
          ? { effectiveUntil: terms.effectiveUntil }
          : {}),
      },
    };
  };
  const adjustments = (clinicId: string, id: string) =>
    context.commissionAdjustments.filter(
      (entry) => entry.clinicId === clinicId && entry.commissionId === id,
    );
  const expense = (clinicId: string, id: string) =>
    context.payables.some(
      (entry) =>
        entry.clinicId === clinicId &&
        entry.commissionId === id &&
        entry.status !== "cancelled",
    );
  const preview = (clinicId: string, id: string) => {
    const commission = original(clinicId, id),
      target = expected(clinicId, id),
      entries = adjustments(clinicId, id);
    return structuredClone({
      reconciliations: context.commissionReconciliations.filter(
        (entry) => entry.clinicId === clinicId && entry.commissionId === id,
      ),
      digest: commissionReconciliationDigest(commission, target, entries),
      commission,
      expected: target,
      adjustments: entries,
      payments: context.commissionAccountPayments.filter(
        (entry) => entry.clinicId === clinicId && entry.commissionId === id,
      ),
      changes: commissionReconciliationChanges(commission, target, entries),
      originalManagedByExpense: expense(clinicId, id),
    });
  };
  return {
    async getCommissionReconciliationPreview(clinicId: string, id: string) {
      return preview(clinicId, id);
    },
    async reconcileCommission(
      clinicId: string,
      actorId: string,
      id: string,
      input: CommissionReconciliationInput,
    ) {
      actor(clinicId, actorId);
      const existing = context.commissionReconciliations.find(
        (entry) =>
          entry.clinicId === clinicId &&
          entry.idempotencyKey === input.idempotencyKey,
      );
      if (existing) {
        if (
          existing.commissionId !== id ||
          existing.reason !== input.reason ||
          existing.expectedDigest !== input.expectedDigest
        )
          throw new DomainError(
            "COMMISSION_RECONCILIATION_KEY",
            "A referência de repetição já foi usada para outra conciliação.",
            409,
          );
        return structuredClone(existing);
      }
      const comparison = preview(clinicId, id);
      if (comparison.digest !== input.expectedDigest)
        throw new DomainError(
          "COMMISSION_RECONCILIATION_STALE",
          "A origem ou os lançamentos mudaram. Atualize a prévia antes de confirmar.",
          409,
        );
      if (!comparison.changes.length)
        throw new DomainError(
          "COMMISSION_RECONCILIATION_CURRENT",
          "A comissão já está conciliada com sua origem.",
          409,
        );
      if (
        comparison.changes.some(
          (entry) =>
            !Number.isSafeInteger(entry.amountInCents) ||
            Math.abs(entry.amountInCents) > 2147483647,
        )
      )
        throw new DomainError(
          "COMMISSION_AMOUNT_LIMIT",
          "O ajuste excede o limite financeiro permitido.",
          409,
        );
      const reconciliationId = uuid(),
        timestamp = now(),
        entries: CommissionAdjustment[] = comparison.changes.map((change) => ({
          ...change,
          id: uuid(),
          clinicId,
          commissionId: id,
          reconciliationId,
          reason: input.reason,
          actorId,
          createdAt: timestamp,
          status: "open",
        }));
      const record = {
        actorName: context.users.find(
          (user) => user.clinicId === clinicId && user.id === actorId,
        )!.fullName,
        expectedDigest: input.expectedDigest,
        id: reconciliationId,
        clinicId,
        commissionId: id,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        actorId,
        createdAt: timestamp,
        expected: comparison.expected,
        adjustments: entries,
      };
      context.commissionAdjustments.push(...entries);
      context.commissionReconciliations.push(record);
      context.recordAudit(
        clinicId,
        actorId,
        "commission.reconciled",
        "commission",
        { reason: input.reason, reconciliationId, changes: comparison.changes },
        id,
      );
      return structuredClone(record);
    },
    async settleCommissionAccount(
      clinicId: string,
      actorId: string,
      id: string,
      professionalId: string,
      expectedAmountInCents: number,
    ) {
      actor(clinicId, actorId);
      const commission = original(clinicId, id),
        balance = commissionAccountBalances(
          commission,
          adjustments(clinicId, id),
          expense(clinicId, id),
        ).find((entry) => entry.professionalId === professionalId);
      if (!adjustments(clinicId, id).length)
        throw new DomainError(
          "COMMISSION_RECONCILIATION_REQUIRED",
          "Concilie esta comissão antes de usar a baixa por saldo líquido.",
          409,
        );
      if (!balance)
        throw new DomainError(
          "COMMISSION_ACCOUNT_SETTLED",
          "Não há saldo aberto para este profissional.",
          409,
        );
      if (balance.amountInCents !== expectedAmountInCents)
        throw new DomainError(
          "COMMISSION_ACCOUNT_STALE",
          "O saldo mudou. Atualize a conta antes de registrar a baixa.",
          409,
        );
      if (
        !Number.isSafeInteger(balance.amountInCents) ||
        Math.abs(balance.amountInCents) > 2147483647
      )
        throw new DomainError(
          "COMMISSION_AMOUNT_LIMIT",
          "O pagamento excede o limite financeiro permitido.",
          409,
        );
      const timestamp = now(),
        payment: CommissionAccountPayment = {
          ...balance,
          id: uuid(),
          clinicId,
          commissionId: id,
          actorId,
          occurredAt: timestamp,
        };
      if (balance.originalIncluded) {
        commission.status = "paid";
        commission.paidAt = timestamp;
      }
      for (const entry of adjustments(clinicId, id))
        if (balance.adjustmentIds.includes(entry.id)) {
          entry.status = "paid";
          entry.paidAt = timestamp;
        }
      context.commissionAccountPayments.push(payment);
      context.commissionPaymentEvents.push({
        id: uuid(),
        clinicId,
        commissionId: id,
        kind: "payment",
        amountInCents: balance.amountInCents,
        professionalName: balance.professionalName,
        occurredAt: timestamp,
      });
      context.recordAudit(
        clinicId,
        actorId,
        "commission.account_paid",
        "commission",
        {
          paymentId: payment.id,
          professionalId,
          amountInCents: balance.amountInCents,
        },
        id,
      );
      return structuredClone(payment);
    },
    async reverseCommissionAccountPayment(
      clinicId: string,
      actorId: string,
      paymentId: string,
    ) {
      actor(clinicId, actorId);
      const payment = context.commissionAccountPayments.find(
        (entry) => entry.clinicId === clinicId && entry.id === paymentId,
      );
      if (!payment)
        throw new DomainError(
          "COMMISSION_ACCOUNT_PAYMENT_NOT_FOUND",
          "Pagamento conciliado não encontrado.",
          404,
        );
      if (payment.reversedAt)
        throw new DomainError(
          "COMMISSION_ACCOUNT_PAYMENT_REVERSED",
          "O pagamento conciliado já foi estornado.",
          409,
        );
      const commission = original(clinicId, payment.commissionId),
        entries = adjustments(clinicId, commission.id).filter((entry) =>
          payment.adjustmentIds.includes(entry.id),
        );
      if (
        (payment.originalIncluded &&
          (commission.status !== "paid" ||
            commission.paidAt !== payment.occurredAt)) ||
        entries.some(
          (entry) =>
            entry.status !== "paid" || entry.paidAt !== payment.occurredAt,
        )
      )
        throw new DomainError(
          "COMMISSION_ACCOUNT_PAYMENT_CHANGED",
          "Os lançamentos do pagamento precisam ser revisados antes do estorno.",
          409,
        );
      if (payment.originalIncluded) {
        commission.status = "open";
        delete commission.paidAt;
      }
      for (const entry of entries) {
        entry.status = "open";
        delete entry.paidAt;
      }
      payment.reversedAt = now();
      context.markPaymentProofsReversed(
        clinicId,
        "commission_account_payment",
        paymentId,
      );
      context.commissionPaymentEvents.push({
        id: uuid(),
        clinicId,
        commissionId: commission.id,
        professionalName: payment.professionalName,
        kind: "reversal",
        amountInCents: -payment.amountInCents,
        occurredAt: payment.reversedAt,
      });
      context.recordAudit(
        clinicId,
        actorId,
        "commission.account_reversed",
        "commission",
        { paymentId, amountInCents: payment.amountInCents },
        commission.id,
      );
      return structuredClone(payment);
    },
  };
}
