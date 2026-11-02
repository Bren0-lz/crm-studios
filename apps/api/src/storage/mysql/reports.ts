import {
  type AppointmentVisitType,
  type DashboardSummary,
  type ManagementReport,
  type PatientPlanService,
  type ProductSize,
  productItemName,
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
  withTabDiscounts,
  withPatientContacts,
  salesReportBounds,
  type SaleReceivable,
  type SalesBilling,
} from "../../modules/reports/sales-report.js";
import type { MysqlRepositoryContext } from "./context.js";
import {
  type AppointmentRow,
  appointmentColumns,
  appointmentJoins,
  branchClause,
  mapAppointment,
} from "./helpers.js";
import { bool } from "./mappers/common.js";
import { settlementDiscountSql as settlementDiscount } from "./mappers/finance.js";
import { orderedItems } from "./mappers/plans.js";
import {
  commissionAmount,
  commissionBase,
  commissionRuleJoin,
  localDate,
  localDayStart,
  localMonth,
  inJsonArray,
  localToday,
} from "./sql.js";

type PlanSaleRow = {
  id: string;
  patientId: string;
  patientName: string;
  name: string;
  serviceName: string;
  totalValueInCents: number;
  cancelledValueInCents: number;
  customerDiscountInCents: number;
  /** Plano com o 1º pagamento informado à mão (alguma cobrança com `manual_amount`). */
  manualFirstCharge: number | boolean;
  createdAt: Date;
  cancelledAt: Date | null;
};

type TabSaleRow = {
  id: string;
  tabId: string;
  patientId: string;
  patientName: string;
  productName: string;
  size: string;
  sourceType: "product" | "service";
  quantity: number;
  amountInCents: number;
  costInCents: number | null;
  closedAt: Date;
  cancelledAt: Date | null;
  receivableId: string | null;
  /** Desconto da venda gravado na cobrança da comanda. */
  tabDiscountInCents: number | string | null;
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
      ...(plan.customerDiscountInCents
        ? { customerDiscountInCents: plan.customerDiscountInCents }
        : {}),
      ...(bool(plan.manualFirstCharge)
        ? { manualFirstCharge: true as const }
        : {}),
    });
    if (plan.cancelledAt)
      sales.push({
        ...base,
        id: `${plan.id}:cancellation`,
        kind: "cancellation",
        occurredAt: plan.cancelledAt.toISOString(),
        saleOccurredAt: plan.createdAt.toISOString(),
        amountInCents: -plan.cancelledValueInCents,
      });
  }
  for (const item of tabRows) {
    const base = {
      sourceId: item.tabId,
      sourceType: item.sourceType,
      patientId: item.patientId,
      patientName: item.patientName,
      itemName: productItemName({
        productName: item.productName,
        size: (item.size || undefined) as ProductSize | undefined,
      }),
      quantity: item.quantity,
      ...(item.receivableId ? { receivableId: item.receivableId } : {}),
    };
    sales.push({
      ...base,
      id: `${item.id}:sale`,
      kind: "sale",
      occurredAt: item.closedAt.toISOString(),
      amountInCents: item.amountInCents,
      ...(item.costInCents === null
        ? {}
        : { costInCents: Number(item.costInCents) }),
    });
    if (item.cancelledAt)
      sales.push({
        ...base,
        id: `${item.id}:cancellation`,
        kind: "cancellation",
        occurredAt: item.cancelledAt.toISOString(),
        saleOccurredAt: item.closedAt.toISOString(),
        amountInCents: -item.amountInCents,
      });
  }
  return withTabDiscounts(
    sales,
    new Map(
      tabRows.map((item) => [item.tabId, Number(item.tabDiscountInCents ?? 0)]),
    ),
  );
}

