import type {
  AdminUserCommissionInput,
  CommissionEntry,
  CommissionRecalculationPreview,
} from "@crm/contracts";
import type { PoolClient } from "pg";
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
import type { PostgresRepositoryContext } from "./context.js";

type RuleRow = {
  id: string;
  userId: string | null;
  professionalId: string | null;
  active: boolean;
  kind: "percentage" | "fixed";
  percentage: number;
  fixedAmountInCents: number | null;
  serviceId: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
};
type SourceRow = {
  id: string;
  date: string;
  serviceId: string;
  userId: string | null;
  adjustmentsInCents: number;
  hasAdjustments: boolean;
  managedByExpense: boolean;
};

/**
 * Recálculo retroativo de comissões (PostgreSQL). Roda dentro da transação que grava as
 * regras: abertas mudam de valor; pagas ganham ajuste (conciliação) para o próximo pagamento.
 */
export function createPostgresCommissionRecalculation(
  context: PostgresRepositoryContext,
) {
  async function rules(client: PoolClient, clinicId: string) {
    const result = await client.query<RuleRow>(
      `SELECT id,user_id AS "userId",professional_id AS "professionalId",active,kind,percentage::float8 AS percentage,fixed_amount_in_cents AS "fixedAmountInCents",service_id AS "serviceId",effective_from::text AS "effectiveFrom",effective_until::text AS "effectiveUntil"
       FROM commission_rules WHERE clinic_id=$1`,
      [clinicId],
    );
    return result.rows.map((row): CommissionTerms => ({
      id: row.id,
      active: row.active,
      percentage: Number(row.percentage),
      effectiveFrom: row.effectiveFrom,
      ...(row.userId ? { userId: row.userId } : {}),
      ...(row.professionalId ? { professionalId: row.professionalId } : {}),
      ...(row.kind === "fixed" ? { kind: row.kind } : {}),
      ...(row.fixedAmountInCents !== null
        ? { fixedAmountInCents: row.fixedAmountInCents }
        : {}),
      ...(row.serviceId ? { serviceId: row.serviceId } : {}),
      ...(row.effectiveUntil ? { effectiveUntil: row.effectiveUntil } : {}),
    }));
  }
  async function today(client: PoolClient, clinicId: string) {
    const result = await client.query<{ timezone: string }>(
      "SELECT timezone FROM clinics WHERE id=$1",
      [clinicId],
    );
    return clinicDateOf(
      new Date(),
      result.rows[0]?.timezone ?? "America/Sao_Paulo",
    );
  }
  /** Comissões com origem válida a partir de `from` (as anteriores não mudam de regra). */
  async function sources(
    client: PoolClient,
    clinicId: string,
    from: string,
  ): Promise<CommissionRecalculationSource[]> {
    const result = await client.query<SourceRow>(
      `SELECT ce.id,(src.starts_at AT TIME ZONE c.timezone)::date::text AS date,src.service_id AS "serviceId",pr.user_id AS "userId",
         coalesce((SELECT sum(ca.amount_in_cents) FROM commission_adjustments ca WHERE ca.clinic_id=ce.clinic_id AND ca.commission_id=ce.id AND ca.professional_id=ce.professional_id),0)::int AS "adjustmentsInCents",
         EXISTS(SELECT 1 FROM commission_adjustments ca WHERE ca.clinic_id=ce.clinic_id AND ca.commission_id=ce.id) AS "hasAdjustments",
         (ce.payroll_payable_id IS NOT NULL OR EXISTS(SELECT 1 FROM payables p WHERE p.clinic_id=ce.clinic_id AND p.commission_id=ce.id AND p.status<>'cancelled')) AS "managedByExpense"
       FROM commission_entries ce
       JOIN clinics c ON c.id=ce.clinic_id
       JOIN professionals pr ON pr.id=ce.professional_id AND pr.clinic_id=ce.clinic_id
       JOIN LATERAL (
         SELECT a.starts_at,a.service_id FROM appointments a
          WHERE a.clinic_id=ce.clinic_id AND a.id=ce.appointment_id AND a.status='completed'
         UNION ALL
         SELECT gs.starts_at,g.service_id FROM group_attendance ga
           JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id
           JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id
          WHERE ga.clinic_id=ce.clinic_id AND ga.id=ce.group_attendance_id AND gs.status<>'cancelled'
            AND (ga.status='present' OR ga.outcome='present')
       ) src ON true
       WHERE ce.clinic_id=$1 AND (src.starts_at AT TIME ZONE c.timezone)::date>=$2::date`,
      [clinicId, from],
    );
    if (!result.rows.length) return [];
    const commissions = new Map<string, CommissionEntry>(
      (await context.listCommissions(clinicId, undefined, client)).map(
        (item) => [item.id, item],
      ),
    );
    return result.rows.flatMap((row) => {
      const commission = commissions.get(row.id);
      return commission
        ? [
            {
              commission,
              date: row.date,
              serviceId: row.serviceId,
              ...(row.userId ? { userId: row.userId } : {}),
              adjustmentsInCents: row.adjustmentsInCents,
              hasAdjustments: row.hasAdjustments,
              managedByExpense: row.managedByExpense,
            },
          ]
        : [];
    });
  }
  async function assertOwner(
    client: PoolClient,
    clinicId: string,
    owner: CommissionRuleOwner,
  ) {
    const found =
      "userId" in owner
        ? await client.query(
            "SELECT id FROM users WHERE clinic_id=$1 AND id=$2",
            [clinicId, owner.userId],
          )
        : await client.query(
            "SELECT id FROM professionals WHERE clinic_id=$1 AND id=$2",
            [clinicId, owner.professionalId],
          );
    if (!found.rowCount)
      throw "userId" in owner
        ? new DomainError("USER_NOT_FOUND", "Usuário não encontrado.", 404)
        : new DomainError(
            "PROFESSIONAL_NOT_FOUND",
            "Profissional não encontrado.",
            404,
          );
  }
  return {
    /** Prévia com as regras como ficariam depois de gravar `drafts` (não grava nada). */
    async preview(
      clinicId: string,
      owner: CommissionRuleOwner,
      drafts: AdminUserCommissionInput[],
    ): Promise<CommissionRecalculationPreview> {
      return context.inTransaction(async (client) => {
        await assertOwner(client, clinicId, owner);
        const range = commissionRecalculationRange(
            drafts,
            await today(client, clinicId),
          ),
          draft = withDraftCommissionRules(
            await rules(client, clinicId),
            owner,
            drafts,
          );
        return planCommissionRecalculation(
          draft.rules,
          draft.changed,
          await sources(client, clinicId, range.from),
          range,
        );
      });
    },
    /**
     * Depois de gravar as regras, na mesma transação: confere a prévia confirmada (se veio),
     * atualiza as comissões abertas, lança os ajustes das pagas e registra a auditoria.
     */
    async apply(
      client: PoolClient,
      clinicId: string,
      actorId: string,
      owner: CommissionRuleOwner,
      drafts: AdminUserCommissionInput[],
      expectedDigest: string | undefined,
    ) {
      if (!drafts.length) return;
      // Mesmo lock da geração, da conciliação e dos pagamentos de comissão.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [clinicId],
      );
      const current = await rules(client, clinicId),
        changedRules = current.filter((rule) =>
          drafts.some((terms) => sameCommissionRuleSlot(rule, owner, terms)),
        ),
        changed = new Set(changedRules.map((rule) => rule.id)),
        range = commissionRecalculationRange(
          drafts,
          await today(client, clinicId),
        ),
        plan = planCommissionRecalculation(
          current,
          changed,
          await sources(client, clinicId, range.from),
          range,
        );
      assertCommissionRecalculationDigest(plan, expectedDigest);
      if (!plan.items.length) return;
      const reason = commissionRecalculationReason(plan.from);
      for (const item of plan.items) {
        const rule = changedRules.find(
          (entry) =>
            entry.effectiveFrom === item.ruleSnapshot.effectiveFrom &&
            (entry.serviceId ?? "") === (item.ruleSnapshot.serviceId ?? ""),
        );
        if (item.mode === "update") {
          const updated = await client.query(
            `UPDATE commission_entries SET amount_in_cents=$3,percentage=$4,rule_id=coalesce($5::uuid,rule_id),rule_snapshot=$6::jsonb
             WHERE clinic_id=$1 AND id=$2 AND status='open'`,
            [
              clinicId,
              item.commissionId,
              item.amountInCents,
              item.ruleSnapshot.percentage,
              rule?.id ?? null,
              JSON.stringify(item.ruleSnapshot),
            ],
          );
          if (!updated.rowCount)
            throw new DomainError(
              "COMMISSION_RECALCULATION_STALE",
              "As comissões mudaram desde a prévia. Revise a prévia antes de salvar.",
              409,
            );
          continue;
        }
        const commission = (
          await client.query<{
            professionalName: string;
            baseAmountInCents: number;
            serviceId: string | null;
          }>(
            `SELECT p.full_name AS "professionalName",ce.base_amount_in_cents AS "baseAmountInCents",ce.service_id AS "serviceId"
             FROM commission_entries ce JOIN professionals p ON p.id=ce.professional_id WHERE ce.clinic_id=$1 AND ce.id=$2`,
            [clinicId, item.commissionId],
          )
        ).rows[0]!;
        const reconciliation = (
          await client.query<{ id: string }>(
            `INSERT INTO commission_reconciliations(clinic_id,commission_id,idempotency_key,reason,expected,actor_id,expected_digest,actor_name)
             VALUES($1,$2,gen_random_uuid(),$3,$4::jsonb,$5,$6,(SELECT full_name FROM users WHERE clinic_id=$1 AND id=$5)) RETURNING id`,
            [
              clinicId,
              item.commissionId,
              reason,
              JSON.stringify({
                professionalId: item.professionalId,
                professionalName: commission.professionalName,
                competence: item.competence,
                amountInCents: item.amountInCents,
                baseAmountInCents: commission.baseAmountInCents,
                serviceId: commission.serviceId ?? "",
                ruleId: rule?.id ?? "",
                ruleSnapshot: item.ruleSnapshot,
              }),
              actorId,
              plan.digest,
            ],
          )
        ).rows[0]!;
        await client.query(
          `INSERT INTO commission_adjustments(clinic_id,commission_id,reconciliation_id,professional_id,professional_name,competence,amount_in_cents,reason,actor_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            clinicId,
            item.commissionId,
            reconciliation.id,
            item.professionalId,
            commission.professionalName,
            item.competence,
            item.differenceInCents,
            reason,
            actorId,
          ],
        );
      }
      await context.addAdminAudit(
        client,
        clinicId,
        actorId,
        "commission.recalculated",
        "commission_rule",
        [...changed][0],
        commissionRecalculationAudit(plan, [...changed]),
      );
    },
  };
}
