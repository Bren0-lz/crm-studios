import {
  nextPlanPeriod,
  type PatientPlanInput,
  type PlanCatalogInput,
  type PlanPaymentSummary,
  type PlanRenewalInput,
  planRefundCategoryName,
  planRefundPayableDescription,
  type PaymentMethod,
  type PlanCancellationDetails,
  type PlanPauseDetails,
  type PlanStatus,
  type PlanTemplateInput,
  planTemplateInputSchema,
  type PlanTemplateUpdate,
  type SessionMovement,
} from "@crm/contracts";
import {
  assertRefundWithinPlan,
  validatePlanComposition,
} from "../../modules/plans/plan-services.js";
import { DomainError } from "../../repository.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "../../infrastructure/mysql-client.js";
import type { MysqlRepositoryContext } from "./context.js";
import { localDate, localMonth, localToday, writeAndRead } from "./sql.js";
import {
  mapPatientPlan,
  mapPlanCatalog,
  mapPlanTemplate,
  patientPlanColumns,
  type PatientPlanRow,
  planCatalogColumns,
  type PlanCatalogRow,
  planTemplateColumns,
  type PlanTemplateRow,
  type SessionMovementRow,
  branchClause,
  json,
} from "./helpers.js";

/**
 * Lança o estorno do cancelamento como conta já paga (saída de caixa) na categoria de
 * estornos — criada na primeira vez, no grupo "Impostos e deduções" — e liga a conta ao plano.
 * Roda dentro da transação do cancelamento.
 */
