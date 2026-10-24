import type { SalesPeriodReport } from "@crm/contracts/reports";
import type { ChartPoint } from "./ReportChart";
import { formatIsoDate } from "../../shared/lib/formatting";

export function formatRate(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function salesChartPoints(report: SalesPeriodReport): {
  points: ChartPoint[];
  grouping: string;
} {
  const day = 86_400_000;
  const start = Date.parse(`${report.from}T00:00:00Z`);
  const end = Date.parse(`${report.to}T00:00:00Z`);
  const days = (end - start) / day + 1;
  const grouping = days <= 31 ? "Diário" : days <= 180 ? "Semanal" : "Mensal";
  const bins: { from: string; to: string; values: number[] }[] = [];
  for (let cursor = start; cursor <= end;) {
    const next =
      days <= 31
        ? cursor + day
        : days <= 180
          ? cursor + 7 * day
          : Date.UTC(
              new Date(cursor).getUTCFullYear(),
              new Date(cursor).getUTCMonth() + 1,
              1,
            );
    bins.push({
      from: new Date(cursor).toISOString().slice(0, 10),
      to: new Date(Math.min(end, next - day)).toISOString().slice(0, 10),
      values: [0, 0],
    });
    cursor = next;
  }
  for (const [series, movements] of [report.sales, report.payments].entries()) {
    for (const movement of movements) {
      const date = new Date(movement.occurredAt).toLocaleDateString("sv-SE", {
        timeZone: "America/Sao_Paulo",
      });
      const bin = bins.find((b) => date >= b.from && date <= b.to);
      if (bin) bin.values[series]! += movement.amountInCents;
    }
  }
  return {
    grouping,
    points: bins.map((b) => ({
      label:
        b.from === b.to
          ? formatIsoDate(b.from)
          : `${formatIsoDate(b.from)} a ${formatIsoDate(b.to)}`,
      values: b.values,
    })),
  };
}