export function createReportsRepository(
  repositoryContext: MysqlRepositoryContext,
) {
  /** Vendas de todo o histórico dos clientes informados (planos e comandas). */
  async function patientSales(clinicId: string, patientIds: string[]) {
    const branchIds = repositoryContext.branchReadIds();
    const [plans, tabs] = await Promise.all([
      repositoryContext.pool.query<PlanSaleRow>(
        `SELECT pp.id, pp.patient_id AS "patientId", p.full_name AS "patientName",
                pp.name, (SELECT GROUP_CONCAT(x.service_name ORDER BY x.position SEPARATOR ', ') FROM patient_plan_services x WHERE x.plan_id=pp.id) AS "serviceName",
                pp.total_value_in_cents AS "totalValueInCents",
                pp.cancelled_value_in_cents AS "cancelledValueInCents",
                (SELECT CAST(coalesce(sum(r.customer_discount_in_cents),0) AS SIGNED) FROM receivables r WHERE r.clinic_id=pp.clinic_id AND r.plan_id=pp.id) AS "customerDiscountInCents",
                EXISTS(SELECT 1 FROM receivables r WHERE r.clinic_id=pp.clinic_id AND r.plan_id=pp.id AND r.manual_amount=1) AS "manualFirstCharge",
                pp.created_at AS "createdAt", pp.cancelled_at AS "cancelledAt"
         FROM patient_plans pp
         JOIN patients p ON p.id=pp.patient_id
         JOIN services s ON s.id=pp.service_id
         WHERE pp.clinic_id=$1 AND JSON_CONTAINS($2, JSON_QUOTE(pp.patient_id)) AND pp.source_tab_id IS NULL AND ${branchClause("pp.branch_id", 3)}`,
        [clinicId, patientIds, branchIds],
      ),
      repositoryContext.pool.query<TabSaleRow>(
        `SELECT i.id, t.id AS "tabId", t.patient_id AS "patientId", 'product' AS "sourceType",
                p.full_name AS "patientName", pr.name AS "productName", i.size,
                i.quantity, CAST((i.quantity*i.unit_price_in_cents) AS SIGNED) AS "amountInCents",
                CAST((i.quantity*i.unit_cost_in_cents) AS SIGNED) AS "costInCents",
                t.closed_at AS "closedAt", t.cancelled_at AS "cancelledAt",
                t.receivable_id AS "receivableId",
                (SELECT r.customer_discount_in_cents FROM receivables r WHERE r.clinic_id=t.clinic_id AND r.id=t.receivable_id) AS "tabDiscountInCents"
         FROM patient_tab_items i
         JOIN patient_tabs t ON t.id=i.tab_id
         JOIN patients p ON p.id=t.patient_id
         JOIN products pr ON pr.id=i.product_id
         WHERE t.clinic_id=$1 AND JSON_CONTAINS($2, JSON_QUOTE(t.patient_id)) AND t.closed_at IS NOT NULL AND ${branchClause("t.branch_id", 3)}
         UNION ALL SELECT i.id,t.id,t.patient_id,'service',p.full_name,i.service_name,'',1,i.amount_in_cents,NULL,t.closed_at,t.cancelled_at,t.receivable_id,(SELECT r.customer_discount_in_cents FROM receivables r WHERE r.clinic_id=t.clinic_id AND r.id=t.receivable_id) FROM patient_tab_services i JOIN patient_tabs t ON t.id=i.tab_id AND t.clinic_id=i.clinic_id JOIN patients p ON p.id=t.patient_id AND p.clinic_id=t.clinic_id WHERE t.clinic_id=$1 AND JSON_CONTAINS($2, JSON_QUOTE(t.patient_id)) AND t.closed_at IS NOT NULL AND ${branchClause("t.branch_id", 3)}`,
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
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await client.query(
        "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY",
      );
      const planResult = await client.query<PlanSaleRow>(
        `SELECT pp.id, pp.patient_id AS "patientId", p.full_name AS "patientName",
                pp.name, (SELECT GROUP_CONCAT(x.service_name ORDER BY x.position SEPARATOR ', ') FROM patient_plan_services x WHERE x.plan_id=pp.id) AS "serviceName",
                pp.total_value_in_cents AS "totalValueInCents",
                pp.cancelled_value_in_cents AS "cancelledValueInCents",
                (SELECT CAST(coalesce(sum(r.customer_discount_in_cents),0) AS SIGNED) FROM receivables r WHERE r.clinic_id=pp.clinic_id AND r.plan_id=pp.id) AS "customerDiscountInCents",
                EXISTS(SELECT 1 FROM receivables r WHERE r.clinic_id=pp.clinic_id AND r.plan_id=pp.id AND r.manual_amount=1) AS "manualFirstCharge",
                pp.created_at AS "createdAt", pp.cancelled_at AS "cancelledAt"
         FROM patient_plans pp
         JOIN patients p ON p.id=pp.patient_id
         JOIN services s ON s.id=pp.service_id
         WHERE pp.clinic_id=$1 AND pp.source_tab_id IS NULL AND ${branchClause("pp.branch_id", 4)} AND (
           ${localDate("pp.created_at")} BETWEEN $2 AND $3
           OR ${localDate("pp.cancelled_at")} BETWEEN $2 AND $3
         )`,
        [clinicId, bounds.previousFrom, bounds.currentTo, branchIds],
      );
      const productResult = await client.query<TabSaleRow>(
        `SELECT i.id, t.id AS "tabId", t.patient_id AS "patientId", 'product' AS "sourceType",
                p.full_name AS "patientName", pr.name AS "productName", i.size,
                i.quantity, CAST((i.quantity*i.unit_price_in_cents) AS SIGNED) AS "amountInCents",
                CAST((i.quantity*i.unit_cost_in_cents) AS SIGNED) AS "costInCents",
                t.closed_at AS "closedAt", t.cancelled_at AS "cancelledAt",
                t.receivable_id AS "receivableId",
                (SELECT r.customer_discount_in_cents FROM receivables r WHERE r.clinic_id=t.clinic_id AND r.id=t.receivable_id) AS "tabDiscountInCents"
         FROM patient_tab_items i
         JOIN patient_tabs t ON t.id=i.tab_id
         JOIN patients p ON p.id=t.patient_id
         JOIN products pr ON pr.id=i.product_id
         WHERE t.clinic_id=$1 AND t.closed_at IS NOT NULL AND ${branchClause("t.branch_id", 4)} AND (
           ${localDate("t.closed_at")} BETWEEN $2 AND $3
           OR ${localDate("t.cancelled_at")} BETWEEN $2 AND $3
         ) UNION ALL SELECT i.id,t.id,t.patient_id,'service',p.full_name,i.service_name,'',1,i.amount_in_cents,NULL,t.closed_at,t.cancelled_at,t.receivable_id,(SELECT r.customer_discount_in_cents FROM receivables r WHERE r.clinic_id=t.clinic_id AND r.id=t.receivable_id) FROM patient_tab_services i JOIN patient_tabs t ON t.id=i.tab_id AND t.clinic_id=i.clinic_id JOIN patients p ON p.id=t.patient_id AND p.clinic_id=t.clinic_id WHERE t.clinic_id=$1 AND t.closed_at IS NOT NULL AND ${branchClause("t.branch_id", 4)} AND (${localDate("t.closed_at")} BETWEEN $2 AND $3 OR ${localDate("t.cancelled_at")} BETWEEN $2 AND $3)`,
        [clinicId, bounds.previousFrom, bounds.currentTo, branchIds],
      );
      const appointmentResult = await client.query<AppointmentRow>(
        `SELECT ${appointmentColumns} FROM appointments a ${appointmentJoins}
         WHERE a.clinic_id=$1 AND a.patient_id IS NOT NULL AND ${branchClause("a.branch_id", 5)} AND (
           (a.status='completed' AND ${localDate("a.starts_at")} BETWEEN $2 AND $3)
           OR (a.status IN ('scheduled','confirmed') AND ${localDate("a.starts_at")} >= $4)
         )`,
        [
          clinicId,
          bounds.previousFrom,
          bounds.currentTo,
          bounds.today,
          branchIds,
        ],
      );
      const sales = toSales(planResult.rows, productResult.rows);
      const sold = sales.filter((item) => item.kind === "sale");
      const planIds = [
        ...new Set(
          sold
            .filter((item) => item.sourceType === "plan")
            .map((item) => item.sourceId),
        ),
      ];
      const tabIds = [
        ...new Set(
          sold
            .filter((item) => item.sourceType !== "plan")
            .map((item) => item.sourceId),
        ),
      ];
      const patientIds = [...new Set(sold.map((item) => item.patientId))];
      // Contas das vendas carregadas (plano pelo plan_id, comanda pela conta da comanda).
      const receivableResult = await client.query<SaleReceivable>(
        `SELECT r.plan_id AS "sourceId", r.status, r.amount_in_cents AS "amountInCents", r.due_date AS "dueDate",
                ${settlementDiscount} AS "settlementDiscountInCents"
         FROM receivables r
         WHERE r.clinic_id=$1 AND r.plan_id IS NOT NULL AND ${inJsonArray("r.plan_id", "$2")}
         UNION ALL
         SELECT t.id, r.status, r.amount_in_cents, r.due_date, ${settlementDiscount}
         FROM patient_tabs t JOIN receivables r ON r.id=t.receivable_id AND r.clinic_id=t.clinic_id
         WHERE t.clinic_id=$1 AND ${inJsonArray("t.id", "$3")}`,
        [clinicId, planIds, tabIds],
      );
      // Primeira compra da história de cada comprador (novos × recorrentes).
      const firstSaleResult = await client.query<{
        patientId: string;
        firstSaleAt: Date;
      }>(
        `SELECT x.patient_id AS "patientId", MIN(x.sold_at) AS "firstSaleAt" FROM (
           SELECT pp.patient_id, pp.created_at AS sold_at FROM patient_plans pp
           WHERE pp.clinic_id=$1 AND pp.source_tab_id IS NULL AND ${inJsonArray("pp.patient_id", "$2")} AND ${branchClause("pp.branch_id", 3)}
           UNION ALL
           SELECT t.patient_id, t.closed_at FROM patient_tabs t
           WHERE t.clinic_id=$1 AND t.closed_at IS NOT NULL AND ${inJsonArray("t.patient_id", "$2")} AND ${branchClause("t.branch_id", 3)}
         ) x GROUP BY x.patient_id`,
        [clinicId, patientIds, branchIds],
      );
      await client.query("COMMIT");
      const billing: SalesBilling = {
        receivables: receivableResult.rows.map(
          ({ settlementDiscountInCents, ...item }) => ({
            ...item,
            amountInCents: Number(item.amountInCents),
            ...(Number(settlementDiscountInCents ?? 0) > 0
              ? {
                  settlementDiscountInCents: Number(settlementDiscountInCents),
                }
              : {}),
          }),
        ),
        firstSaleAt: new Map(
          firstSaleResult.rows.map((item) => [
            item.patientId,
            new Date(item.firstSaleAt).toISOString(),
          ]),
        ),
      };
      return {
        sales,
        billing,
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
            COUNT(CASE WHEN a.starts_at >= ${localDayStart("$2")}
                AND a.starts_at < ${localDayStart("DATE_ADD($2, INTERVAL 1 DAY)")} THEN 1 END) AS "appointmentsToday",
            COUNT(CASE WHEN a.starts_at >= ${localDayStart("$2")}
                AND a.starts_at < ${localDayStart("DATE_ADD($2, INTERVAL 1 DAY)")}
                AND a.status <> 'cancelled' THEN 1 END) AS "nonCancelledAppointmentsToday",
            COUNT(CASE WHEN a.starts_at >= ${localDayStart("$2")}
                AND a.starts_at < ${localDayStart("DATE_ADD($2, INTERVAL 1 DAY)")}
                AND a.status IN ('scheduled', 'confirmed') THEN 1 END) AS "pendingToday",
            COUNT(CASE WHEN a.starts_at >= ${localDayStart("$2")}
                AND a.starts_at < ${localDayStart("DATE_ADD($2, INTERVAL 1 DAY)")}
                AND a.status = 'scheduled' THEN 1 END) AS "awaitingConfirmationToday",
            COUNT(CASE WHEN a.starts_at >= ${localDayStart("$2")}
                AND a.starts_at < ${localDayStart("DATE_ADD($2, INTERVAL 1 DAY)")}
                AND a.status = 'completed' THEN 1 END) AS "completedToday",
            COUNT(CASE WHEN a.starts_at >= ${localDayStart("DATE_FORMAT($2, '%Y-%m-01')")}
                AND a.starts_at < ${localDayStart("DATE_ADD(DATE_FORMAT($2, '%Y-%m-01'), INTERVAL 1 MONTH)")}
                AND a.status = 'no_show' THEN 1 END) AS "noShowsThisMonth"
          FROM clinics c
          LEFT JOIN appointments a ON a.clinic_id = c.id AND ${branchClause("a.branch_id", 3)}
            AND ($4 IS NULL OR JSON_CONTAINS($4, JSON_QUOTE(a.professional_id)))
          WHERE c.id = $1
          GROUP BY c.id
        `,
          [clinicId, date, branchIds, scope],
        ),
        repositoryContext.pool.query<{ count: number }>(
          "SELECT count(*) AS count FROM patients WHERE clinic_id = $1 AND status = 'active'",
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
            AND a.starts_at >= ${localDayStart("$2")}
            AND a.starts_at < ${localDayStart("DATE_ADD($2, INTERVAL 1 DAY)")}
            AND a.status IN ('scheduled', 'confirmed')
            AND ($4 IS NULL OR JSON_CONTAINS($4, JSON_QUOTE(a.professional_id)))
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
        data.billing,
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
        data.billing,
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
           WHERE clinic_id=$1 AND JSON_CONTAINS($2, JSON_QUOTE(id))`,
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
           WHERE a.clinic_id=$1 AND a.status='completed' AND a.patient_id IS NOT NULL AND ${localDate("a.starts_at")} BETWEEN $2 AND $3 AND ${branchClause("a.branch_id", 4)}
           UNION ALL
           SELECT p.id,p.full_name,g.service_id,s.name,${consumedPlan("group_attendance_id", "ga.id")}
           FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id
           JOIN professionals p ON p.id=coalesce(gs.professional_id,g.professional_id) AND p.clinic_id=ga.clinic_id JOIN services s ON s.id=g.service_id AND s.clinic_id=g.clinic_id
           WHERE ga.clinic_id=$1 AND gs.status<>'cancelled' AND (ga.status='present' OR ga.outcome='present') AND ${localDate("gs.starts_at")} BETWEEN $2 AND $3 AND ${branchClause("g.branch_id", 4)}`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<
          TeamProductionSources["commissions"][number]
        >(
          `SELECT ce.professional_id AS "professionalId",p.full_name AS "professionalName",ce.competence,ce.amount_in_cents AS "amountInCents",ce.status
           FROM commission_entries ce JOIN professionals p ON p.id=ce.professional_id AND p.clinic_id=ce.clinic_id
           WHERE ce.clinic_id=$1 AND JSON_CONTAINS($2, JSON_QUOTE(ce.competence)) AND ${branchClause("p.branch_id", 3)}`,
          [clinicId, competences, branchIds],
        ),
        // Mesma seleção de regra da geração de comissões, só para as sessões ainda sem comissão.
        repositoryContext.pool.query<
          TeamProductionSources["pendingCommissions"][number]
        >(
          `WITH sources AS (
             SELECT a.id AS appointment_id,CAST(NULL AS CHAR(36)) AS group_attendance_id,a.professional_id,a.service_id,a.starts_at FROM appointments a WHERE a.clinic_id=$1 AND a.status='completed' AND a.patient_id IS NOT NULL
             UNION ALL SELECT NULL,ga.id,coalesce(gs.professional_id,g.professional_id),g.service_id,gs.starts_at FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id WHERE ga.clinic_id=$1 AND gs.status<>'cancelled' AND (ga.status='present' OR ga.outcome='present')
           )
           SELECT pr.id AS "professionalId",pr.full_name AS "professionalName",${commissionAmount(
             commissionBase({
               clinic: "$1",
               appointmentId: "a.appointment_id",
               attendanceId: "a.group_attendance_id",
               serviceId: "a.service_id",
             }),
           )} AS "amountInCents"
           FROM sources a JOIN services s ON s.id=a.service_id AND s.clinic_id=$1 JOIN professionals pr ON pr.id=a.professional_id AND pr.clinic_id=$1
           ${commissionRuleJoin("$1")}
           WHERE ${commissionBase({
             clinic: "$1",
             appointmentId: "a.appointment_id",
             attendanceId: "a.group_attendance_id",
             serviceId: "a.service_id",
           })}>0 AND JSON_CONTAINS($2, JSON_QUOTE(${localMonth("a.starts_at")})) AND ${branchClause("pr.branch_id", 3)}
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
      const dateFilter = `${localDate("a.starts_at")} BETWEEN $2 AND $3 AND ${branchClause("a.branch_id", 4)}`;
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
          `SELECT COUNT(*) AS total,
                CAST(COUNT(CASE WHEN a.status = 'completed' THEN 1 END) AS SIGNED) AS completed,
                CAST(COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) AS SIGNED) AS "noShows",
                CAST(COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) AS SIGNED) AS cancelled,
                CAST(COUNT(CASE WHEN a.visit_type = 'regular' THEN 1 END) AS SIGNED) AS regular,
                CAST(COUNT(CASE WHEN a.visit_type = 'trial' THEN 1 END) AS SIGNED) AS trial,
                CAST(COUNT(CASE WHEN a.visit_type = 'evaluation' THEN 1 END) AS SIGNED) AS evaluation,
                CAST(COUNT(CASE WHEN a.visit_type IN ('trial', 'evaluation')
                  AND a.status <> 'cancelled' THEN 1 END) AS SIGNED) AS "trialsScheduled",
                CAST(COUNT(CASE WHEN a.visit_type IN ('trial', 'evaluation')
                  AND a.status = 'completed' THEN 1 END) AS SIGNED) AS "trialsCompleted",
                CAST(COALESCE(SUM(CASE WHEN a.visit_type IN ('trial', 'evaluation')
                  AND a.status = 'completed' AND a.patient_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM patient_plans pp
                    WHERE pp.clinic_id = a.clinic_id AND pp.patient_id = a.patient_id
                      AND pp.created_at >= a.starts_at
                      AND pp.created_at <= a.starts_at + INTERVAL 30 DAY
                  ) THEN 1 ELSE 0 END), 0) AS SIGNED) AS "trialsConverted"
         FROM appointments a WHERE a.clinic_id = $1 AND ${dateFilter}`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<BreakdownRow>(
          `SELECT pr.id, pr.full_name AS name, COUNT(*) AS total,
                CAST(COUNT(CASE WHEN a.status = 'completed' THEN 1 END) AS SIGNED) AS completed,
                CAST(COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) AS SIGNED) AS "noShows",
                CAST(COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) AS SIGNED) AS cancelled
         FROM appointments a JOIN professionals pr ON pr.id = a.professional_id
         WHERE a.clinic_id = $1 AND ${dateFilter}
         GROUP BY pr.id, pr.full_name ORDER BY total DESC`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<BreakdownRow>(
          `SELECT s.id, s.name, COUNT(*) AS total,
                CAST(COUNT(CASE WHEN a.status = 'completed' THEN 1 END) AS SIGNED) AS completed,
                CAST(COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) AS SIGNED) AS "noShows",
                CAST(COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) AS SIGNED) AS cancelled
         FROM appointments a JOIN services s ON s.id = a.service_id
         WHERE a.clinic_id = $1 AND ${dateFilter}
         GROUP BY s.id, s.name ORDER BY total DESC`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<{
          active: number;
          availableSessions: number;
        }>(
          `SELECT COUNT(*) AS active,
                CAST(COALESCE(SUM(GREATEST(remaining_sessions, 0)), 0) AS SIGNED) AS "availableSessions"
         FROM patient_plans WHERE clinic_id = $1 AND status = 'active'
           AND ${branchClause("branch_id", 2)}`,
          [clinicId, branchIds],
        ),
        repositoryContext.pool.query<{ consumed: number }>(
          `SELECT CAST(GREATEST(0, -COALESCE(SUM(sm.quantity), 0)) AS SIGNED) AS consumed
         FROM session_movements sm
         WHERE sm.clinic_id = $1 AND sm.kind <> 'credit'
           AND EXISTS (SELECT 1 FROM patient_plans pb WHERE pb.id = sm.plan_id
             AND ${branchClause("pb.branch_id", 4)})
           AND ${localDate("sm.created_at")}
               BETWEEN $2 AND $3`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<{
          openInCents: number;
          overdueInCents: number;
        }>(
          `SELECT
           CAST(COALESCE(SUM(CASE WHEN status = 'open' THEN amount_in_cents END), 0) AS SIGNED) AS "openInCents",
           CAST(COALESCE(SUM(CASE WHEN status = 'open' AND due_date < ${localToday()}
             THEN amount_in_cents END), 0) AS SIGNED) AS "overdueInCents"
         FROM receivables WHERE clinic_id = $1 AND ${branchClause("branch_id", 2)}`,
          [clinicId, branchIds],
        ),
        repositoryContext.pool.query<{
          leadsCreated: number;
          won: number;
          lost: number;
          averageFirstResponseMinutes: number;
        }>(
          `SELECT COUNT(*) AS "leadsCreated",
                CAST(COUNT(CASE WHEN stage = 'won' THEN 1 END) AS SIGNED) AS won,
                CAST(COUNT(CASE WHEN stage = 'lost' THEN 1 END) AS SIGNED) AS lost,
                CAST(COALESCE(AVG(TIMESTAMPDIFF(MICROSECOND, created_at, first_contact_at) / 60000000), 0) AS SIGNED)
                  AS "averageFirstResponseMinutes"
         FROM (
           SELECT leads.stage, leads.created_at,
             (SELECT MIN(lc.occurred_at) FROM lead_contacts lc
               WHERE lc.lead_id = leads.id AND lc.direction <> 'internal') AS first_contact_at
           FROM leads
           WHERE clinic_id = $1 AND ${branchClause("leads.branch_id", 4)}
             AND ${localDate("created_at")}
                 BETWEEN $2 AND $3
         ) leads`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<{
          source: string;
          leads: number;
          won: number;
          lost: number;
        }>(
          `SELECT source, COUNT(*) AS leads,
                CAST(COUNT(CASE WHEN stage = 'won' THEN 1 END) AS SIGNED) AS won,
                CAST(COUNT(CASE WHEN stage = 'lost' THEN 1 END) AS SIGNED) AS lost
         FROM leads WHERE clinic_id = $1 AND ${branchClause("branch_id", 4)}
           AND ${localDate("created_at")}
               BETWEEN $2 AND $3
         GROUP BY source ORDER BY leads DESC`,
          [clinicId, from, to, branchIds],
        ),
      ]);
      const [serviceProfitResult, operationResult] = await Promise.all([
        repositoryContext.pool.query<{
          id: string;
          name: string;
          completedAppointments: number;
          revenueInCents: number;
          commissionsInCents: number;
        }>(
          `SELECT s.id,s.name,
             (SELECT count(*) FROM appointments a WHERE a.clinic_id=$1 AND a.service_id=s.id AND a.status='completed' AND ${branchClause("a.branch_id", 4)} AND ${localDate("a.starts_at")} BETWEEN $2 AND $3) AS "completedAppointments",
             CAST(0 AS SIGNED) AS "revenueInCents",
             (SELECT CAST(coalesce(sum(c.amount_in_cents),0) AS SIGNED) FROM commission_entries c JOIN appointments a ON a.id=c.appointment_id WHERE c.clinic_id=$1 AND a.service_id=s.id AND ${branchClause("a.branch_id", 4)} AND c.status='paid' AND c.payroll_payable_id IS NULL AND ${localDate("c.paid_at")} BETWEEN $2 AND $3) AS "commissionsInCents"
           FROM services s WHERE s.clinic_id=$1
           ORDER BY "revenueInCents" DESC`,
          [clinicId, from, to, branchIds],
        ),
        repositoryContext.pool.query<{
          activeGroupSeats: number;
          totalGroupCapacity: number;
          waitlistCount: number;
          lowStockCount: number;
        }>(
          `SELECT
             (SELECT count(*) FROM group_enrollments e JOIN group_classes g ON g.id=e.group_id WHERE e.clinic_id=$1 AND e.status='active' AND g.active AND ${branchClause("g.branch_id", 4)}) AS "activeGroupSeats",
             (SELECT CAST(coalesce(sum(capacity),0) AS SIGNED) FROM group_classes WHERE clinic_id=$1 AND active AND ${branchClause("branch_id", 4)}) AS "totalGroupCapacity",
             (SELECT count(*) FROM group_enrollments e JOIN group_classes g ON g.id=e.group_id WHERE e.clinic_id=$1 AND e.status='waitlisted' AND g.active AND ${branchClause("g.branch_id", 4)}) AS "waitlistCount",
             (SELECT count(*) FROM products p WHERE p.clinic_id=$1 AND p.active AND ${branchClause("p.branch_id", 4)} AND (p.current_stock<=COALESCE(p.restock_alert_at,0) OR (p.restock_alert_at IS NOT NULL AND JSON_LENGTH(p.sizes) > (SELECT count(*) FROM product_stock s WHERE s.product_id=p.id AND s.current_stock>p.restock_alert_at AND JSON_CONTAINS(p.sizes, JSON_QUOTE(s.size)))))) AS "lowStockCount"`,
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
      const receivedPlans = await repositoryContext.pool.query<{
        amount: number;
        services: PatientPlanService[];
      }>(
        `SELECT CAST(sum(r.amount_in_cents) AS SIGNED) AS amount,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('position', x.position, 'serviceId', x.service_id, 'totalValueInCents', x.total_value_in_cents))
         FROM patient_plan_services x WHERE x.plan_id = r.plan_id) AS services
       FROM receivables r WHERE r.clinic_id=$1 AND r.plan_id IS NOT NULL AND r.status='paid'
         AND ${branchClause("r.branch_id", 4)}
         AND ${localDate("r.paid_at")} BETWEEN $2 AND $3 GROUP BY r.plan_id`,
        [clinicId, from, to, branchIds],
      );
      const serviceRevenue = new Map<string, number>();
      for (const row of receivedPlans.rows) {
        const services = orderedItems<PatientPlanService>(row.services);
        const shares = allocatePlanRevenue(Number(row.amount), services);
        services.forEach((entry, index) =>
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
          byService: byServiceProfitability,
          operational: {
            ...operation,
            groupOccupancyRate: percentage(
              operation.activeGroupSeats,
              operation.totalGroupCapacity,
            ),
          },
        },
      };
    },
  };
}
