import type {
  ClientDetailsReport,
  PatientProfileFilter,
  ClientDetailsColumn,
} from "@crm/contracts";
import type {
  ClientReport,
  DashboardViewSummary,
  ManagementReport,
  NotificationsSummary,
  RetentionReport,
  SaleMovement,
  SalesReport,
  SalesPeriodReport,
} from "@crm/contracts";
import { request, requestBlob } from "../transport";

export const reportsApi = {
  clientDetailsReport: (
    input: PatientProfileFilter & {
      from: string;
      to: string;
      search?: string;
      columns?: ClientDetailsColumn[];
      status?: "active" | "inactive" | undefined;
      discount?: "with" | "without" | undefined;
    },
    exporting = false,
  ) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(input))
      if (value !== undefined && value !== "")
        query.set(key, Array.isArray(value) ? value.join(",") : String(value));
    return request<ClientDetailsReport>(
      `/reports/clients/details${exporting ? "/export" : ""}?${query}`,
    );
  },
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
  managementReport: (from: string, to: string) =>
    request<ManagementReport>(
      `/reports/management?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  managementReportCsv: (from: string, to: string) =>
    requestBlob(
      `/reports/management.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
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
