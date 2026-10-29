import {
  commissionAccountBalances,
  type CommissionAdjustment,
  type CommissionAccountPayment,
  type CommissionExpectation,
  type CommissionReconciliation,
  type CommissionReconciliationInput,
} from "@crm/contracts";
import type { Pool, PoolClient } from "pg";
import { DomainError } from "../../repository.js";
import {
  commissionReconciliationDigest,
  commissionReconciliationChanges,
} from "../../modules/finance/commission-reconciliation.js";
import type { PostgresRepositoryContext } from "./context.js";
import { markPaymentProofsReversed } from "./payment-proofs.js";
const adjustmentColumns = `id,clinic_id AS "clinicId",commission_id AS "commissionId",reconciliation_id AS "reconciliationId",professional_id AS "professionalId",professional_name AS "professionalName",competence,amount_in_cents AS "amountInCents",reason,actor_id AS "actorId",status,paid_at AS "paidAt",created_at AS "createdAt"`;
const paymentColumns = `id,clinic_id AS "clinicId",commission_id AS "commissionId",professional_id AS "professionalId",professional_name AS "professionalName",amount_in_cents AS "amountInCents",actor_id AS "actorId",occurred_at AS "occurredAt",original_included AS "originalIncluded",adjustment_ids AS "adjustmentIds",reversed_at AS "reversedAt"`;
type AdjustmentRow = Omit<CommissionAdjustment, "createdAt" | "paidAt"> & {
  createdAt: Date;
  paidAt: Date | null;
};
type PaymentRow = Omit<
  CommissionAccountPayment,
  "occurredAt" | "reversedAt"
