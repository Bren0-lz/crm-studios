import {
  type AppointmentVisitType,
  type DashboardSummary,
  type ManagementReport,
  type PatientPlanService,
  type ReceivedPayment,
  type SaleMovement,
  type SalesReport,
  type SalesPeriodReport,
  type TeamProductionSources,
  allocatePlanRevenue,
} from "@crm/contracts";
import { competencesBetween } from "../../modules/reports/team-finance.js";
import {
  buildSalesReport,
  buildSalesPeriodReport,
  patientSalesHistory,
  salesPeriodBounds,
  withContractedHistory,
  withPatientContacts,
  salesReportBounds,
} from "../../modules/reports/sales-report.js";
import type { PostgresRepositoryContext } from "./context.js";
import {
  type AppointmentRow,
  appointmentColumns,
  appointmentJoins,
  branchClause,
  mapAppointment,
} from "./helpers.js";

type PlanSaleRow = {
  id: string;
  patientId: string;
  patientName: string;
  name: string;
  serviceName: string;
  totalValueInCents: number;
  cancelledValueInCents: number;
  createdAt: Date;
  cancelledAt: Date | null;
};

type TabSaleRow = {
  id: string;
  tabId: string;
  patientId: string;
  patientName: string;
  productName: string;
  sourceType: "product" | "service";
  quantity: number;
  amountInCents: number;
  closedAt: Date;
  cancelledAt: Date | null;
  receivableId: string | null;
};

function toSales(planRows: PlanSaleRow[], tabRows: TabSaleRow[]) {
  const sales: SaleMovement[] = [];
  for (const plan of planRows) {
    const base = {
      sourceId: plan.id,
      sourceType: "plan" as const,
      patientId: plan.patientId,
      patientName: plan.patientName,
      itemName: `${plan.name} (${plan.serviceName})`,
      quantity: 1,
    };
    sales.push({
      ...base,
      id: `${plan.id}:sale`,
      kind: "sale",
      occurredAt: plan.createdAt.toISOString(),
      amountInCents: plan.totalValueInCents,
    });
    if (plan.cancelledAt)
      sales.push({
        ...base,
        id: `${plan.id}:cancellation`,
        kind: "cancellation",
        occurredAt: plan.cancelledAt.toISOString(),
        amountInCents: -plan.cancelledValueInCents,
      });
  }
  for (const item of tabRows) {
    const base = {
      sourceId: item.tabId,
      sourceType: item.sourceType,
      patientId: item.patientId,
      patientName: item.patientName,
      itemName: item.productName,
      quantity: item.quantity,
      ...(item.receivableId ? { receivableId: item.receivableId } : {}),
    };
    sales.push({
      ...base,
      id: `${item.id}:sale`,
      kind: "sale",
      occurredAt: item.closedAt.toISOString(),
      amountInCents: item.amountInCents,
    });
    if (item.cancelledAt)
      sales.push({
        ...base,
        id: `${item.id}:cancellation`,
        kind: "cancellation",
        occurredAt: item.cancelledAt.toISOString(),
        amountInCents: -item.amountInCents,
      });
  }
  return sales;
}

