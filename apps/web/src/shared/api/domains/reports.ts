import type {
  ClientReport,
  DashboardViewSummary,
  ManagementReport,
  RetentionReport,
  SalesReport,
} from "@crm/contracts";
import { request, requestBlob } from "../transport";

export const reportsApi = {
  dashboard: (date: string) =>
    request<DashboardViewSummary>(
      `/dashboard?date=${encodeURIComponent(date)}`,
    ),
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
  salesReport: (month: string) =>
    request<SalesReport>(`/reports/sales?month=${encodeURIComponent(month)}`),
  salesReportXlsx: (month: string) =>
    requestBlob(`/reports/sales.xlsx?month=${encodeURIComponent(month)}`),
};
