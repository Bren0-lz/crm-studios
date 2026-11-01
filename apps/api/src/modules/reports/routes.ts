import { z } from "zod";
import { buildClientDetails } from "./client-details.js";
import { clientDetailsFilterSchema } from "@crm/contracts";
import {
  campaignReportFilterSchema,
  clientReportFilterSchema,
  entryBranch,
  filterFinancialEntries,
  financialExportFilterSchema,
  financialReportFilterSchema,
  inBranch,
  managementReportFilterSchema,
  proLaboreSettingsInputSchema,
  retentionReportFilterSchema,
  salesReportFilterSchema,
  salesPeriodReportFilterSchema,
  saoPauloToday,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { xlsxContentType } from "../../infrastructure/spreadsheet.js";
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
import {
  clientDetailsToXlsx,
  financialEntriesToXlsx,
  managementReportToXlsx,
} from "./report-workbooks.js";
import {
  buildCampaignReport,
  manualCampaignsInPeriod,
} from "./campaign-report.js";
import { campaignReportToXlsx } from "./campaign-workbook.js";
import { loadAutoCampaignQueue } from "../communications/auto-campaigns.js";
import { buildTeamFinanceReport } from "./team-finance.js";
import { buildFinancialReport } from "./financial-report.js";

export function registerReportsRoutes(context: RouteContext) {
  const { app, authenticate, repository, requestAccess, assertPermissions } =
    context;
  for (const path of [
    "/reports/clients/details",
    "/reports/clients/details/export",
    "/reports/clients/details/export.xlsx",
  ] as const)
    app.get(path, { preHandler: authenticate }, async (request, reply) => {
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
      const exporting = path !== "/reports/clients/details",
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
      if (path.endsWith(".xlsx"))
        return reply
          .header("Content-Type", xlsxContentType)
          .header(
            "Content-Disposition",
            `attachment; filename="clientes-${input.from}-${input.to}.xlsx"`,
          )
          .send(await clientDetailsToXlsx(report));
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

  /** Caixa do período em detalhe nas filiais que o usuário acessa. */
  async function loadFinancialReport(
    clinicId: string,
    from: string,
    to: string,
  ) {
    const readIds = repository.branchScope.readIds();
    const [
      movements,
      workspace,
      inventory,
      professionals,
      employees,
      branches,
      proLabore,
      settings,
    ] = await Promise.all([
      repository.listCashMovements(clinicId, from, to),
      repository.getFinancialWorkspace(clinicId),
      repository.getInventoryWorkspace(clinicId),
      repository.listProfessionals(clinicId),
      repository.listPayrollEmployees(clinicId),
      repository.listBranches(clinicId),
      repository.getProLaboreSettings(clinicId),
      repository.getClinicSettings(clinicId),
    ]);
    return buildFinancialReport(
      from,
      to,
      {
        movements,
        receivables: workspace.summary.receivables,
        payables: workspace.payables,
        tabs: inventory.tabs,
        categories: workspace.categories,
        costCenters: workspace.costCenters,
        commissions: workspace.commissions,
        adjustments: workspace.commissionAdjustments ?? [],
        professionals,
        employees,
        branches: readIds
          ? branches.filter((branch) => readIds.includes(branch.id))
          : branches,
        proLabore,
      },
      settings?.timezone || DEFAULT_CLINIC_TIMEZONE,
    );
  }

  // Caixa do período em detalhe: de onde entrou, para onde saiu, profissionais e pró-labore.
  app.get(
    "/reports/financial",
    { preHandler: authenticate },
    async (request) => {
      const { from, to } = financialReportFilterSchema.parse(request.query);
      return loadFinancialReport(request.user.clinicId, from, to);
    },
  );

  // Planilha do extrato com os mesmos filtros da tela (permissão `reports.financial_export`).
  app.get(
    "/reports/financial/export",
    { preHandler: authenticate },
    async (request, reply) => {
      const { periodFrom, periodTo, branchId, ...filters } =
        financialExportFilterSchema.parse(request.query);
      const report = await loadFinancialReport(
        request.user.clinicId,
        periodFrom,
        periodTo,
      );
      const names = new Map(
        report.branches.map((branch) => [branch.id, branch.name]),
      );
      const entries = filterFinancialEntries(
        inBranch(report.entries, branchId),
        filters,
      );
      return reply
        .header("Content-Type", xlsxContentType)
        .header(
          "Content-Disposition",
          `attachment; filename="extrato-financeiro-${periodFrom}-${periodTo}.xlsx"`,
        )
        .send(
          await financialEntriesToXlsx(
            entries,
            (entry) => names.get(entryBranch(entry)) ?? "Sem filial",
          ),
        );
    },
  );

  app.put("/admin/pro-labore", { preHandler: authenticate }, async (request) =>
    repository.updateProLaboreSettings(
      request.user.clinicId,
      request.user.sub,
      proLaboreSettingsInputSchema.parse(request.body),
    ),
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
    const [patients, appointments, plans] = await Promise.all([
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
    ]);
    return buildClientReport(
      period,
      { patients, appointments, plans },
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
          .header("Content-Type", xlsxContentType)
          .header(
            "Content-Disposition",
            'attachment; filename="vendas-' + from + "-" + to + '.xlsx"',
          )
          .send(await salesReportToXlsx(report));
      return report;
    });
  }

  // Campanhas automáticas e manuais do período; a planilha exige `reports.campaigns_export`.
  for (const path of ["/reports/campaigns", "/reports/campaigns.xlsx"] as const)
    app.get(path, { preHandler: authenticate }, async (request, reply) => {
      const { from, to } = campaignReportFilterSchema.parse(request.query);
      const { clinicId } = request.user;
      const [settings, manual, automatic, deliveries, redemptions, patients] =
        await Promise.all([
          repository.getClinicSettings(clinicId),
          repository.listWhatsappCampaigns(clinicId),
          repository.listAutoCampaigns(clinicId),
          repository.listAutoCampaignDeliveries(clinicId),
          repository.listAutoCampaignRedemptions(clinicId),
          repository.listPatients(clinicId),
        ]);
      const timeZone = settings?.timezone || DEFAULT_CLINIC_TIMEZONE;
      const [details, manualRedemptions] = await Promise.all([
        Promise.all(
          manualCampaignsInPeriod(manual, from, to, timeZone).map((campaign) =>
            repository.getWhatsappCampaign(clinicId, campaign.id),
          ),
        ),
        manual.some((campaign) => campaign.promotion)
          ? repository.listWhatsappCampaignRedemptions(clinicId)
          : [],
      ]);
      // A fila de hoje (se hoje está no período) dá as pendentes das automáticas; na
      // planilha, também lista quem ainda vai receber.
      const today = clinicDateOf(new Date(), timeZone);
      const queue =
        today >= from && today <= to
          ? await loadAutoCampaignQueue(
              repository,
              clinicId,
              requestAccess.get(request)?.modules ?? [],
            )
          : undefined;
      const { report, messages } = buildCampaignReport(
        from,
        to,
        {
          manual: details.filter((item) => item !== null),
          automatic,
          deliveries,
          redemptions,
          manualRedemptions,
          patients,
          queue: queue?.items,
          queueDate: queue?.date,
        },
        timeZone,
      );
      if (!path.endsWith(".xlsx")) return report;
      await repository.recordAdminAuditEvent(
        clinicId,
        request.user.sub,
        "reports.campaigns_exported",
        "report",
        { from, to, count: report.campaigns.length },
      );
      return reply
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header(
          "Content-Disposition",
          `attachment; filename="campanhas-${from}-${to}.xlsx"`,
        )
        .send(await campaignReportToXlsx(report, messages));
    });

  app.get("/reports/sales", { preHandler: authenticate }, async (request) => {
    const { month } = salesReportFilterSchema.parse(request.query);
    return repository.getSalesReport(request.user.clinicId, month);
  });

  app.get(
    "/reports/sales/patients/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const sales = z.uuid().safeParse(id).success
        ? await repository.listPatientSales(request.user.clinicId, id)
        : null;
      if (!sales)
        return reply.status(404).send({
          code: "PATIENT_NOT_FOUND",
          message: "Cliente não encontrado.",
        });
      return sales;
    },
  );

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
        .header("Content-Type", xlsxContentType)
        .header(
          "Content-Disposition",
          `attachment; filename="vendas-${month}.xlsx"`,
        )
        .send(await salesReportToXlsx(report));
    },
  );

  app.get(
    "/reports/management.xlsx",
    { preHandler: authenticate },
    async (request, reply) => {
      const filter = managementReportFilterSchema.parse(request.query);
      const report = await repository.getManagementReport(
        request.user.clinicId,
        filter.from,
        filter.to,
      );
      return reply
        .header("Content-Type", xlsxContentType)
        .header(
          "Content-Disposition",
          `attachment; filename="relatorio-${filter.from}-${filter.to}.xlsx"`,
        )
        .send(await managementReportToXlsx(report));
    },
  );
}