async function recordRefundPayable(
  client: PoolClient,
  clinicId: string,
  actorUserId: string,
  planId: string,
  amountInCents: number,
  paymentMethod: PaymentMethod,
  note: string | undefined,
) {
  await client.query(
    `INSERT INTO financial_categories (id, clinic_id, name, kind, dre_group)
     VALUES ($1, $2, $3, 'expense', 'tax')
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [randomUUID(), clinicId, planRefundCategoryName],
  );
  const category = await client.query<{ id: string }>(
    "SELECT id FROM financial_categories WHERE clinic_id = $1 AND name = $2 AND kind = 'expense'",
    [clinicId, planRefundCategoryName],
  );
  const plan = await client.query<{
    name: string;
    patientName: string;
    branchId: string;
  }>(
    `SELECT pp.name, p.full_name AS "patientName", pp.branch_id AS "branchId"
     FROM patient_plans pp JOIN patients p ON p.id = pp.patient_id
     WHERE pp.clinic_id = $1 AND pp.id = $2`,
    [clinicId, planId],
  );
  const payableId = randomUUID();
  await client.query(
    `INSERT INTO payables
       (id, clinic_id, description, supplier, category_id, due_date, amount_in_cents, notes,
        status, payment_method, paid_at, created_by_user_id, paid_by_user_id,
        posted_on, dre_competence, branch_id)
     VALUES ($1, $2, $3, $4, $5, ${localToday()}, $6, $7,
        'paid', $8, NOW(6), $9, $9,
        ${localToday()}, ${localMonth("NOW(6)")}, $10)`,
    [
      payableId,
      clinicId,
      planRefundPayableDescription(
        plan.rows[0]!.patientName,
        plan.rows[0]!.name,
      ),
      plan.rows[0]!.patientName,
      category.rows[0]!.id,
      amountInCents,
      note || null,
      paymentMethod,
      actorUserId,
      plan.rows[0]!.branchId,
    ],
  );
  await client.query(
    `INSERT INTO payable_events
       (clinic_id, payable_id, actor_user_id, kind, amount_in_cents, metadata, occurred_at, cash_available_at)
     VALUES ($1, $2, $3, 'created', $4, '{}', NULL, NULL),
            ($1, $2, $3, 'payment', $5, $6, NOW(6), NOW(6))`,
    [
      clinicId,
      payableId,
      actorUserId,
      amountInCents,
      -amountInCents,
      { paymentMethod },
    ],
  );
  await client.query(
    "UPDATE patient_plans SET refund_payable_id = $3 WHERE clinic_id = $1 AND id = $2",
    [clinicId, planId, payableId],
  );
}

export function createPlansRepository(
  repositoryContext: MysqlRepositoryContext,
) {
  return {
    async listPlanTemplates(clinicId: string) {
      const result = await repositoryContext.pool.query<PlanTemplateRow>(
        `SELECT ${planTemplateColumns} FROM plan_templates WHERE clinic_id=$1`,
        [clinicId],
      );
      return result.rows
        .map((row) => mapPlanTemplate(row))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },

    async createPlanTemplate(
      clinicId: string,
      actorUserId: string,
      input: PlanTemplateInput,
    ) {
      input = planTemplateInputSchema.parse(input);
      return repositoryContext.inTransaction(async (client) => {
        await repositoryContext.assertTemplateServices(
          client,
          clinicId,
          input.services,
        );
        const totals = validatePlanComposition(
          input.services,
          input.totalValueInCents,
        );
        const id = randomUUID();
        await client.query(
          `INSERT INTO plan_templates
        (clinic_id,name,total_value_in_cents,service_id,kind,total_sessions,plan_type,id,max_installments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            clinicId,
            input.name,
            input.totalValueInCents,
            totals.serviceId,
            input.kind ?? null,
            totals.totalSessions,
            input.planType ?? null,
            id,
            input.maxInstallments ?? null,
          ],
        );
        await repositoryContext.writeTemplateServices(
          client,
          clinicId,
          id,
          input.services,
        );
        const saved = await client.query<PlanTemplateRow>(
          `SELECT ${planTemplateColumns} FROM plan_templates WHERE id=$1`,
          [id],
        );
        const item = mapPlanTemplate(saved.rows[0]!);
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "plan_template.created",
          "plan_template",
          item.id,
          { ...item },
        );
        return item;
      });
    },

    async updatePlanTemplate(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: PlanTemplateUpdate,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const result = await client.query<PlanTemplateRow>(
          `SELECT ${planTemplateColumns} FROM plan_templates WHERE clinic_id=$1 AND id=$2 FOR UPDATE`,
          [clinicId, id],
        );
        if (!result.rows[0]) return null;
        const previous = mapPlanTemplate(result.rows[0]);
        const item = {
          ...previous,
          ...input,
          services: input.services ?? previous.services,
        };
        if (item.active || item.services.length)
          planTemplateInputSchema.parse(item);
        if (input.services || input.active)
          await repositoryContext.assertTemplateServices(
            client,
            clinicId,
            item.services,
          );
        const totalSessions = item.services.reduce(
          (sum, entry) => sum + entry.totalSessions,
          0,
        );
        await client.query(
          `UPDATE plan_templates SET name=$3,total_value_in_cents=$4,service_id=$5,kind=$6,total_sessions=$7,active=$8,plan_type=$9,max_installments=$10,updated_at=NOW(6)
        WHERE clinic_id=$1 AND id=$2`,
          [
            clinicId,
            id,
            item.name,
            item.totalValueInCents,
            item.services[0]?.serviceId ?? null,
            item.kind ?? null,
            totalSessions || null,
            item.active,
            item.planType ?? null,
            item.maxInstallments ?? null,
          ],
        );
        if (input.services)
          await repositoryContext.writeTemplateServices(
            client,
            clinicId,
            id,
            input.services,
          );
        const updated = await client.query<PlanTemplateRow>(
          `SELECT ${planTemplateColumns} FROM plan_templates WHERE id=$1`,
          [id],
        );
        const saved = mapPlanTemplate(updated.rows[0]!);
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "plan_template.updated",
          "plan_template",
          id,
          { ...saved, previous },
        );
        return saved;
      });
    },

    async listPlanCatalog(clinicId: string) {
      const result = await repositoryContext.pool.query<PlanCatalogRow>(
        `SELECT ${planCatalogColumns} FROM plan_catalog WHERE clinic_id = $1`,
        [clinicId],
      );
      return result.rows
        .map(mapPlanCatalog)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },

    async createPlanCatalogEntry(
      clinicId: string,
      actorUserId: string,
      input: PlanCatalogInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const result = await writeAndRead<PlanCatalogRow>(
          client,
          `INSERT INTO plan_catalog (clinic_id, name, total_value_in_cents, id)
         VALUES ($1, $2, $3, $4)`,
          [clinicId, input.name, input.totalValueInCents, randomUUID()],
          `SELECT ${planCatalogColumns} FROM plan_catalog WHERE id = $4`,
        );
        const entry = mapPlanCatalog(result.rows[0]!);
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "plan_catalog.created",
          "plan_catalog",
          entry.id,
          { ...input },
        );
        return entry;
      });
    },

    async updatePlanCatalogEntry(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: PlanCatalogInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const result = await writeAndRead<PlanCatalogRow>(
          client,
          `UPDATE plan_catalog SET name = $3, total_value_in_cents = $4, updated_at = NOW(6)
         WHERE clinic_id = $1 AND id = $2`,
          [clinicId, id, input.name, input.totalValueInCents],
          `SELECT ${planCatalogColumns} FROM plan_catalog WHERE clinic_id = $1 AND id = $2`,
        );
        if (!result.rows[0]) return null;
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "plan_catalog.updated",
          "plan_catalog",
          id,
          { ...input },
        );
        return mapPlanCatalog(result.rows[0]);
      });
    },

    async deletePlanCatalogEntry(
      clinicId: string,
      actorUserId: string,
      id: string,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const result = await client.query<{ name: string }>(
          "SELECT name FROM plan_catalog WHERE clinic_id = $1 AND id = $2 FOR UPDATE",
          [clinicId, id],
        );
        if (!result.rows[0]) return false;
        await client.query(
          "DELETE FROM plan_catalog WHERE clinic_id = $1 AND id = $2",
          [clinicId, id],
        );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "plan_catalog.deleted",
          "plan_catalog",
          id,
          { name: result.rows[0].name },
        );
        return true;
      });
    },

    async listPatientPlans(clinicId: string, patientId?: string) {
      await repositoryContext.pool.query(
        `UPDATE patient_plans SET status = 'expired', updated_at = NOW(6)
       WHERE clinic_id = $1 AND status = 'active' AND valid_until < ${localToday()}`,
        [clinicId],
      );
      const result = await repositoryContext.pool.query<
        PatientPlanRow & { paymentSummary: unknown }
      >(
        `SELECT ${patientPlanColumns},
         (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE JSON_OBJECT(
             'installmentCount', count(*),
             'paidCount', CAST(SUM(r.status = 'paid') AS SIGNED),
             'openCount', CAST(SUM(r.status = 'open') AS SIGNED),
             'overdueCount', CAST(SUM(r.status = 'open'
               AND r.due_date < ${localToday()}) AS SIGNED),
             'paidInCents', CAST(coalesce(SUM(CASE WHEN r.status = 'paid' THEN r.amount_in_cents END), 0) AS SIGNED),
             'openInCents', CAST(coalesce(SUM(CASE WHEN r.status = 'open' THEN r.amount_in_cents END), 0) AS SIGNED)
           ) END
          FROM receivables r
          WHERE r.clinic_id = pp.clinic_id AND r.plan_id = pp.id
            AND r.status <> 'cancelled') AS "paymentSummary"
       FROM patient_plans pp
       JOIN patients p ON p.id = pp.patient_id
       JOIN services s ON s.id = pp.service_id
       WHERE pp.clinic_id = $1
         -- Planos do cliente valem em todas as filiais (cadastro único).
         AND CASE WHEN $2 IS NULL THEN ${branchClause("pp.branch_id", 3)}
                  ELSE pp.patient_id = $2 END
       ORDER BY pp.created_at DESC`,
        [clinicId, patientId ?? null, repositoryContext.branchReadIds()],
      );
      return result.rows.map(({ paymentSummary, ...row }) => ({
        ...mapPatientPlan(row),
        ...(paymentSummary
          ? { paymentSummary: json<PlanPaymentSummary>(paymentSummary) }
          : {}),
      }));
    },

    async createPatientPlan(
      clinicId: string,
      actorUserId: string,
      input: PatientPlanInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const planId = await repositoryContext.insertPatientPlan(
          client,
          clinicId,
          actorUserId,
          input,
          "Crédito inicial do plano",
        );
        return (await repositoryContext.findPatientPlan(
          client,
          clinicId,
          planId,
        ))!;
      });
    },

    async renewPatientPlan(
      clinicId: string,
      actorUserId: string,
      planId: string,
      input: PlanRenewalInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const current = await repositoryContext.lockRenewablePlan(
          client,
          clinicId,
          planId,
        );
        if (!current) return null;
        const renewedId = await repositoryContext.insertPatientPlan(
          client,
          clinicId,
          actorUserId,
          {
            ...input,
            patientId: current.patientId,
            kind: current.kind,
            planTemplateId: current.planTemplateId,
          },
          "Crédito da renovação do plano",
          current.id,
        );
        return repositoryContext.findPatientPlan(client, clinicId, renewedId);
      });
    },

    async updatePatientPlanAutoRenew(
      clinicId: string,
      _actorUserId: string,
      planId: string,
      autoRenew: boolean,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const plan = autoRenew
          ? await repositoryContext.lockRenewablePlan(client, clinicId, planId)
          : await repositoryContext.findPatientPlan(client, clinicId, planId);
        if (!plan) return null;
        if (plan.sourceTabId)
          throw new DomainError(
            "TAB_PLAN_MANAGED",
            "O serviço avulso deve ser administrado pela comanda de origem.",
            409,
          );
        if (autoRenew && plan.status === "expired") {
          throw new DomainError(
            "PLAN_EXPIRED",
            "Um plano vencido deve ser renovado manualmente.",
            409,
          );
        }
        if (autoRenew && !plan.validUntil) {
          throw new DomainError(
            "PLAN_WITHOUT_END",
            "A renovação automática exige o fim da validade.",
            409,
          );
        }
        if (plan.autoRenew === autoRenew) return plan;
        await client.query(
          `UPDATE patient_plans SET auto_renew = $3, updated_at = NOW(6)
         WHERE clinic_id = $1 AND id = $2`,
          [clinicId, planId, autoRenew],
        );
        return repositoryContext.findPatientPlan(client, clinicId, planId);
      });
    },

    async renewDuePatientPlans(clinicId: string, actorUserId: string) {
      let renewed = 0;
      // Cada rodada renova um período; sucessores ainda vencidos voltam na próxima,
      // recuperando períodos perdidos. O limite evita laço infinito por dado inconsistente.
      for (let round = 0; round < 120; round += 1) {
        const due = await repositoryContext.pool.query<{ id: string }>(
          `SELECT pp.id
         FROM patient_plans pp
         WHERE pp.clinic_id = $1 AND pp.auto_renew
           AND pp.status IN ('active', 'expired')
           AND pp.valid_until < ${localToday()}
           AND NOT EXISTS (
             SELECT 1 FROM patient_plans n WHERE n.renewed_from_plan_id = pp.id
           )
         ORDER BY pp.valid_until`,
          [clinicId],
        );
        if (!due.rowCount) break;
        for (const { id } of due.rows) {
          const created = await repositoryContext.inTransaction(
            async (client) => {
              // Trava primeiro e só depois relê: a nova leitura enxerga o sucessor
              // criado por uma requisição concorrente que acabou de confirmar.
              await client.query(
                "SELECT 1 FROM patient_plans WHERE clinic_id = $1 AND id = $2 FOR UPDATE",
                [clinicId, id],
              );
              const plan = await repositoryContext.findPatientPlan(
                client,
                clinicId,
                id,
              );
              const period = plan && nextPlanPeriod(plan);
              if (!plan?.autoRenew || plan.renewedByPlanId || !period)
                return false;
              const eligible = await client.query(
                `SELECT 1 FROM patients p, services s
             WHERE p.id = $2 AND p.clinic_id = $1 AND p.status = 'active'
               AND s.id = $3 AND s.clinic_id = $1 AND s.active = true
               AND NOT EXISTS (SELECT 1 FROM patient_plan_services x JOIN services xs ON xs.id=x.service_id WHERE x.plan_id=$4 AND NOT xs.active)`,
                [clinicId, plan.patientId, plan.serviceId, plan.id],
              );
              if (!eligible.rowCount) {
                // Cliente inativo ou serviço desativado: para de tentar renovar.
                await client.query(
                  `UPDATE patient_plans SET auto_renew = false, updated_at = NOW(6)
               WHERE clinic_id = $1 AND id = $2`,
                  [clinicId, id],
                );
                return false;
              }
              await repositoryContext.insertPatientPlan(
                client,
                clinicId,
                actorUserId,
                {
                  patientId: plan.patientId,
                  name: plan.name,
                  ...(plan.planTemplateId
                    ? { planTemplateId: plan.planTemplateId }
                    : {}),
                  kind: plan.kind,
                  services: plan.services.map(
                    ({ serviceId, totalSessions, totalValueInCents }) => ({
                      serviceId,
                      totalSessions,
                      totalValueInCents,
                    }),
                  ),
                  totalValueInCents: plan.totalValueInCents,
                  installments: plan.installments,
                  // A renovação segue as formas de pagamento combinadas.
                  ...(plan.paymentMethod
                    ? { paymentMethod: plan.paymentMethod }
                    : {}),
                  ...(plan.paymentParts
                    ? { paymentParts: plan.paymentParts }
                    : {}),
                  autoRenew: true,
                  ...period,
                },
                "Crédito da renovação automática",
                id,
              );
              return true;
            },
          );
          if (created) renewed += 1;
        }
      }
      return renewed;
    },

    async updatePatientPlanStatus(
      clinicId: string,
      actorUserId: string,
      planId: string,
      status: PlanStatus,
      pause: PlanPauseDetails = {},
      cancellation: PlanCancellationDetails = {},
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<{
          status: PlanStatus;
          sourceTabId: string | null;
          totalValueInCents: number;
        }>(
          'SELECT status, source_tab_id AS "sourceTabId", total_value_in_cents AS "totalValueInCents" FROM patient_plans WHERE clinic_id = $1 AND id = $2 FOR UPDATE',
          [clinicId, planId],
        );
        if (!current.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        if (current.rows[0].sourceTabId)
          throw new DomainError(
            "TAB_PLAN_MANAGED",
            "O serviço avulso deve ser administrado pela comanda de origem.",
            409,
          );
        if (current.rows[0].status === "cancelled" && status !== "cancelled") {
          throw new DomainError(
            "PLAN_CANCELLED",
            "Um plano cancelado não pode ser reativado.",
            409,
          );
        }
        if (current.rows[0].status === status) {
          const unchanged = await repositoryContext.findPatientPlan(
            client,
            clinicId,
            planId,
          );
          await client.query("COMMIT");
          return unchanged;
        }
        if (status === "cancelled")
          assertRefundWithinPlan(current.rows[0], cancellation.refundedInCents);
        const refundedInCents =
          status === "cancelled" ? (cancellation.refundedInCents ?? 0) : 0;
        const cancellationValue =
          status === "cancelled"
            ? (
                await client.query<{ amountInCents: number }>(
                  `SELECT CAST(COALESCE(SUM(amount_in_cents),0) AS SIGNED) AS "amountInCents"
                 FROM receivables
                 WHERE clinic_id=$1 AND plan_id=$2 AND status='open'`,
                  [clinicId, planId],
                )
              ).rows[0]!.amountInCents
            : 0;
        // Pausa grava início, motivo e retorno; ao reativar, a validade avança os dias
        // em pausa (datas no fuso da clínica) e a pausa é limpa (U29).
        // No MySQL o SET enxerga os valores já alterados: a validade (que lê o status e o
        // início da pausa anteriores) vem antes deles.
        await client.query(
          `UPDATE patient_plans pp
         SET valid_until = CASE
               WHEN $3 = 'active' AND pp.status = 'paused' AND pp.paused_at IS NOT NULL AND pp.valid_until IS NOT NULL
               THEN DATE_ADD(pp.valid_until, INTERVAL GREATEST(0, DATEDIFF(${localToday()}, ${localDate("pp.paused_at")})) DAY)
               ELSE pp.valid_until END,
             status = $3, updated_at = NOW(6),
             cancelled_at = CASE WHEN $3 = 'cancelled' THEN NOW(6) ELSE cancelled_at END,
             cancelled_value_in_cents = CASE WHEN $3 = 'cancelled' THEN $4 ELSE cancelled_value_in_cents END,
             refunded_in_cents = CASE WHEN $3 = 'cancelled' THEN $7 ELSE refunded_in_cents END,
             refund_note = CASE WHEN $3 = 'cancelled' THEN NULLIF($8, '') ELSE refund_note END,
             paused_at = CASE WHEN $3 = 'paused' THEN NOW(6) ELSE NULL END,
             pause_reason = CASE WHEN $3 = 'paused' THEN NULLIF($5, '') ELSE NULL END,
             pause_expected_return = CASE WHEN $3 = 'paused' THEN NULLIF($6, '') ELSE NULL END
         WHERE pp.clinic_id = $1 AND pp.id = $2`,
          [
            clinicId,
            planId,
            status,
            cancellationValue,
            pause.reason ?? "",
            pause.expectedReturn ?? "",
            refundedInCents,
            refundedInCents ? (cancellation.refundNote ?? "") : "",
          ],
        );
        if (status === "cancelled") {
          const cancelled = await client.query<{
            id: string;
            amountInCents: number;
          }>(
            `SELECT id, amount_in_cents AS "amountInCents" FROM receivables
           WHERE clinic_id = $1 AND plan_id = $2 AND status = 'open' FOR UPDATE`,
            [clinicId, planId],
          );
          await client.query(
            `UPDATE receivables SET status = 'cancelled', updated_at = NOW(6)
           WHERE clinic_id = $1 AND plan_id = $2 AND status = 'open'`,
            [clinicId, planId],
          );
          for (const receivable of cancelled.rows) {
            await client.query(
              `INSERT INTO financial_events
               (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents)
             VALUES ($1, $2, $3, 'cancellation', $4)`,
              [clinicId, receivable.id, actorUserId, -receivable.amountInCents],
            );
          }
          if (refundedInCents)
            await recordRefundPayable(
              client,
              clinicId,
              actorUserId,
              planId,
              refundedInCents,
              cancellation.refundPaymentMethod!,
              cancellation.refundNote,
            );
        }
        const plan = await repositoryContext.findPatientPlan(
          client,
          clinicId,
          planId,
        );
        await client.query("COMMIT");
        return plan;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listSessionMovements(clinicId: string, planId: string) {
      const result = await repositoryContext.pool.query<SessionMovementRow>(
        `SELECT sm.id, sm.plan_id AS "planId", sm.appointment_id AS "appointmentId",sm.group_attendance_id AS "groupAttendanceId",
              sm.kind, sm.quantity, sm.reason, sm.service_id AS "serviceId", pps.service_name AS "serviceName", sm.created_at AS "createdAt"
       FROM session_movements sm
       JOIN patient_plans pp ON pp.id = sm.plan_id
       JOIN patient_plan_services pps ON pps.plan_id = sm.plan_id AND pps.service_id = sm.service_id
       WHERE sm.clinic_id = $1 AND sm.plan_id = $2 AND pp.clinic_id = $1
       ORDER BY sm.created_at DESC`,
        [clinicId, planId],
      );
      return result.rows.map((row): SessionMovement => ({
        id: row.id,
        planId: row.planId,
        ...(row.groupAttendanceId
          ? { groupAttendanceId: row.groupAttendanceId }
          : {}),
        ...(row.appointmentId ? { appointmentId: row.appointmentId } : {}),
        kind: row.kind,
        quantity: row.quantity,
        serviceId: row.serviceId,
        serviceName: row.serviceName,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      }));
    },
  };
}
