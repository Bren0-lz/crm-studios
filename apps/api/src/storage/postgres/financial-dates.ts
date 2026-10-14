import type { FinancialDatesInput } from "@crm/contracts";
import type { PostgresRepositoryContext } from "./context.js";
import { DomainError } from "../../repository.js";
export function createFinancialDatesRepository(
  context: PostgresRepositoryContext,
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
            `SELECT status,posted_on::text AS "postedOn",due_date::text AS "dueDate",paid_at AS "paidAt",cash_available_at AS "availableAt" FROM ${table} WHERE clinic_id=$1 AND id=$2 FOR UPDATE`,
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
          const event = await client.query<{
            id: string;
            occurredAt: Date;
            availableAt: Date;
          }>(
            `SELECT e.id,coalesce(c.occurred_at,e.occurred_at,e.created_at) AS "occurredAt",coalesce(c.cash_available_at,e.cash_available_at,e.occurred_at,e.created_at) AS "availableAt" FROM ${events} e LEFT JOIN LATERAL (SELECT occurred_at,cash_available_at FROM financial_date_corrections WHERE clinic_id=e.clinic_id AND ${correctionColumn}=e.id ORDER BY revision DESC LIMIT 1) c ON true WHERE e.clinic_id=$1 AND e.${eventColumn}=$2 AND e.kind='payment' ORDER BY e.created_at DESC,e.id DESC LIMIT 1`,
            [clinicId, id],
          );
          if (!event.rows[0])
            throw new DomainError(
              "FINANCIAL_EVENT_NOT_FOUND",
              "O evento de pagamento precisa ser conciliado antes da alteração.",
              409,
            );
          await client.query(
            `INSERT INTO financial_date_corrections(clinic_id,${correctionColumn},occurred_at,cash_available_at,reason,actor_user_id) VALUES($1,$2,$3,$4,$5,$6)`,
            [
              clinicId,
              event.rows[0].id,
              input.paidAt ?? event.rows[0].occurredAt,
              input.availableAt ?? event.rows[0].availableAt,
              input.reason,
              actorUserId,
            ],
          );
        }
        await client.query(
          `UPDATE ${table} SET posted_on=coalesce($3::date,posted_on),due_date=coalesce($4::date,due_date),paid_at=coalesce($5::timestamptz,paid_at),cash_available_at=coalesce($6::timestamptz,cash_available_at),updated_at=now() WHERE clinic_id=$1 AND id=$2`,
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