> & { occurredAt: Date; reversedAt: Date | null };
const mapAdjustment = ({
  paidAt,
  createdAt,
  ...row
}: AdjustmentRow): CommissionAdjustment => ({
  ...row,
  createdAt: createdAt.toISOString(),
  ...(paidAt ? { paidAt: paidAt.toISOString() } : {}),
});
const mapPayment = ({
  occurredAt,
  reversedAt,
  ...row
}: PaymentRow): CommissionAccountPayment => ({
  ...row,
  occurredAt: occurredAt.toISOString(),
  ...(reversedAt ? { reversedAt: reversedAt.toISOString() } : {}),
});
export async function loadCommissionAdjustments(
  client: Pool | PoolClient,
  clinicId: string,
  commissionId?: string,
) {
  return (
    await client.query<AdjustmentRow>(
      `SELECT ${adjustmentColumns} FROM commission_adjustments WHERE clinic_id=$1 AND ($2::uuid IS NULL OR commission_id=$2) ORDER BY created_at,id`,
      [clinicId, commissionId ?? null],
    )
  ).rows.map(mapAdjustment);
}
export async function loadCommissionAccountPayments(
  client: Pool | PoolClient,
  clinicId: string,
  commissionId?: string,
) {
  return (
    await client.query<PaymentRow>(
      `SELECT ${paymentColumns} FROM commission_account_payments WHERE clinic_id=$1 AND ($2::uuid IS NULL OR commission_id=$2) ORDER BY occurred_at,id`,
      [clinicId, commissionId ?? null],
    )
  ).rows.map(mapPayment);
}
export function createCommissionReconciliationRepository(
  context: PostgresRepositoryContext,
) {
  async function original(client: PoolClient, clinicId: string, id: string) {
    const row = (
      await context.listCommissions(clinicId, undefined, client)
    ).find((item) => item.id === id);
    if (!row)
      throw new DomainError(
        "COMMISSION_NOT_FOUND",
        "Comissão não encontrada.",
        404,
      );
    return row;
  }
  async function lock(client: PoolClient, clinicId: string, actorId?: string) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      clinicId,
    ]);
    if (
      actorId &&
      !(
        await client.query(
          "SELECT id FROM users WHERE clinic_id=$1 AND id=$2",
          [clinicId, actorId],
        )
      ).rowCount
    )
      throw new DomainError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
  }
  async function managedByExpense(
    client: PoolClient,
    clinicId: string,
    id: string,
  ) {
    return Boolean(
      (
        await client.query(
          "SELECT id FROM payables WHERE clinic_id=$1 AND commission_id=$2 AND status<>'cancelled'",
          [clinicId, id],
        )
      ).rowCount,
    );
  }
  async function expectation(
    client: PoolClient,
    clinicId: string,
    id: string,
  ): Promise<CommissionExpectation | null> {
    const row = await original(client, clinicId, id);
    const result = await client.query<CommissionExpectation>(
      `WITH sources AS (
      SELECT a.professional_id,a.service_id,a.starts_at FROM appointments a WHERE a.clinic_id=$1 AND a.id=$2 AND a.status='completed' AND a.patient_id IS NOT NULL
      UNION ALL SELECT coalesce(gs.professional_id,g.professional_id),g.service_id,gs.starts_at FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id WHERE ga.clinic_id=$1 AND ga.id=$3 AND gs.status<>'cancelled' AND (ga.status='present' OR ga.outcome='present')
    ) SELECT a.professional_id AS "professionalId",pr.full_name AS "professionalName",to_char(a.starts_at AT TIME ZONE c.timezone,'YYYY-MM') AS competence,CASE WHEN rule.kind='fixed' THEN rule.fixed_amount_in_cents ELSE round(s.price_in_cents*rule.percentage/100)::int END AS "amountInCents",s.price_in_cents AS "baseAmountInCents",s.id AS "serviceId",rule.id AS "ruleId",jsonb_strip_nulls(jsonb_build_object('percentage',rule.percentage,'kind',rule.kind,'fixedAmountInCents',rule.fixed_amount_in_cents,'serviceId',rule.service_id,'effectiveFrom',rule.effective_from,'effectiveUntil',rule.effective_until)) AS "ruleSnapshot"
      FROM sources a JOIN clinics c ON c.id=$1 JOIN services s ON s.id=a.service_id AND s.clinic_id=$1 JOIN professionals pr ON pr.id=a.professional_id AND pr.clinic_id=$1 JOIN LATERAL (SELECT cr.* FROM commission_rules cr WHERE cr.clinic_id=$1 AND (cr.professional_id=a.professional_id OR (pr.user_id IS NOT NULL AND cr.user_id=pr.user_id)) AND cr.active AND (cr.service_id IS NULL OR cr.service_id=a.service_id) AND cr.effective_from<=(a.starts_at AT TIME ZONE c.timezone)::date AND (cr.effective_until IS NULL OR cr.effective_until>=(a.starts_at AT TIME ZONE c.timezone)::date) ORDER BY (cr.user_id IS NOT NULL) DESC,(cr.service_id IS NOT NULL) DESC,cr.effective_from DESC LIMIT 1) rule ON true`,
      [clinicId, row.appointmentId ?? null, row.groupAttendanceId ?? null],
    );
    return result.rows[0] ?? null;
  }
  async function preview(client: PoolClient, clinicId: string, id: string) {
    const commission = await original(client, clinicId, id),
      expected = await expectation(client, clinicId, id),
      adjustments = await loadCommissionAdjustments(client, clinicId, id);
    const history = await client.query<
      Omit<CommissionReconciliation, "adjustments" | "createdAt"> & {
        createdAt: Date;
      }
    >(
      `SELECT id,clinic_id AS "clinicId",commission_id AS "commissionId",idempotency_key AS "idempotencyKey",expected_digest AS "expectedDigest",reason,actor_id AS "actorId",actor_name AS "actorName",created_at AS "createdAt",expected FROM commission_reconciliations WHERE clinic_id=$1 AND commission_id=$2 ORDER BY created_at,id`,
      [clinicId, id],
    );
    return {
      reconciliations: history.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        adjustments: adjustments.filter(
          (entry) => entry.reconciliationId === row.id,
        ),
      })),
      digest: commissionReconciliationDigest(commission, expected, adjustments),
      commission,
      expected,
      adjustments,
      payments: await loadCommissionAccountPayments(client, clinicId, id),
      changes: commissionReconciliationChanges(
        commission,
        expected,
        adjustments,
      ),
      originalManagedByExpense: await managedByExpense(client, clinicId, id),
    };
  }
  return {
    async getCommissionReconciliationPreview(clinicId: string, id: string) {
      return context.inTransaction(async (client) => {
        await lock(client, clinicId);
        return preview(client, clinicId, id);
      });
    },
    async reconcileCommission(
      clinicId: string,
      actorId: string,
      id: string,
      input: CommissionReconciliationInput,
    ) {
      return context.inTransaction(async (client) => {
        await lock(client, clinicId, actorId);
        const existing = await client.query<
          Omit<CommissionReconciliation, "adjustments" | "createdAt"> & {
            createdAt: Date;
          }
        >(
          `SELECT id,clinic_id AS "clinicId",commission_id AS "commissionId",idempotency_key AS "idempotencyKey",expected_digest AS "expectedDigest",reason,actor_id AS "actorId",actor_name AS "actorName",created_at AS "createdAt",expected FROM commission_reconciliations WHERE clinic_id=$1 AND idempotency_key=$2`,
          [clinicId, input.idempotencyKey],
        );
        const cached = existing.rows[0];
        if (cached) {
          if (
            cached.commissionId !== id ||
            cached.reason !== input.reason ||
            cached.expectedDigest !== input.expectedDigest
          )
            throw new DomainError(
              "COMMISSION_RECONCILIATION_KEY",
              "A referência de repetição já foi usada para outra conciliação.",
              409,
            );
          return {
            ...cached,
            createdAt: cached.createdAt.toISOString(),
            adjustments: (
              await loadCommissionAdjustments(client, clinicId, id)
            ).filter((entry) => entry.reconciliationId === cached.id),
          };
        }
        const comparison = await preview(client, clinicId, id);
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
        const record = (
          await client.query<{ id: string; createdAt: Date }>(
            `INSERT INTO commission_reconciliations(clinic_id,commission_id,idempotency_key,reason,expected,actor_id,expected_digest,actor_name) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,(SELECT full_name FROM users WHERE clinic_id=$1 AND id=$6)) RETURNING id,created_at AS "createdAt"`,
            [
              clinicId,
              id,
              input.idempotencyKey,
              input.reason,
              comparison.expected ? JSON.stringify(comparison.expected) : null,
              actorId,
              input.expectedDigest,
            ],
          )
        ).rows[0]!;
        for (const change of comparison.changes)
          await client.query(
            `INSERT INTO commission_adjustments(clinic_id,commission_id,reconciliation_id,professional_id,professional_name,competence,amount_in_cents,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              clinicId,
              id,
              record.id,
              change.professionalId,
              change.professionalName,
              change.competence,
              change.amountInCents,
              input.reason,
              actorId,
            ],
          );
        await context.addAdminAudit(
          client,
          clinicId,
          actorId,
          "commission.reconciled",
          "commission",
          id,
          {
            reason: input.reason,
            reconciliationId: record.id,
            changes: comparison.changes,
          },
        );
        return {
          actorName: (
            await client.query<{ fullName: string }>(
              'SELECT full_name AS "fullName" FROM users WHERE clinic_id=$1 AND id=$2',
              [clinicId, actorId],
            )
          ).rows[0]!.fullName,
          expectedDigest: input.expectedDigest,
          id: record.id,
          clinicId,
          commissionId: id,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          actorId,
          createdAt: record.createdAt.toISOString(),
          expected: comparison.expected,
          adjustments: (
            await loadCommissionAdjustments(client, clinicId, id)
          ).filter((entry) => entry.reconciliationId === record.id),
        };
      });
    },
    async settleCommissionAccount(
      clinicId: string,
      actorId: string,
      id: string,
      professionalId: string,
      expectedAmountInCents: number,
    ) {
      return context.inTransaction(async (client) => {
        await lock(client, clinicId, actorId);
        const commission = await original(client, clinicId, id),
          balance = commissionAccountBalances(
            commission,
            await loadCommissionAdjustments(client, clinicId, id),
            await managedByExpense(client, clinicId, id),
          ).find((entry) => entry.professionalId === professionalId);
        if (!(await loadCommissionAdjustments(client, clinicId, id)).length)
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
        const record = mapPayment(
          (
            await client.query<PaymentRow>(
              `INSERT INTO commission_account_payments(clinic_id,commission_id,professional_id,professional_name,amount_in_cents,actor_id,original_included,adjustment_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${paymentColumns}`,
              [
                clinicId,
                id,
                professionalId,
                balance.professionalName,
                balance.amountInCents,
                actorId,
                balance.originalIncluded,
                balance.adjustmentIds,
              ],
            )
          ).rows[0]!,
        );
        if (balance.originalIncluded)
          await client.query(
            "UPDATE commission_entries SET status='paid',paid_at=$3,paid_by_user_id=$4 WHERE clinic_id=$1 AND id=$2",
            [clinicId, id, record.occurredAt, actorId],
          );
        await client.query(
          "UPDATE commission_adjustments SET status='paid',paid_at=$3 WHERE clinic_id=$1 AND id=ANY($2::uuid[])",
          [clinicId, balance.adjustmentIds, record.occurredAt],
        );
        await client.query(
          "INSERT INTO commission_payment_events(clinic_id,commission_id,kind,amount_in_cents,actor_user_id,occurred_at,professional_name,account_payment_id) VALUES($1,$2,'payment',$3,$4,$5,$6,$7)",
          [
            clinicId,
            id,
            balance.amountInCents,
            actorId,
            record.occurredAt,
            balance.professionalName,
            record.id,
          ],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorId,
          "commission.account_paid",
          "commission",
          id,
          {
            paymentId: record.id,
            professionalId,
            amountInCents: balance.amountInCents,
          },
        );
        return record;
      });
    },
    async reverseCommissionAccountPayment(
      clinicId: string,
      actorId: string,
      paymentId: string,
    ) {
      return context.inTransaction(async (client) => {
        await lock(client, clinicId, actorId);
        const raw = (
          await client.query<PaymentRow>(
            `SELECT ${paymentColumns} FROM commission_account_payments WHERE clinic_id=$1 AND id=$2 FOR UPDATE`,
            [clinicId, paymentId],
          )
        ).rows[0];
        if (!raw)
          throw new DomainError(
            "COMMISSION_ACCOUNT_PAYMENT_NOT_FOUND",
            "Pagamento conciliado não encontrado.",
            404,
          );
        const payment = mapPayment(raw);
        if (payment.reversedAt)
          throw new DomainError(
            "COMMISSION_ACCOUNT_PAYMENT_REVERSED",
            "O pagamento conciliado já foi estornado.",
            409,
          );
        const commission = await original(
            client,
            clinicId,
            payment.commissionId,
          ),
          entries = (
            await loadCommissionAdjustments(client, clinicId, commission.id)
          ).filter((entry) => payment.adjustmentIds.includes(entry.id));
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
        if (payment.originalIncluded)
          await client.query(
            "UPDATE commission_entries SET status='open',paid_at=NULL,paid_by_user_id=NULL WHERE clinic_id=$1 AND id=$2",
            [clinicId, commission.id],
          );
        await client.query(
          "UPDATE commission_adjustments SET status='open',paid_at=NULL WHERE clinic_id=$1 AND id=ANY($2::uuid[])",
          [clinicId, payment.adjustmentIds],
        );
        const reversed = mapPayment(
          (
            await client.query<PaymentRow>(
              `UPDATE commission_account_payments SET reversed_at=now() WHERE clinic_id=$1 AND id=$2 RETURNING ${paymentColumns}`,
              [clinicId, paymentId],
            )
          ).rows[0]!,
        );
        await markPaymentProofsReversed(
          client,
          clinicId,
          "commission_account_payment",
          paymentId,
        );
        await client.query(
          "INSERT INTO commission_payment_events(clinic_id,commission_id,kind,amount_in_cents,actor_user_id,occurred_at,professional_name,account_payment_id) VALUES($1,$2,'reversal',$3,$4,$5,$6,$7)",
          [
            clinicId,
            commission.id,
            -payment.amountInCents,
            actorId,
            reversed.reversedAt,
            payment.professionalName,
            payment.id,
          ],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorId,
          "commission.account_reversed",
          "commission",
          commission.id,
          { paymentId, amountInCents: payment.amountInCents },
        );
        return reversed;
      });
    },
  };
}
