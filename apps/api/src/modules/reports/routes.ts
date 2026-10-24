import { buildClientDetails } from "./client-details.js";
import { clientDetailsFilterSchema } from "@crm/contracts";
import {
  clientReportFilterSchema,
  managementReportFilterSchema,
  retentionReportFilterSchema,
  salesReportFilterSchema,
  salesPeriodReportFilterSchema,
  saoPauloToday,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { reportToCsv } from "../../infrastructure/route-utils.js";
import {
  DEFAULT_CLINIC_TIMEZONE,
  clinicDateOf,
} from "../finance/daily-cash.js";
import {
  buildClientReport,
  resolveClientReportPeriod,
} from "./client-report.js";
import {
  buildRetentionReport,
  resolveRetentionPeriod,
} from "./retention-report.js";
import { salesReportToXlsx } from "./sales-workbook.js";
import { buildTeamFinanceReport } from "./team-finance.js";

export function registerReportsRoutes(context: RouteContext) {
  const { app, authenticate, repository, requestAccess, assertPermissions } =
    context;
  for (const path of [
    "/reports/clients/details",
    "/reports/clients/details/export",
  ] as const)
    app.get(path, { preHandler: authenticate }, async (request) => {
      const input = clientDetailsFilterSchema.parse(request.query),
        permissions = requestAccess.get(request)?.permissions ?? [];
      if (
        input.segment === "pending" ||
        input.segment === "overdue" ||
        input.columns?.some((column) =>
          ["pendingReceivables", "overdueReceivables"].includes(column),
        )
      )
        assertPermissions(request, "finance.view");
      if (input.columns?.includes("equipment"))
        assertPermissions(request, "clinical.view");
      const exporting = path.endsWith("/export"),
        report = await buildClientDetails(
          repository,
          request.user.clinicId,
          request.user.sub,
          input,
          permissions.includes("finance.view"),
          permissions.includes("clinical.view"),
          exporting,
        );
      if (exporting)
        await repository.recordAdminAuditEvent(
          request.user.clinicId,
          request.user.sub,
          "reports.clients_exported",
          "report",
          { filters: input, count: report.rows.length },
        );
      return report;
    });

  app.get(
    "/reports/management",
    { preHandler: authenticate },
    async (request) => {
      const filter = managementReportFilterSchema.parse(request.query);
      const { clinicId } = request.user;
      const report = await repository.getManagementReport(
        clinicId,
        filter.from,
        filter.to,
      );
      const permissions = requestAccess.get(request)?.permissions ?? [];
      if (!permissions.includes("reports.team_finance")) return report;
      const [sources, plans, services, groups] = await Promise.all([
        repository.listTeamProduction(clinicId, filter.from, filter.to),
        repository.listPatientPlans(clinicId),
        repository.listServices(clinicId),
        repository.getGroupWorkspace(clinicId, filter.from, filter.to),
      ]);
      return {
        ...report,
        teamFinance: buildTeamFinanceReport({
          from: filter.from,
          to: filter.to,
          sources,
          plans,
          services,
          groups: groups.groups,
          enrollments: groups.enrollments,
        }),
      };
    },
  );

  app.get(
    "/reports/retention",
    { preHandler: authenticate },
    async (request) => {
      const filter = retentionReportFilterSchema.parse(request.query);
      const today = saoPauloToday();
      const period = resolveRetentionPeriod(filter, today);
      const { clinicId } = request.user;
      // Toda a história: "novo" depende da primeira atividade do cliente; o
      // relatório descarta o que cai fora dos meses pedidos.
      const [appointments, plans] = await Promise.all([
        repository.listAppointments(
          clinicId,
          "1900-01-01T00:00:00.000Z",
          "9999-12-31T00:00:00.000Z",
        ),
        repository.listPatientPlans(clinicId),
      ]);
      return buildRetentionReport(period, { appointments, plans }, today);
    },
  );

  app.get("/reports/clients", { preHandler: authenticate }, async (request) => {
    const filter = clientReportFilterSchema.parse(request.query);
    const { clinicId } = request.user;
    const settings = await repository.getClinicSettings(clinicId);
    const timeZone = settings?.timezone || DEFAULT_CLINIC_TIMEZONE;
    const period = resolveClientReportPeriod(
      filter,
      clinicDateOf(new Date(), timeZone),
    );
    // Janela folgada de um dia em cada ponta; o relatório filtra pela data
    // no fuso da clínica.
    const day = 24 * 60 * 60 * 1000;
    const [patients, appointments, plans, payments] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listAppointments(
        clinicId,
        new Date(
          Date.parse(`${period.from}T00:00:00.000Z`) - day,
        ).toISOString(),
        new Date(
          Date.parse(`${period.to}T00:00:00.000Z`) + 2 * day,
        ).toISOString(),
      ),
      repository.listPatientPlans(clinicId),
      repository.listReceivedPayments(clinicId, period.from, period.to),
    ]);
    return buildClientReport(
      period,
      { patients, appointments, plans, payments },
      timeZone,
    );
  });

  for (const path of [
    "/reports/sales/period",
    "/reports/sales/period.xlsx",
  ] as const) {
    app.get(path, { preHandler: authenticate }, async (request, reply) => {
      const { from, to } = salesPeriodReportFilterSchema.parse(request.query);
      const report = await repository.getSalesPeriodReport(
        request.user.clinicId,
        from,
        to,
      );
      if (path.endsWith(".xlsx"))
        return reply
          .header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          )
          .header(
            "Content-Disposition",
            'attachment; filename="vendas-' + from + "-" + to + '.xlsx"',
          )
          .send(await salesReportToXlsx(report));
      return report;
    });
  }

  app.get("/reports/sales", { preHandler: authenticate }, async (request) => {
    const { month } = salesReportFilterSchema.parse(request.query);
    return repository.getSalesReport(request.user.clinicId, month);
  });

  app.get(
    "/reports/sales.xlsx",
    { preHandler: authenticate },
    async (request, reply) => {
      const { month } = salesReportFilterSchema.parse(request.query);
      const report = await repository.getSalesReport(
        request.user.clinicId,
        month,
      );
      return reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header(
          "Content-Disposition",
          `attachment; filename="vendas-${month}.xlsx"`,
        )
        .send(await salesReportToXlsx(report));
    },
  );

  app.get(
    "/reports/management.csv",
    { preHandler: authenticate },
    async (request, reply) => {
      const filter = managementReportFilterSchema.parse(request.query);
      const report = await repository.getManagementReport(
        request.user.clinicId,
        filter.from,
        filter.to,
      );
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="relatorio-${filter.from}-${filter.to}.csv"`,
        )
        .send(reportToCsv(report));
    },
  );
}