export function createReportsRepository(
  repositoryContext: PostgresRepositoryContext,
) {
  /** Vendas de todo o histórico dos clientes informados (planos e comandas). */
  async function patientSales(clinicId: string, patientIds: string[]) {
    const branchIds = repositoryContext.branchReadIds();
    const [plans, tabs] = await Promise.all([
      repositoryContext.pool.query<PlanSaleRow>(
        `SELECT pp.id, pp.patient_id AS "patientId", p.full_name AS "patientName",
                pp.name, (SELECT string_agg(x.service_name, ', ' ORDER BY x.position) FROM patient_plan_services x WHERE x.plan_id=pp.id) AS "serviceName",
                pp.total_value_in_cents AS "totalValueInCents",
                pp.cancelled_value_in_cents AS "cancelledValueInCents",
                pp.created_at AS "createdAt", pp.cancelled_at AS "cancelledAt"
         FROM patient_plans pp
         JOIN patients p ON p.id=pp.patient_id
         JOIN services s ON s.id=pp.service_id
         WHERE pp.clinic_id=$1 AND pp.patient_id = ANY($2::uuid[]) AND pp.source_tab_id IS NULL AND ${branchClause("pp.branch_id", 3)}`,
        [clinicId, patientIds, branchIds],
      ),
      repositoryContext.pool.query<TabSaleRow>(
        `SELECT i.id, t.id AS "tabId", t.patient_id AS "patientId", 'product'::text AS "sourceType",
                p.full_name AS "patientName", pr.name AS "productName",
                i.quantity, (i.quantity*i.unit_price_in_cents)::int AS "amountInCents",
                t.closed_at AS "closedAt", t.cancelled_at AS "cancelledAt",
                t.receivable_id AS "receivableId"
         FROM patient_tab_items i
         JOIN patient_tabs t ON t.id=i.tab_id
         JOIN patients p ON p.id=t.patient_id
         JOIN products pr ON pr.id=i.product_id
         WHERE t.clinic_id=$1 AND t.patient_id = ANY($2::uuid[]) AND t.closed_at IS NOT NULL AND ${branchClause("t.branch_id", 3)}
         UNION ALL SELECT i.id,t.id,t.patient_id,'service'::text,p.full_name,i.service_name,1,i.amount_in_cents,t.closed_at,t.cancelled_at,t.receivable_id FROM patient_tab_services i JOIN patient_tabs t ON t.id=i.tab_id AND t.clinic_id=i.clinic_id JOIN patients p ON p.id=t.patient_id AND p.clinic_id=t.clinic_id WHERE t.clinic_id=$1 AND t.patient_id = ANY($2::uuid[]) AND t.closed_at IS NOT NULL AND ${branchClause("t.branch_id", 3)}`,
        [clinicId, patientIds, branchIds],
      ),
    ]);
    return toSales(plans.rows, tabs.rows);
  }
  async function salesSources(
    clinicId: string,
    input: string | { from: string; to: string },
  ) {
    const asOf = new Date();
    const bounds =
      typeof input === "string"
        ? salesReportBounds(input, asOf)
        : salesPeriodBounds(input.from, input.to, asOf);
    const branchIds = repositoryContext.branchReadIds();
    const client = await repositoryContext.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const planResult = await client.query<PlanSaleRow>(
        `SELECT pp.id, pp.patient_id AS "patientId", p.full_name AS "patientName",
                pp.name, (SELECT string_agg(x.service_name, ', ' ORDER BY x.position) FROM patient_plan_services x WHERE x.plan_id=pp.id) AS "serviceName",
                pp.total_value_in_cents AS "totalValueInCents",
                pp.cancelled_value_in_cents AS "cancelledValueInCents",
                pp.created_at AS "createdAt", pp.cancelled_at AS "cancelledAt"
         FROM patient_plans pp
         JOIN patients p ON p.id=pp.patient_id
         JOIN services s ON s.id=pp.service_id
         WHERE pp.clinic_id=$1 AND pp.source_tab_id IS NULL AND ${branchClause("pp.branch_id", 4)} AND (
           (pp.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           OR (pp.cancelled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
         )`,
        [clinicId, bounds.previousFrom, bounds.currentTo, branchIds],
      );
      const productResult = await client.query<TabSaleRow>(
        `SELECT i.id, t.id AS "tabId", t.patient_id AS "patientId", 'product'::text AS "sourceType",
                p.full_name AS "patientName", pr.name AS "productName",
                i.quantity, (i.quantity*i.unit_price_in_cents)::int AS "amountInCents",
                t.closed_at AS "closedAt", t.cancelled_at AS "cancelledAt",
                t.receivable_id AS "receivableId"
         FROM patient_tab_items i
         JOIN patient_tabs t ON t.id=i.tab_id
         JOIN patients p ON p.id=t.patient_id
         JOIN products pr ON pr.id=i.product_id
         WHERE t.clinic_id=$1 AND t.closed_at IS NOT NULL AND ${branchClause("t.branch_id", 4)} AND (
           (t.closed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           OR (t.cancelled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
         ) UNION ALL SELECT i.id,t.id,t.patient_id,'service'::text,p.full_name,i.service_name,1,i.amount_in_cents,t.closed_at,t.cancelled_at,t.receivable_id FROM patient_tab_services i JOIN patient_tabs t ON t.id=i.tab_id AND t.clinic_id=i.clinic_id JOIN patients p ON p.id=t.patient_id AND p.clinic_id=t.clinic_id WHERE t.clinic_id=$1 AND t.closed_at IS NOT NULL AND ${branchClause("t.branch_id", 4)} AND ((t.closed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date OR (t.cancelled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date)`,
        [clinicId, bounds.previousFrom, bounds.currentTo, branchIds],
      );
      const paymentResult = await client.query<{
        id: string;
        receivableId: string;
        kind: "payment" | "payment_reversal";
        patientId: string;
        patientName: string;
        planId: string | null;
        tabId: string | null;
        description: string;
        amountInCents: number;
        occurredAt: Date;
        paymentMethod: ReceivedPayment["paymentMethod"] | null;
      }>(
        `SELECT fe.id, fe.receivable_id AS "receivableId", fe.kind,
                r.patient_id AS "patientId", p.full_name AS "patientName",
                r.plan_id AS "planId", t.id AS "tabId", r.description,
                fe.amount_in_cents AS "amountInCents", coalesce(dc.occurred_at,fe.occurred_at,fe.created_at) AS "occurredAt",
                fe.metadata->>'paymentMethod' AS "paymentMethod"
         FROM financial_events fe
         LEFT JOIN LATERAL (SELECT occurred_at FROM financial_date_corrections WHERE clinic_id=fe.clinic_id AND receivable_event_id=fe.id ORDER BY revision DESC LIMIT 1) dc ON true
         JOIN receivables r ON r.id=fe.receivable_id
         JOIN patients p ON p.id=r.patient_id
         LEFT JOIN patient_tabs t ON t.receivable_id=r.id
         WHERE fe.clinic_id=$1 AND fe.kind IN ('payment','payment_reversal') AND ${branchClause("r.branch_id", 4)} AND
           (coalesce(dc.occurred_at,fe.occurred_at,fe.created_at) AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date`,
        [clinicId, bounds.previousFrom, bounds.currentTo, branchIds],
      );
      const appointmentResult = await client.query<AppointmentRow>(
        `SELECT ${appointmentColumns} FROM appointments a ${appointmentJoins}
         WHERE a.clinic_id=$1 AND a.patient_id IS NOT NULL AND ${branchClause("a.branch_id", 5)} AND (
           (a.status='completed' AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date)
           OR (a.status IN ('scheduled','confirmed') AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= $4::date)
         )`,
        [
          clinicId,
          bounds.previousFrom,
          bounds.currentTo,
          bounds.today,
          branchIds,
        ],
      );
      await client.query("COMMIT");
      const sales = toSales(planResult.rows, productResult.rows);
      const payments: ReceivedPayment[] = paymentResult.rows.map((item) => ({
        id: item.id,
        receivableId: item.receivableId,
        kind: item.kind === "payment" ? "payment" : "reversal",
        ...(item.planId || item.tabId
          ? { sourceId: item.planId ?? item.tabId! }
          : {}),
        occurredAt: item.occurredAt.toISOString(),
        patientId: item.patientId,
        patientName: item.patientName,
        description: item.description,
        amountInCents: item.amountInCents,
        ...(item.paymentMethod ? { paymentMethod: item.paymentMethod } : {}),
      }));
      return {
        sales,
        payments,
        appointments: appointmentResult.rows.map(mapAppointment),
        asOf,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async getDashboard(
      clinicId: string,
      date: string,
      professionalIds?: readonly string[],
    ): Promise<DashboardSummary> {
      const scope = professionalIds ? [...professionalIds] : null;
      const branchIds = repositoryContext.branchReadIds();
      const [totals, patients, nextAppointments] = await Promise.all([
        repositoryContext.pool.query<{
          appointmentsToday: number;
          nonCancelledAppointmentsToday: number;
          pendingToday: number;
          awaitingConfirmationToday: number;
          completedToday: number;
          noShowsThisMonth: number;
        }>(
          `
          SELECT
            count(*) FILTER (
              WHERE a.starts_at >= ($2::date::timestamp AT TIME ZONE c.timezone)
                AND a.starts_at < (($2::date + 1)::timestamp AT TIME ZONE c.timezone)
            )::int AS "appointmentsToday",
            count(*) FILTER (
              WHERE a.starts_at >= ($2::date::timestamp AT TIME ZONE c.timezone)
                AND a.starts_at < (($2::date + 1)::timestamp AT TIME ZONE c.timezone)
                AND a.status <> 'cancelled'
            )::int AS "nonCancelledAppointmentsToday",
            count(*) FILTER (
              WHERE a.starts_at >= ($2::date::timestamp AT TIME ZONE c.timezone)
                AND a.starts_at < (($2::date + 1)::timestamp AT TIME ZONE c.timezone)
                AND a.status IN ('scheduled', 'confirmed')
            )::int AS "pendingToday",
            count(*) FILTER (
              WHERE a.starts_at >= ($2::date::timestamp AT TIME ZONE c.timezone)
                AND a.starts_at < (($2::date + 1)::timestamp AT TIME ZONE c.timezone)
                AND a.status = 'scheduled'
            )::int AS "awaitingConfirmationToday",
            count(*) FILTER (
              WHERE a.starts_at >= ($2::date::timestamp AT TIME ZONE c.timezone)
                AND a.starts_at < (($2::date + 1)::timestamp AT TIME ZONE c.timezone)
                AND a.status = 'completed'
            )::int AS "completedToday",
            count(*) FILTER (
              WHERE a.starts_at >= (date_trunc('month', $2::date)::timestamp AT TIME ZONE c.timezone)
                AND a.starts_at < ((date_trunc('month', $2::date) + interval '1 month')::timestamp AT TIME ZONE c.timezone)
                AND a.status = 'no_show'
            )::int AS "noShowsThisMonth"
          FROM clinics c
          LEFT JOIN appointments a ON a.clinic_id = c.id AND ${branchClause("a.branch_id", 3)}
            AND ($4::uuid[] IS NULL OR a.professional_id = ANY($4::uuid[]))
          WHERE c.id = $1
          GROUP BY c.id
        `,
          [clinicId, date, branchIds, scope],
        ),
        repositoryContext.pool.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM patients WHERE clinic_id = $1 AND status = 'active'",
          [clinicId],
        ),
        repositoryContext.pool.query<AppointmentRow>(
          `
          SELECT ${appointmentColumns}
          FROM appointments a
          ${appointmentJoins}
          JOIN clinics c ON c.id = a.clinic_id
          WHERE a.clinic_id = $1
            AND ${branchClause("a.branch_id", 3)}
            AND a.starts_at >= ($2::date::timestamp AT TIME ZONE c.timezone)
            AND a.starts_at < (($2::date + 1)::timestamp AT TIME ZONE c.timezone)
            AND a.status IN ('scheduled', 'confirmed')
            AND ($4::uuid[] IS NULL OR a.professional_id = ANY($4::uuid[]))
          ORDER BY a.starts_at
          LIMIT 5
        `,
          [clinicId, date, branchIds, scope],
        ),
      ]);

      const summary = totals.rows[0] ?? {
        appointmentsToday: 0,
        nonCancelledAppointmentsToday: 0,
        pendingToday: 0,
        awaitingConfirmationToday: 0,
        completedToday: 0,
        noShowsThisMonth: 0,
      };
      return {
        date,
        ...summary,
        patientsActive: patients.rows[0]?.count ?? 0,
        nextAppointments: nextAppointments.rows.map(mapAppointment),
      };
    },

    async getSalesReport(
      clinicId: string,
      month: string,
    ): Promise<SalesReport> {
      const data = await salesSources(clinicId, month);
      return buildSalesReport(
        month,
        data.sales,
        data.payments,
        data.appointments,
        data.asOf,
      );
    },
    async getSalesPeriodReport(
      clinicId: string,
      from: string,
      to: string,
    ): Promise<SalesPeriodReport> {
      const data = await salesSources(clinicId, { from, to });
      const report = buildSalesPeriodReport(
        from,
        to,
        data.sales,
        data.payments,
        data.appointments,
        data.asOf,
      );
      const ids = report.patientsWithoutReturn.map((item) => item.patientId);
      if (!ids.length) return report;
      const [contacts, history] = await Promise.all([
        repositoryContext.pool.query<{
          id: string;
          phone: string;
          whatsapp: string | null;
        }>(
          `SELECT id, phone, whatsapp FROM patients
           WHERE clinic_id=$1 AND id = ANY($2::uuid[])`,
          [clinicId, ids],
        ),
        patientSales(clinicId, ids),
      ]);
      return withPatientContacts(
        withContractedHistory(report, history),
        new Map(
          contacts.rows.map((row) => [
            row.id,
            { phone: row.phone, whatsapp: row.whatsapp ?? undefined },
          ]),
        ),
      );
    },
    async listPatientSales(
      clinicId: string,
      patientId: string,
    ): Promise<SaleMovement[] | null> {
      const patient = await repositoryContext.pool.query(
        "SELECT 1 FROM patients WHERE clinic_id=$1 AND id=$2",
        [clinicId, patientId],
      );
      if (!patient.rowCount) return null;
      return patientSalesHistory(
        await patientSales(clinicId, [patientId]),
        patientId,
      );
    },

    async listTeamProduction(
      clinicId: string,
      from: string,
      to: string,
    ): Promise<TeamProductionSources> {
      const branchIds = repositoryContext.branchReadIds();
      const competences = competencesBetween(from, to);
      const consumedPlan = (column: string, value: string) =>
        `(SELECT sm.plan_id FROM session_movements sm WHERE sm.clinic_id=$1 AND sm.${column}=${value} AND sm.kind='consumption' ORDER BY sm.created_at LIMIT 1)`;
      const [sessions, commissions, pending] = await Promise.all([
        repositoryContext.pool.query<
          TeamProductionSources["sessions"][number] & { planId: string | null }
        >(
          `SELECT a.professional_id AS "professionalId",p.full_name AS "professionalName",a.service_id AS "serviceId",s.name AS "serviceName",${consumedPlan("appointment_id", "a.id")} AS "planId"
           FROM appointments a JOIN professionals p ON p.id=a.professional_id AND p.clinic_id=a.clinic_id JOIN services s ON s.id=a.service_id AND s.clinic_id=a.clinic_id
           WHERE a.clinic_id=$1 AND a.status='completed' AND a.patient_id IS NOT NULL AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date AND ${branchClause("a.branch_id", 4)}
           UNION ALL
           SELECT p.id,p.full_name,g.service_id,s.name,${consumedPlan("group_attendance_id", "ga.id")}
           FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id
           JOIN professionals p ON p.id=coalesce(gs.professional_id,g.professional_id) AND p.clinic_id=ga.clinic_id JOIN services s ON s.id=g.service_id AND s.clinic_id=g.clinic_id
           WHERE ga.clinic_id=$1 AND gs.status<>'cancelled' AND (ga.status='present' OR ga.outcome='present') AND (gs.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date AND ${branchClause("g.branch_id", 4)}`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<
          TeamProductionSources["commissions"][number]
        >(
          `SELECT ce.professional_id AS "professionalId",p.full_name AS "professionalName",ce.competence,ce.amount_in_cents AS "amountInCents",ce.status
           FROM commission_entries ce JOIN professionals p ON p.id=ce.professional_id AND p.clinic_id=ce.clinic_id
           WHERE ce.clinic_id=$1 AND ce.competence=ANY($2::text[]) AND ${branchClause("p.branch_id", 3)}`,
          [clinicId, competences, branchIds],
        ),
        // Mesma seleção de regra da geração de comissões, só para as sessões ainda sem comissão.
        repositoryContext.pool.query<
          TeamProductionSources["pendingCommissions"][number]
        >(
          `WITH sources AS (
             SELECT a.id AS appointment_id,NULL::uuid AS group_attendance_id,a.professional_id,a.service_id,a.starts_at FROM appointments a WHERE a.clinic_id=$1 AND a.status='completed' AND a.patient_id IS NOT NULL
             UNION ALL SELECT NULL::uuid,ga.id,coalesce(gs.professional_id,g.professional_id),g.service_id,gs.starts_at FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id WHERE ga.clinic_id=$1 AND gs.status<>'cancelled' AND (ga.status='present' OR ga.outcome='present')
           )
           SELECT pr.id AS "professionalId",pr.full_name AS "professionalName",CASE WHEN rule.kind='fixed' THEN rule.fixed_amount_in_cents ELSE round(s.price_in_cents*rule.percentage/100)::int END AS "amountInCents"
           FROM sources a JOIN clinics c ON c.id=$1 JOIN services s ON s.id=a.service_id AND s.clinic_id=$1 JOIN professionals pr ON pr.id=a.professional_id AND pr.clinic_id=$1
           JOIN LATERAL (SELECT cr.* FROM commission_rules cr WHERE cr.clinic_id=$1 AND (cr.professional_id=a.professional_id OR (pr.user_id IS NOT NULL AND cr.user_id=pr.user_id)) AND cr.active AND (cr.service_id IS NULL OR cr.service_id=a.service_id) AND cr.effective_from<=(a.starts_at AT TIME ZONE c.timezone)::date AND (cr.effective_until IS NULL OR cr.effective_until>=(a.starts_at AT TIME ZONE c.timezone)::date) ORDER BY (cr.user_id IS NOT NULL) DESC,(cr.service_id IS NOT NULL) DESC,cr.effective_from DESC LIMIT 1) rule ON true
           WHERE to_char(a.starts_at AT TIME ZONE c.timezone,'YYYY-MM')=ANY($2::text[]) AND ${branchClause("pr.branch_id", 3)}
             AND NOT EXISTS (SELECT 1 FROM commission_entries ce WHERE ce.clinic_id=$1 AND (ce.appointment_id=a.appointment_id OR ce.group_attendance_id=a.group_attendance_id))`,
          [clinicId, competences, branchIds],
        ),
      ]);
      return {
        sessions: sessions.rows.map(({ planId, ...row }) => ({
          ...row,
          ...(planId ? { planId } : {}),
        })),
        commissions: commissions.rows,
        pendingCommissions: pending.rows,
      };
    },

    async getManagementReport(
      clinicId: string,
      from: string,
      to: string,
    ): Promise<ManagementReport> {
      interface AppointmentAggregate {
        total: number;
        completed: number;
        noShows: number;
        cancelled: number;
      }
      interface BreakdownRow extends AppointmentAggregate {
        id: string;
        name: string;
      }
      const branchIds = repositoryContext.branchReadIds();
      // $4 = filiais da leitura em todas as consultas abaixo.
      const dateFilter = `(a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date AND ${branchClause("a.branch_id", 4)}`;
      const [
        appointmentResult,
        professionalResult,
        serviceResult,
        planResult,
        movementResult,
        financeResult,
        commercialResult,
        sourceResult,
      ] = await Promise.all([
        repositoryContext.pool.query<
          AppointmentAggregate &
            Record<AppointmentVisitType, number> & {
              trialsScheduled: number;
              trialsCompleted: number;
              trialsConverted: number;
            }
        >(
          `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS "noShows",
                COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
                COUNT(*) FILTER (WHERE a.visit_type = 'regular')::int AS regular,
                COUNT(*) FILTER (WHERE a.visit_type = 'trial')::int AS trial,
                COUNT(*) FILTER (WHERE a.visit_type = 'evaluation')::int AS evaluation,
                COUNT(*) FILTER (WHERE a.visit_type IN ('trial', 'evaluation')
                  AND a.status <> 'cancelled')::int AS "trialsScheduled",
                COUNT(*) FILTER (WHERE a.visit_type IN ('trial', 'evaluation')
                  AND a.status = 'completed')::int AS "trialsCompleted",
                COALESCE(SUM(CASE WHEN a.visit_type IN ('trial', 'evaluation')
                  AND a.status = 'completed' AND a.patient_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM patient_plans pp
                    WHERE pp.clinic_id = a.clinic_id AND pp.patient_id = a.patient_id
                      AND pp.created_at >= a.starts_at
                      AND pp.created_at <= a.starts_at + interval '30 days'
                  ) THEN 1 ELSE 0 END), 0)::int AS "trialsConverted"
         FROM appointments a WHERE a.clinic_id = $1 AND ${dateFilter}`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<BreakdownRow>(
          `SELECT pr.id, pr.full_name AS name, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS "noShows",
                COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled
         FROM appointments a JOIN professionals pr ON pr.id = a.professional_id
         WHERE a.clinic_id = $1 AND ${dateFilter}
         GROUP BY pr.id, pr.full_name ORDER BY total DESC`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<BreakdownRow>(
          `SELECT s.id, s.name, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS "noShows",
                COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled
         FROM appointments a JOIN services s ON s.id = a.service_id
         WHERE a.clinic_id = $1 AND ${dateFilter}
         GROUP BY s.id, s.name ORDER BY total DESC`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<{
          active: number;
          availableSessions: number;
        }>(
          `SELECT COUNT(*)::int AS active,
                COALESCE(SUM(remaining_sessions), 0)::int AS "availableSessions"
         FROM patient_plans WHERE clinic_id = $1 AND status = 'active'
           AND ${branchClause("branch_id", 2)}`,
          [clinicId, branchIds],
        ),
        repositoryContext.pool.query<{ consumed: number }>(
          `SELECT GREATEST(0, -COALESCE(SUM(sm.quantity), 0))::int AS consumed
         FROM session_movements sm
         WHERE sm.clinic_id = $1 AND sm.kind <> 'credit'
           AND EXISTS (SELECT 1 FROM patient_plans pb WHERE pb.id = sm.plan_id
             AND ${branchClause("pb.branch_id", 4)})
           AND (sm.created_at AT TIME ZONE 'America/Sao_Paulo')::date
               BETWEEN $2::date AND $3::date`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<{
          openInCents: number;
          overdueInCents: number;
          paidInPeriodInCents: number;
        }>(
          `SELECT
           COALESCE(SUM(amount_in_cents) FILTER (WHERE status = 'open'), 0)::int AS "openInCents",
           COALESCE(SUM(amount_in_cents) FILTER
             (WHERE status = 'open' AND due_date < CURRENT_DATE), 0)::int AS "overdueInCents",
           COALESCE((SELECT SUM(fe.amount_in_cents)
             FROM financial_events fe
         LEFT JOIN LATERAL (SELECT occurred_at FROM financial_date_corrections WHERE clinic_id=fe.clinic_id AND receivable_event_id=fe.id ORDER BY revision DESC LIMIT 1) dc ON true
             WHERE fe.clinic_id=$1 AND fe.kind IN ('payment','payment_reversal')
               AND EXISTS (SELECT 1 FROM receivables rb WHERE rb.id = fe.receivable_id
                 AND ${branchClause("rb.branch_id", 4)})
               AND (coalesce(dc.occurred_at,fe.occurred_at,fe.created_at) AT TIME ZONE 'America/Sao_Paulo')::date
                   BETWEEN $2::date AND $3::date), 0)::int AS "paidInPeriodInCents"
         FROM receivables WHERE clinic_id = $1 AND ${branchClause("branch_id", 4)}`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<{
          leadsCreated: number;
          won: number;
          lost: number;
          averageFirstResponseMinutes: number;
        }>(
          `SELECT COUNT(*)::int AS "leadsCreated",
                COUNT(*) FILTER (WHERE stage = 'won')::int AS won,
                COUNT(*) FILTER (WHERE stage = 'lost')::int AS lost,
                COALESCE(AVG(EXTRACT(EPOCH FROM (first_contact.occurred_at - leads.created_at)) / 60)
                  FILTER (WHERE first_contact.occurred_at IS NOT NULL), 0)::int
                  AS "averageFirstResponseMinutes"
         FROM leads
         LEFT JOIN LATERAL (
           SELECT MIN(lc.occurred_at) AS occurred_at
           FROM lead_contacts lc
           WHERE lc.lead_id = leads.id AND lc.direction <> 'internal'
         ) first_contact ON true
         WHERE clinic_id = $1 AND ${branchClause("leads.branch_id", 4)}
           AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date
               BETWEEN $2::date AND $3::date`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<{
          source: string;
          leads: number;
          won: number;
          lost: number;
        }>(
          `SELECT source, COUNT(*)::int AS leads,
                COUNT(*) FILTER (WHERE stage = 'won')::int AS won,
                COUNT(*) FILTER (WHERE stage = 'lost')::int AS lost
         FROM leads WHERE clinic_id = $1 AND ${branchClause("branch_id", 4)}
           AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date
               BETWEEN $2::date AND $3::date
         GROUP BY source ORDER BY leads DESC`,
          [clinicId, from, to, branchIds],
        ),
      ]);
      const [
        dreResult,
        productProfitResult,
        serviceProfitResult,
        operationResult,
      ] = await Promise.all([
        repositoryContext.pool.query<{
          serviceRevenueInCents: number;
          productRevenueInCents: number;
          productCostInCents: number;
          operatingExpensesInCents: number;
          commissionsInCents: number;
        }>(
          `WITH paid AS (
             SELECT r.* FROM receivables r WHERE r.clinic_id=$1 AND r.status='paid' AND ${branchClause("r.branch_id", 4)}
               AND (r.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           ), product_tabs AS (
             SELECT t.id,t.receivable_id FROM patient_tabs t JOIN paid r ON r.id=t.receivable_id
             WHERE t.status='closed'
           ) SELECT
             COALESCE((SELECT sum(amount_in_cents) FROM paid r WHERE NOT EXISTS(SELECT 1 FROM product_tabs t WHERE t.receivable_id=r.id)),0)::int AS "serviceRevenueInCents",
             COALESCE((SELECT sum(r.amount_in_cents) FROM paid r JOIN product_tabs t ON t.receivable_id=r.id),0)::int AS "productRevenueInCents",
             COALESCE((SELECT sum(i.quantity*i.unit_cost_in_cents) FROM patient_tab_items i JOIN product_tabs t ON t.id=i.tab_id),0)::int AS "productCostInCents",
             COALESCE((SELECT sum(amount_in_cents) FROM payables WHERE clinic_id=$1 AND status='paid' AND ${branchClause("branch_id", 4)} AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date),0)::int AS "operatingExpensesInCents",
             COALESCE((SELECT sum(amount_in_cents) FROM commission_entries ce WHERE clinic_id=$1 AND status='paid' AND EXISTS(SELECT 1 FROM professionals pb WHERE pb.id=ce.professional_id AND ${branchClause("pb.branch_id", 4)}) AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date),0)::int AS "commissionsInCents"`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<{
          id: string;
          name: string;
          unitsSold: number;
          revenueInCents: number;
          costInCents: number;
        }>(
          `SELECT p.id,p.name,sum(i.quantity)::int AS "unitsSold",sum(i.quantity*i.unit_price_in_cents)::int AS "revenueInCents",sum(i.quantity*i.unit_cost_in_cents)::int AS "costInCents"
           FROM patient_tab_items i JOIN products p ON p.id=i.product_id
           JOIN patient_tabs t ON t.id=i.tab_id JOIN receivables r ON r.id=t.receivable_id
           WHERE i.clinic_id=$1 AND t.status='closed' AND r.status='paid' AND ${branchClause("t.branch_id", 4)}
             AND (r.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           GROUP BY p.id,p.name ORDER BY "revenueInCents" DESC`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<{
          id: string;
          name: string;
          completedAppointments: number;
          revenueInCents: number;
          commissionsInCents: number;
        }>(
          `SELECT s.id,s.name,
             (SELECT count(*)::int FROM appointments a WHERE a.clinic_id=$1 AND a.service_id=s.id AND a.status='completed' AND ${branchClause("a.branch_id", 4)} AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date) AS "completedAppointments",
             0::int AS "revenueInCents",
             (SELECT coalesce(sum(c.amount_in_cents),0)::int FROM commission_entries c JOIN appointments a ON a.id=c.appointment_id WHERE c.clinic_id=$1 AND a.service_id=s.id AND ${branchClause("a.branch_id", 4)} AND c.status='paid' AND (c.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date) AS "commissionsInCents"
           FROM services s WHERE s.clinic_id=$1
           ORDER BY "revenueInCents" DESC`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<{
          activeGroupSeats: number;
          totalGroupCapacity: number;
          waitlistCount: number;
          lowStockCount: number;
          averageReceiptInCents: number;
        }>(
          `SELECT
             (SELECT count(*)::int FROM group_enrollments e JOIN group_classes g ON g.id=e.group_id WHERE e.clinic_id=$1 AND e.status='active' AND g.active AND ${branchClause("g.branch_id", 4)}) AS "activeGroupSeats",
             (SELECT coalesce(sum(capacity),0)::int FROM group_classes WHERE clinic_id=$1 AND active AND ${branchClause("branch_id", 4)}) AS "totalGroupCapacity",
             (SELECT count(*)::int FROM group_enrollments e JOIN group_classes g ON g.id=e.group_id WHERE e.clinic_id=$1 AND e.status='waitlisted' AND g.active AND ${branchClause("g.branch_id", 4)}) AS "waitlistCount",
             (SELECT count(*)::int FROM products WHERE clinic_id=$1 AND active AND current_stock<=0 AND ${branchClause("branch_id", 4)}) AS "lowStockCount",
             (SELECT coalesce(avg(amount_in_cents),0)::int FROM receivables WHERE clinic_id=$1 AND status='paid' AND ${branchClause("branch_id", 4)} AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date) AS "averageReceiptInCents"`,
          [clinicId, from, to, branchIds],
        ),
      ]);
      const attendanceRate = (completed: number, noShows: number) => {
        const decided = completed + noShows;
        return decided ? Math.round((completed / decided) * 100) : 0;
      };
      const appointment = appointmentResult.rows[0]!;
      const plan = planResult.rows[0]!;
      const finance = financeResult.rows[0]!;
      const commercial = commercialResult.rows[0]!;
      const mapBreakdown = (row: BreakdownRow) => ({
        id: row.id,
        name: row.name,
        appointments: row.total,
        completed: row.completed,
        noShows: row.noShows,
        attendanceRate: attendanceRate(row.completed, row.noShows),
      });
      const percentage = (part: number, total: number) =>
        total ? Math.round((part / total) * 1000) / 10 : 0;
      const dre = dreResult.rows[0]!;
      const grossRevenueInCents =
        dre.serviceRevenueInCents + dre.productRevenueInCents;
      const grossProfitInCents = grossRevenueInCents - dre.productCostInCents;
      const netResultInCents =
        grossProfitInCents -
        dre.operatingExpensesInCents -
        dre.commissionsInCents;
      const byProduct = productProfitResult.rows.map((row) => {
        const grossProfitInCents = row.revenueInCents - row.costInCents;
        return {
          ...row,
          grossProfitInCents,
          grossMargin: percentage(grossProfitInCents, row.revenueInCents),
        };
      });
      const receivedPlans = await repositoryContext.pool.query<{
        amount: number;
        services: PatientPlanService[];
      }>(
        `SELECT sum(r.amount_in_cents)::bigint AS amount,
        (SELECT jsonb_agg(jsonb_build_object('serviceId', x.service_id, 'totalValueInCents', x.total_value_in_cents) ORDER BY x.position)
         FROM patient_plan_services x WHERE x.plan_id = r.plan_id) AS services
       FROM receivables r WHERE r.clinic_id=$1 AND r.plan_id IS NOT NULL AND r.status='paid'
         AND ${branchClause("r.branch_id", 4)}
         AND (r.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date GROUP BY r.plan_id`,
        [clinicId, from, to, branchIds],
      );
      const serviceRevenue = new Map<string, number>();
      for (const row of receivedPlans.rows) {
        const shares = allocatePlanRevenue(Number(row.amount), row.services);
        row.services.forEach((entry, index) =>
          serviceRevenue.set(
            entry.serviceId,
            (serviceRevenue.get(entry.serviceId) ?? 0) + shares[index]!,
          ),
        );
      }
      serviceProfitResult.rows.forEach((row) => {
        row.revenueInCents = serviceRevenue.get(row.id) ?? 0;
      });
      const byServiceProfitability = serviceProfitResult.rows
        .filter(
          (row) => row.completedAppointments > 0 || row.revenueInCents > 0,
        )
        .map((row) => {
          const contributionInCents =
            row.revenueInCents - row.commissionsInCents;
          return {
            ...row,
            contributionInCents,
            contributionMargin: percentage(
              contributionInCents,
              row.revenueInCents,
            ),
          };
        });
      const operation = operationResult.rows[0]!;
      return {
        from,
        to,
        generatedAt: new Date().toISOString(),
        appointments: {
          total: appointment.total,
          completed: appointment.completed,
          noShows: appointment.noShows,
          cancelled: appointment.cancelled,
          attendanceRate: attendanceRate(
            appointment.completed,
            appointment.noShows,
          ),
          byVisitType: {
            regular: appointment.regular,
            trial: appointment.trial,
            evaluation: appointment.evaluation,
          },
        },
        trials: {
          scheduled: appointment.trialsScheduled,
          completed: appointment.trialsCompleted,
          converted: appointment.trialsConverted,
          conversionRate: appointment.trialsCompleted
            ? Math.round(
                (appointment.trialsConverted / appointment.trialsCompleted) *
                  100,
              )
            : 0,
        },
        plans: {
          ...plan,
          consumedInPeriod: movementResult.rows[0]!.consumed,
        },
        finance,
        commercial: {
          ...commercial,
          conversionRate: commercial.leadsCreated
            ? Math.round((commercial.won / commercial.leadsCreated) * 100)
            : 0,
        },
        byProfessional: professionalResult.rows.map(mapBreakdown),
        byService: serviceResult.rows.map(mapBreakdown),
        bySource: sourceResult.rows.map((row) => ({
          ...row,
          conversionRate: row.leads
            ? Math.round((row.won / row.leads) * 100)
            : 0,
        })),
        profitability: {
          dre: {
            ...dre,
            grossRevenueInCents,
            grossProfitInCents,
            netResultInCents,
            netMargin: percentage(netResultInCents, grossRevenueInCents),
          },
          byService: byServiceProfitability,
          byProduct,
          operational: {
            ...operation,
            groupOccupancyRate: percentage(
              operation.activeGroupSeats,
              operation.totalGroupCapacity,
            ),
            productUnitsSold: byProduct.reduce(
              (sum, item) => sum + item.unitsSold,
              0,
            ),
          },
        },
      };
    },
  };
}
