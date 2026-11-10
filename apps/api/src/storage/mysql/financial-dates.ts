import type { FinancialDatesInput } from "@crm/contracts";
import type { MysqlRepositoryContext } from "./context.js";
import { DomainError } from "../../repository.js";
import { latestDateCorrection } from "./sql.js";
import { latestPaymentBatch } from "../../modules/finance/payment-parts.js";
export function createFinancialDatesRepository(
  context: MysqlRepositoryContext,
) {
  return {
    async setFinancialDates(
      clinicId: string,
      actorUserId: string,
      kind: "receivable" | "payable",
      id: string,
      input: FinancialDatesInput,
    ) {
      return context.inTransaction(async (client) => {
        const table = kind === "receivable" ? "receivables" : "payables",
          events =
            kind === "receivable" ? "financial_events" : "payable_events",
          eventColumn = kind === "receivable" ? "receivable_id" : "payable_id",
          correctionColumn =
            kind === "receivable" ? "receivable_event_id" : "payable_event_id";
        const result = await client.query<{
            status: string;
            postedOn: string | null;
            dueDate: string;
            paidAt: Date | null;
            availableAt: Date | null;
          }>(
            `SELECT status,posted_on AS "postedOn",due_date AS "dueDate",paid_at AS "paidAt",cash_available_at AS "availableAt" FROM ${table} WHERE clinic_id=$1 AND id=$2 FOR UPDATE`,
            [clinicId, id],
          ),
          entry = result.rows[0];
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
        if (entry.status === "paid" && (input.paidAt || input.availableAt)) {
          // Pagamento picado: um evento por forma; a correção vale para todos da última baixa.
          const history = await client.query<{
            id: string;
            kind: "payment" | "payment_reversal";
            occurredAt: Date;
            availableAt: Date;
          }>(
            `SELECT e.id,e.kind,coalesce(c.occurred_at,e.occurred_at,e.created_at) AS "occurredAt",coalesce(c.cash_available_at,e.cash_available_at,e.occurred_at,e.created_at) AS "availableAt" FROM ${events} e ${latestDateCorrection("c", "e", correctionColumn)} WHERE e.clinic_id=$1 AND e.${eventColumn}=$2 AND e.kind IN ('payment','payment_reversal') ORDER BY e.created_at,e.id`,
            [clinicId, id],
          );
          const event = { rows: latestPaymentBatch(history.rows) };
          if (!event.rows[0])
            throw new DomainError(
              "FINANCIAL_EVENT_NOT_FOUND",
              "O evento de pagamento precisa ser conciliado antes da alteração.",
              409,
            );
          for (const row of event.rows)
            await client.query(
              `INSERT INTO financial_date_corrections(clinic_id,${correctionColumn},occurred_at,cash_available_at,reason,actor_user_id) VALUES($1,$2,$3,$4,$5,$6)`,
              [
                clinicId,
                row.id,
                input.paidAt ?? row.occurredAt,
                input.availableAt ?? row.availableAt,
                input.reason,
                actorUserId,
              ],
            );
        }
        await client.query(
          `UPDATE ${table} SET posted_on=coalesce($3,posted_on),due_date=coalesce($4,due_date),paid_at=coalesce($5,paid_at),cash_available_at=coalesce($6,cash_available_at),updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2`,
          [
            clinicId,
            id,
            input.postedOn ?? null,
            input.dueDate ?? null,
            input.paidAt ?? null,
            input.availableAt ?? null,
          ],
        );
        if (kind === "payable" && input.paidAt)
          await client.query(
            "UPDATE commission_entries ce SET paid_at=$3 FROM payables py WHERE py.clinic_id=$1 AND py.id=$2 AND ce.clinic_id=py.clinic_id AND ce.id=py.commission_id AND ce.status='paid'",
            [clinicId, id, input.paidAt],
          );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "finance.dates_updated",
          kind,
          id,
          { previous: entry, ...input },
        );
        return kind === "receivable"
          ? (await context.findReceivable(client, clinicId, id))!
          : (await context.findPayable(client, clinicId, id))!;
      });
    },
  };
}
