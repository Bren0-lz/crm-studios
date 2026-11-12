import type { Pool, PoolClient } from "../../infrastructure/mysql-client.js";
import type {
  FinancialSummary,
  PaymentMethod,
  Receivable,
} from "@crm/contracts";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import {
  branchClause,
  mapReceivable,
  receivableColumns,
  type ReceivableRow,
} from "./helpers.js";
import { loadReceiptSignatureSummaries } from "./receipt-signatures.js";
import {
  latestDateCorrection,
  localMonth,
  patientNotTrashed,
} from "./sql.js";
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
    FROM financial_events fe ${latestDateCorrection("dc", "fe", "receivable_event_id")} WHERE fe.clinic_id=$1 AND fe.kind IN ('payment','payment_reversal') AND EXISTS(SELECT 1 FROM receivables rb WHERE rb.id=fe.receivable_id AND ${patientNotTrashed("rb.patient_id")} AND ${branchClause("rb.branch_id", 4)})
    UNION ALL SELECT r.amount_in_cents,r.paid_at,coalesce(r.cash_available_at,r.paid_at) FROM receivables r WHERE r.clinic_id=$1 AND ${patientNotTrashed("r.patient_id")} AND ${branchClause("r.branch_id", 4)} AND r.status='paid' AND r.paid_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM financial_events fe WHERE fe.clinic_id=$1 AND fe.receivable_id=r.id AND fe.kind IN ('payment','payment_reversal'))
  ) SELECT coalesce(sum(CASE WHEN ${localMonth("occurred_at")}=$3 THEN amount END),0) AS paid,coalesce(sum(CASE WHEN ${localMonth("available_at")}=$3 THEN amount END),0) AS available FROM events`,
    [clinicId, timezone, month, branchIds],
  );
  const expenses = await client.query<{ paid: string; available: string }>(
    `WITH events AS (
    SELECT CASE WHEN pe.kind='payment' THEN abs(pe.amount_in_cents) ELSE -abs(pe.amount_in_cents) END AS amount,coalesce(dc.occurred_at,pe.occurred_at,pe.created_at) AS occurred_at,coalesce(dc.cash_available_at,pe.cash_available_at,pe.occurred_at,pe.created_at) AS available_at
    FROM payable_events pe ${latestDateCorrection("dc", "pe", "payable_event_id")} WHERE pe.clinic_id=$1 AND pe.kind IN ('payment','payment_reversal') AND EXISTS(SELECT 1 FROM payables pb WHERE pb.id=pe.payable_id AND ${branchClause("pb.branch_id", 4)})
    UNION ALL SELECT py.amount_in_cents,py.paid_at,coalesce(py.cash_available_at,py.paid_at) FROM payables py WHERE py.clinic_id=$1 AND ${branchClause("py.branch_id", 4)} AND py.status='paid' AND py.paid_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payable_events pe WHERE pe.clinic_id=$1 AND pe.payable_id=py.id AND pe.kind IN ('payment','payment_reversal'))
  ) SELECT coalesce(sum(CASE WHEN ${localMonth("occurred_at")}=$3 THEN amount END),0) AS paid,coalesce(sum(CASE WHEN ${localMonth("available_at")}=$3 THEN amount END),0) AS available FROM events`,
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
  const origins = await loadReceivableOrigins(client, clinicId, branchIds);
  const receiptSignatures = await loadReceiptSignatureSummaries(
    client,
    clinicId,
    branchIds,
  );
  const receivables = (
    await client.query<ReceivableRow>(
      `SELECT ${receivableColumns} FROM receivables r JOIN patients p ON p.id=r.patient_id AND p.clinic_id=r.clinic_id WHERE r.clinic_id=$1 AND p.deleted_at IS NULL AND ${branchClause("r.branch_id", 2)} ORDER BY r.due_date,r.created_at`,
      [clinicId, branchIds],
    )
  ).rows
    .map(mapReceivable)
    .map((item) => ({
      ...item,
      ...origins.get(item.id),
      overdue: item.status === "open" && item.dueDate < today,
      ...(receiptSignatures.has(item.id)
        ? { receiptSignature: receiptSignatures.get(item.id)! }
        : {}),
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

/** Plano vendido e serviços (do plano ou da comanda) de cada conta a receber. */
async function loadReceivableOrigins(
  client: Pool | PoolClient,
  clinicId: string,
  branchIds: string[] | null,
) {
  const rows = await client.query<{
    receivableId: string;
    planName: string | null;
    planKind: Receivable["planKind"] | null;
    planTotalInCents: number | string | null;
    planPaymentMethod: PaymentMethod | null;
    serviceId: string;
    serviceName: string;
  }>(
    `SELECT r.id AS "receivableId",pp.name AS "planName",pp.kind AS "planKind",pp.total_value_in_cents AS "planTotalInCents",pp.payment_method AS "planPaymentMethod",coalesce(pps.service_id,pp.service_id) AS "serviceId",coalesce(pps.service_name,s.name) AS "serviceName"
     FROM receivables r
     JOIN patient_plans pp ON pp.clinic_id=r.clinic_id AND pp.id=r.plan_id
     LEFT JOIN patient_plan_services pps ON pps.clinic_id=pp.clinic_id AND pps.plan_id=pp.id
     LEFT JOIN services s ON s.id=pp.service_id
     WHERE r.clinic_id=$1 AND ${branchClause("r.branch_id", 2)}
     UNION ALL
     SELECT t.receivable_id,NULL,NULL,NULL,NULL,ts.service_id,ts.service_name
     FROM patient_tabs t
     JOIN patient_tab_services ts ON ts.clinic_id=t.clinic_id AND ts.tab_id=t.id
     JOIN receivables r ON r.clinic_id=t.clinic_id AND r.id=t.receivable_id
     WHERE t.clinic_id=$1 AND r.plan_id IS NULL AND ${branchClause("r.branch_id", 2)}`,
    [clinicId, branchIds],
  );
  const origins = new Map<
    string,
    Required<Pick<Receivable, "services">> &
      Pick<
        Receivable,
        "planName" | "planKind" | "planTotalInCents" | "planPaymentMethod"
      >
  >();
  for (const row of rows.rows) {
    const origin = origins.get(row.receivableId) ?? { services: [] };
    if (row.planName) origin.planName = row.planName;
    if (row.planKind) origin.planKind = row.planKind;
    if (row.planTotalInCents !== null)
      origin.planTotalInCents = Number(row.planTotalInCents);
    if (row.planPaymentMethod) origin.planPaymentMethod = row.planPaymentMethod;
    if (!origin.services.some((service) => service.id === row.serviceId))
      origin.services.push({ id: row.serviceId, name: row.serviceName });
    origins.set(row.receivableId, origin);
  }
  return origins;
}
