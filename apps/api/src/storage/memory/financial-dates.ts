import type { FinancialDatesInput } from "@crm/contracts";
import type { MemoryRepositoryContext } from "./context.js";
import { DomainError } from "../../repository.js";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import { uuid, now } from "./helpers.js";
import { latestPaymentBatch } from "../../modules/finance/payment-parts.js";
export function createFinancialDatesRepository(
  context: MemoryRepositoryContext,
) {
  return {
    async setFinancialDates(
      clinicId: string,
      actorUserId: string,
      kind: "receivable" | "payable",
      id: string,
      input: FinancialDatesInput,
    ) {
      const entry =
        kind === "receivable"
          ? context.receivables.find(
              (item) => item.clinicId === clinicId && item.id === id,
            )
          : context.payables.find(
              (item) => item.clinicId === clinicId && item.id === id,
            );
      if (!entry)
        throw new DomainError(
          "FINANCE_ENTRY_NOT_FOUND",
          "Lançamento não encontrado.",
          404,
        );
      if (input.paidAt && entry.status !== "paid")
        throw new DomainError(
          "FINANCIAL_PAYMENT_REQUIRED",
          "A data de pagamento exige um lançamento pago.",
          409,
        );
      // Pagamento picado: um evento por forma; a correção vale para todos da última baixa.
      const batch: Array<{
        id: string;
        occurredAt: string;
        availableAt?: string | undefined;
      }> =
        kind === "receivable"
          ? latestPaymentBatch(
              context.receiptEvents.filter((item) => item.receivableId === id),
            )
          : latestPaymentBatch(
              context.payablePaymentEvents.filter(
                (item) => item.clinicId === clinicId && item.payableId === id,
              ),
            );
      const event = batch.at(-1);
      if (
        entry.status === "paid" &&
        (input.paidAt || input.availableAt) &&
        !event
      )
        throw new DomainError(
          "FINANCIAL_EVENT_NOT_FOUND",
          "O evento de pagamento precisa ser conciliado antes da alteração.",
          409,
        );
      const previous = {
        postedOn: entry.postedOn,
        dueDate: entry.dueDate,
        paidAt: entry.paidAt,
        availableAt: entry.cashAvailableAt,
      };
      if (input.postedOn) entry.postedOn = input.postedOn;
      if (input.dueDate) entry.dueDate = input.dueDate;
      if (input.paidAt) {
        entry.paidAt = input.paidAt;
        if ("commissionId" in entry && entry.commissionId) {
          const commission = context.commissions.find(
            (item) =>
              item.clinicId === clinicId && item.id === entry.commissionId,
          );
          if (commission) commission.paidAt = input.paidAt;
        }
      }
      if (input.availableAt) entry.cashAvailableAt = input.availableAt;
      if (
        entry.status === "paid" &&
        event &&
        (input.paidAt || input.availableAt)
      )
        for (const event of batch) {
          const correction = context.financialDateCorrections
            .filter(
              (item) =>
                item.clinicId === clinicId &&
                item.kind === kind &&
                item.eventId === event.id,
            )
            .at(-1);
          context.financialDateCorrections.push({
            id: uuid(),
            clinicId,
            kind,
            eventId: event.id,
            occurredAt:
              input.paidAt ?? correction?.occurredAt ?? event.occurredAt,
            availableAt:
              input.availableAt ??
              correction?.availableAt ??
              event.availableAt ??
              input.paidAt ??
              event.occurredAt,
            reason: input.reason,
            actorId: actorUserId,
            createdAt: now(),
          });
        }
      entry.overdue =
        entry.status === "open" &&
        entry.dueDate <
          clinicDateOf(new Date(), context.clinicSettings.timezone);
      entry.updatedAt = now();
      context.recordAudit(
        clinicId,
        actorUserId,
        "finance.dates_updated",
        kind,
        { previous, ...input },
        id,
      );
      return structuredClone(entry);
    },
  };
}
