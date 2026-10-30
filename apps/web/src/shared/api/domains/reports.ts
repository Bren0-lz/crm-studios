import type {
  ClientDetailsReport,
  PatientProfileFilter,
  ClientDetailsColumn,
} from "@crm/contracts";
import type {
  ClientReport,
  DashboardViewSummary,
  FinancialExportFilter,
  FinancialReport,
  ManagementReport,
  NotificationPreferences,
  NotificationsSummary,
  ProLaboreSettings,
  ProLaboreSettingsInput,
  RetentionReport,
  SaleMovement,
  SalesReport,
  SalesPeriodReport,
} from "@crm/contracts";
import { allBranches } from "../branch";
import { request, requestBlob } from "../transport";

type ClientDetailsInput = PatientProfileFilter & {
  from: string;
  to: string;
  search?: string;
  columns?: ClientDetailsColumn[];
  status?: "active" | "inactive" | undefined;
  discount?: "with" | "without" | undefined;
};

function clientDetailsQuery(input: ClientDetailsInput) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== "")
      query.set(key, Array.isArray(value) ? value.join(",") : String(value));
  return query;
}

export const reportsApi = {
  clientDetailsReport: (input: ClientDetailsInput, exporting = false) =>
    request<ClientDetailsReport>(
      `/reports/clients/details${exporting ? "/export" : ""}?${clientDetailsQuery(input)}`,
    ),
  /** Planilha Excel da consulta de clientes (mesmos filtros e colunas). */
  clientDetailsReportXlsx: (input: ClientDetailsInput) =>
    requestBlob(
      `/reports/clients/details/export.xlsx?${clientDetailsQuery(input)}`,
    ),
  /** `professionalIds`: agenda só desses profissionais (vazio = todos os permitidos). */
  dashboard: (date: string, professionalIds: readonly string[] = []) =>
    request<DashboardViewSummary>(
      `/dashboard?date=${encodeURIComponent(date)}${
        professionalIds.length > 0
          ? `&professionalIds=${professionalIds.map(encodeURIComponent).join(",")}`
          : ""
      }`,
    ),
  /** Contagens do sino do cabeçalho (QM13). */
  notifications: () => request<NotificationsSummary>("/notifications"),
  /** Preferências do sino do usuário logado. */
  notificationPreferences: () =>
    request<NotificationPreferences>("/notifications/preferences"),
  saveNotificationPreferences: (input: NotificationPreferences) =>
    request<NotificationPreferences>("/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  managementReport: (from: string, to: string) =>
    request<ManagementReport>(
      `/reports/management?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  managementReportXlsx: (from: string, to: string) =>
    requestBlob(
      `/reports/management.xlsx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  /** Todas as filiais do usuário: a tela filtra e compara as filiais. */
  financialReport: (from: string, to: string) =>
    request<FinancialReport>(
      `/reports/financial?${new URLSearchParams({ from, to })}`,
      allBranches,
    ),
  /** Planilha do extrato com os filtros da tela; todas as filiais, como o relatório. */
  financialReportXlsx: (input: Partial<FinancialExportFilter>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(input))
      if (value) query.set(key, String(value));
    return requestBlob(`/reports/financial/export?${query}`, allBranches);
  },
  updateProLabore: (input: ProLaboreSettingsInput) =>
    request<ProLaboreSettings>("/admin/pro-labore", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  retentionReport: (from: string, to: string) =>
    request<RetentionReport>(
      `/reports/retention?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  clientReport: (from: string, to: string) =>
    request<ClientReport>(
      `/reports/clients?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  salesPeriodReport: (from: string, to: string) =>
    request<SalesPeriodReport>(
      `/reports/sales/period?${new URLSearchParams({ from, to })}`,
    ),
  salesPeriodReportXlsx: (from: string, to: string) =>
    requestBlob(
      `/reports/sales/period.xlsx?${new URLSearchParams({ from, to })}`,
    ),
  patientSalesHistory: (patientId: string) =>
    request<SaleMovement[]>(
      `/reports/sales/patients/${encodeURIComponent(patientId)}`,
    ),
  salesReport: (month: string) =>
    request<SalesReport>(`/reports/sales?month=${encodeURIComponent(month)}`),
  salesReportXlsx: (month: string) =>
    requestBlob(`/reports/sales.xlsx?month=${encodeURIComponent(month)}`),
};
