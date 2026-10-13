import {
  type AppointmentVisitType,
  type DashboardSummary,
  type ManagementReport,
  type PatientPlanService,
  type ReceivedPayment,
  type SaleMovement,
  type SalesReport,
  allocatePlanRevenue,
} from "@crm/contracts";
import {
  buildSalesReport,
  salesReportBounds,
} from "../../modules/reports/sales-report.js";
import type { PostgresRepositoryContext } from "./context.js";
import {
  type AppointmentRow,
  appointmentColumns,
  appointmentJoins,
  mapAppointment,
} from "./helpers.js";

export function createReportsRepository(
  repositoryContext: PostgresRepositoryContext,
) {
  return {
    async getDashboard(
      clinicId: string,
      date: string,
    ): Promise<DashboardSummary> {
      const [totals, patients, nextAppointments] = await Promise.all([
        repositoryContext.pool.query<{
          appointmentsToday: number;
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
                AND a.status = 'completed'
            )::int AS "completedToday",
            count(*) FILTER (
              WHERE a.starts_at >= (date_trunc('month', $2::date)::timestamp AT TIME ZONE c.timezone)
                AND a.starts_at < ((date_trunc('month', $2::date) + interval '1 month')::timestamp AT TIME ZONE c.timezone)
                AND a.status = 'no_show'
            )::int AS "noShowsThisMonth"
          FROM clinics c
          LEFT JOIN appointments a ON a.clinic_id = c.id
          WHERE c.id = $1
          GROUP BY c.id
        `,
          [clinicId, date],
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
            AND a.starts_at >= ($2::date::timestamp AT TIME ZONE c.timezone)
            AND a.starts_at < (($2::date + 1)::timestamp AT TIME ZONE c.timezone)
            AND a.status IN ('scheduled', 'confirmed')
          ORDER BY a.starts_at
          LIMIT 5
        `,
          [clinicId, date],
        ),
      ]);

      const summary = totals.rows[0] ?? {
        appointmentsToday: 0,
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
      const asOf = new Date();
      const bounds = salesReportBounds(month, asOf);
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const planResult = await client.query<{
          id: string;
          patientId: string;
          patientName: string;
          name: string;
          serviceName: string;
          totalValueInCents: number;
          cancelledValueInCents: number;
          createdAt: Date;
          cancelledAt: Date | null;
        }>(
          `SELECT pp.id, pp.patient_id AS "patientId", p.full_name AS "patientName",
                pp.name, (SELECT string_agg(x.service_name, ', ' ORDER BY x.position) FROM patient_plan_services x WHERE x.plan_id=pp.id) AS "serviceName",
                pp.total_value_in_cents AS "totalValueInCents",
                pp.cancelled_value_in_cents AS "cancelledValueInCents",
                pp.created_at AS "createdAt", pp.cancelled_at AS "cancelledAt"
         FROM patient_plans pp
         JOIN patients p ON p.id=pp.patient_id
         JOIN services s ON s.id=pp.service_id
         WHERE pp.clinic_id=$1 AND (
           (pp.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           OR (pp.cancelled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
         )`,
          [clinicId, bounds.previousFrom, bounds.currentTo],
        );
        const productResult = await client.query<{
          id: string;
          tabId: string;
          patientId: string;
          patientName: string;
          productName: string;
          quantity: number;
          amountInCents: number;
          closedAt: Date;
          cancelledAt: Date | null;
          receivableId: string | null;
        }>(
          `SELECT i.id, t.id AS "tabId", t.patient_id AS "patientId",
                p.full_name AS "patientName", pr.name AS "productName",
                i.quantity, (i.quantity*i.unit_price_in_cents)::int AS "amountInCents",
                t.closed_at AS "closedAt", t.cancelled_at AS "cancelledAt",
                t.receivable_id AS "receivableId"
         FROM patient_tab_items i
         JOIN patient_tabs t ON t.id=i.tab_id
         JOIN patients p ON p.id=t.patient_id
         JOIN products pr ON pr.id=i.product_id
         WHERE t.clinic_id=$1 AND t.closed_at IS NOT NULL AND (
           (t.closed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           OR (t.cancelled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
         )`,
          [clinicId, bounds.previousFrom, bounds.currentTo],
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
                fe.amount_in_cents AS "amountInCents", fe.created_at AS "occurredAt",
                fe.metadata->>'paymentMethod' AS "paymentMethod"
         FROM financial_events fe
         JOIN receivables r ON r.id=fe.receivable_id
         JOIN patients p ON p.id=r.patient_id
         LEFT JOIN patient_tabs t ON t.receivable_id=r.id
         WHERE fe.clinic_id=$1 AND fe.kind IN ('payment','payment_reversal') AND
           (fe.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date`,
          [clinicId, bounds.previousFrom, bounds.currentTo],
        );
        const appointmentResult = await client.query<AppointmentRow>(
          `SELECT ${appointmentColumns} FROM appointments a ${appointmentJoins}
         WHERE a.clinic_id=$1 AND a.patient_id IS NOT NULL AND (
           (a.status='completed' AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date)
           OR (a.status IN ('scheduled','confirmed') AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= $4::date)
         )`,
          [clinicId, bounds.previousFrom, bounds.currentTo, bounds.today],
        );
        await client.query("COMMIT");
        const sales: SaleMovement[] = [];
        for (const plan of planResult.rows) {
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
        for (const item of productResult.rows) {
          const base = {
            sourceId: item.tabId,
            sourceType: "product" as const,
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
        return buildSalesReport(
          month,
          sales,
          payments,
          appointmentResult.rows.map(mapAppointment),
          asOf,
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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
      const dateFilter = `(a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date`;
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
          [clinicId, from, to],
        ),
        repositoryContext.pool.query<BreakdownRow>(
          `SELECT pr.id, pr.full_name AS name, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS "noShows",
                COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled
         FROM appointments a JOIN professionals pr ON pr.id = a.professional_id
         WHERE a.clinic_id = $1 AND ${dateFilter}
         GROUP BY pr.id, pr.full_name ORDER BY total DESC`,
          [clinicId, from, to],
        ),
        repositoryContext.pool.query<BreakdownRow>(
          `SELECT s.id, s.name, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE a.status = 'no_show')::int AS "noShows",
                COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled
         FROM appointments a JOIN services s ON s.id = a.service_id
         WHERE a.clinic_id = $1 AND ${dateFilter}
         GROUP BY s.id, s.name ORDER BY total DESC`,
          [clinicId, from, to],
        ),
        repositoryContext.pool.query<{
          active: number;
          availableSessions: number;
        }>(
          `SELECT COUNT(*)::int AS active,
                COALESCE(SUM(remaining_sessions), 0)::int AS "availableSessions"
         FROM patient_plans WHERE clinic_id = $1 AND status = 'active'`,
          [clinicId],
        ),
        repositoryContext.pool.query<{ consumed: number }>(
          `SELECT GREATEST(0, -COALESCE(SUM(sm.quantity), 0))::int AS consumed
         FROM session_movements sm
         WHERE sm.clinic_id = $1 AND sm.kind <> 'credit'
           AND (sm.created_at AT TIME ZONE 'America/Sao_Paulo')::date
               BETWEEN $2::date AND $3::date`,
          [clinicId, from, to],
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
             WHERE fe.clinic_id=$1 AND fe.kind IN ('payment','payment_reversal')
               AND (fe.created_at AT TIME ZONE 'America/Sao_Paulo')::date
                   BETWEEN $2::date AND $3::date), 0)::int AS "paidInPeriodInCents"
         FROM receivables WHERE clinic_id = $1`,
          [clinicId, from, to],
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
         WHERE clinic_id = $1
           AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date
               BETWEEN $2::date AND $3::date`,
          [clinicId, from, to],
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
         FROM leads WHERE clinic_id = $1
           AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date
               BETWEEN $2::date AND $3::date
         GROUP BY source ORDER BY leads DESC`,
          [clinicId, from, to],
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
             SELECT r.* FROM receivables r WHERE r.clinic_id=$1 AND r.status='paid'
               AND (r.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           ), product_tabs AS (
             SELECT t.id,t.receivable_id FROM patient_tabs t JOIN paid r ON r.id=t.receivable_id
             WHERE t.status='closed'
           ) SELECT
             COALESCE((SELECT sum(amount_in_cents) FROM paid r WHERE NOT EXISTS(SELECT 1 FROM product_tabs t WHERE t.receivable_id=r.id)),0)::int AS "serviceRevenueInCents",
             COALESCE((SELECT sum(r.amount_in_cents) FROM paid r JOIN product_tabs t ON t.receivable_id=r.id),0)::int AS "productRevenueInCents",
             COALESCE((SELECT sum(i.quantity*i.unit_cost_in_cents) FROM patient_tab_items i JOIN product_tabs t ON t.id=i.tab_id),0)::int AS "productCostInCents",
             COALESCE((SELECT sum(amount_in_cents) FROM payables WHERE clinic_id=$1 AND status='paid' AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date),0)::int AS "operatingExpensesInCents",
             COALESCE((SELECT sum(amount_in_cents) FROM commission_entries WHERE clinic_id=$1 AND status='paid' AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date),0)::int AS "commissionsInCents"`,
          [clinicId, from, to],
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
           WHERE i.clinic_id=$1 AND t.status='closed' AND r.status='paid'
             AND (r.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
           GROUP BY p.id,p.name ORDER BY "revenueInCents" DESC`,
          [clinicId, from, to],
        ),
        repositoryContext.pool.query<{
          id: string;
          name: string;
          completedAppointments: number;
          revenueInCents: number;
          commissionsInCents: number;
        }>(
          `SELECT s.id,s.name,
             (SELECT count(*)::int FROM appointments a WHERE a.clinic_id=$1 AND a.service_id=s.id AND a.status='completed' AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date) AS "completedAppointments",
             0::int AS "revenueInCents",
             (SELECT coalesce(sum(c.amount_in_cents),0)::int FROM commission_entries c JOIN appointments a ON a.id=c.appointment_id WHERE c.clinic_id=$1 AND a.service_id=s.id AND c.status='paid' AND (c.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date) AS "commissionsInCents"
           FROM services s WHERE s.clinic_id=$1
           ORDER BY "revenueInCents" DESC`,
          [clinicId, from, to],
        ),
        repositoryContext.pool.query<{
          activeGroupSeats: number;
          totalGroupCapacity: number;
          waitlistCount: number;
          lowStockCount: number;
          averageReceiptInCents: number;
        }>(
          `SELECT
             (SELECT count(*)::int FROM group_enrollments e JOIN group_classes g ON g.id=e.group_id WHERE e.clinic_id=$1 AND e.status='active' AND g.active) AS "activeGroupSeats",
             (SELECT coalesce(sum(capacity),0)::int FROM group_classes WHERE clinic_id=$1 AND active) AS "totalGroupCapacity",
             (SELECT count(*)::int FROM group_enrollments e JOIN group_classes g ON g.id=e.group_id WHERE e.clinic_id=$1 AND e.status='waitlisted' AND g.active) AS "waitlistCount",
             (SELECT count(*)::int FROM products WHERE clinic_id=$1 AND active AND current_stock<=minimum_stock) AS "lowStockCount",
             (SELECT coalesce(avg(amount_in_cents),0)::int FROM receivables WHERE clinic_id=$1 AND status='paid' AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date) AS "averageReceiptInCents"`,
          [clinicId, from, to],
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
         AND (r.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date GROUP BY r.plan_id`,
        [clinicId, from, to],
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
