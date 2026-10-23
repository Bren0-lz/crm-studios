import type { Pool, PoolClient } from "pg";
import type { FinancialSummary } from "@crm/contracts";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import {
  branchClause,
  mapReceivable,
  receivableColumns,
  type ReceivableRow,
} from "./helpers.js";
export async function loadFinancialMonth(
  client: Pool | PoolClient,
  clinicId: string,
  timezone: string,
  /** Filiais consideradas; `null` = todas. */
  branchIds: string[] | null,
) {
  const month = clinicDateOf(new Date(), timezone).slice(0, 7);
  const receipts = await client.query<{ paid: string; available: string }>(
    `WITH events AS (
    SELECT CASE WHEN fe.kind='payment' THEN abs(fe.amount_in_cents) ELSE -abs(fe.amount_in_cents) END AS amount,coalesce(dc.occurred_at,fe.occurred_at,fe.created_at) AS occurred_at,coalesce(dc.cash_available_at,fe.cash_available_at,fe.occurred_at,fe.created_at) AS available_at
    FROM financial_events fe LEFT JOIN LATERAL(SELECT occurred_at,cash_available_at FROM financial_date_corrections WHERE clinic_id=fe.clinic_id AND receivable_event_id=fe.id ORDER BY revision DESC LIMIT 1) dc ON true WHERE fe.clinic_id=$1 AND fe.kind IN ('payment','payment_reversal') AND EXISTS(SELECT 1 FROM receivables rb WHERE rb.id=fe.receivable_id AND ${branchClause("rb.branch_id", 4)})
    UNION ALL SELECT r.amount_in_cents,r.paid_at,coalesce(r.cash_available_at,r.paid_at) FROM receivables r WHERE r.clinic_id=$1 AND ${branchClause("r.branch_id", 4)} AND r.status='paid' AND r.paid_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM financial_events fe WHERE fe.clinic_id=$1 AND fe.receivable_id=r.id AND fe.kind IN ('payment','payment_reversal'))
  ) SELECT coalesce(sum(amount) FILTER(WHERE to_char(occurred_at AT TIME ZONE $2,'YYYY-MM')=$3),0)::text AS paid,coalesce(sum(amount) FILTER(WHERE to_char(available_at AT TIME ZONE $2,'YYYY-MM')=$3),0)::text AS available FROM events`,
    [clinicId, timezone, month, branchIds],
  );
  const expenses = await client.query<{ paid: string; available: string }>(
    `WITH events AS (
    SELECT CASE WHEN pe.kind='payment' THEN abs(pe.amount_in_cents) ELSE -abs(pe.amount_in_cents) END AS amount,coalesce(dc.occurred_at,pe.occurred_at,pe.created_at) AS occurred_at,coalesce(dc.cash_available_at,pe.cash_available_at,pe.occurred_at,pe.created_at) AS available_at
    FROM payable_events pe LEFT JOIN LATERAL(SELECT occurred_at,cash_available_at FROM financial_date_corrections WHERE clinic_id=pe.clinic_id AND payable_event_id=pe.id ORDER BY revision DESC LIMIT 1) dc ON true WHERE pe.clinic_id=$1 AND pe.kind IN ('payment','payment_reversal') AND EXISTS(SELECT 1 FROM payables pb WHERE pb.id=pe.payable_id AND ${branchClause("pb.branch_id", 4)})
    UNION ALL SELECT py.amount_in_cents,py.paid_at,coalesce(py.cash_available_at,py.paid_at) FROM payables py WHERE py.clinic_id=$1 AND ${branchClause("py.branch_id", 4)} AND py.status='paid' AND py.paid_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payable_events pe WHERE pe.clinic_id=$1 AND pe.payable_id=py.id AND pe.kind IN ('payment','payment_reversal'))
  ) SELECT coalesce(sum(amount) FILTER(WHERE to_char(occurred_at AT TIME ZONE $2,'YYYY-MM')=$3),0)::text AS paid,coalesce(sum(amount) FILTER(WHERE to_char(available_at AT TIME ZONE $2,'YYYY-MM')=$3),0)::text AS available FROM events`,
    [clinicId, timezone, month, branchIds],
  );
  return {
    month,
    receiptPaidInCents: Number(receipts.rows[0]!.paid),
    receiptCashInCents: Number(receipts.rows[0]!.available),
    expensePaidInCents: Number(expenses.rows[0]!.paid),
    expenseCashOutInCents: Number(expenses.rows[0]!.available),
  };
}
export async function loadFinancialSummary(
  client: Pool | PoolClient,
  clinicId: string,
  timezone: string,
  branchIds: string[] | null,
  month?: Awaited<ReturnType<typeof loadFinancialMonth>>,
): Promise<FinancialSummary> {
  const period =
      month ??
      (await loadFinancialMonth(client, clinicId, timezone, branchIds)),
    today = clinicDateOf(new Date(), timezone);
  const receivables = (
    await client.query<ReceivableRow>(
      `SELECT ${receivableColumns} FROM receivables r JOIN patients p ON p.id=r.patient_id AND p.clinic_id=r.clinic_id WHERE r.clinic_id=$1 AND ${branchClause("r.branch_id", 2)} ORDER BY r.due_date,r.created_at`,
      [clinicId, branchIds],
    )
  ).rows
    .map(mapReceivable)
    .map((item) => ({
      ...item,
      overdue: item.status === "open" && item.dueDate < today,
    }));
  return {
    receivables,
    openInCents: receivables
      .filter((item) => item.status === "open")
      .reduce((sum, item) => sum + item.amountInCents, 0),
    overdueInCents: receivables
      .filter((item) => item.overdue)
      .reduce((sum, item) => sum + item.amountInCents, 0),
    paidThisMonthInCents: period.receiptPaidInCents,
  };
}
