import type { SalesPeriodReport } from "@crm/contracts/reports";
import type { ChartPoint } from "./ReportChart";
import { formatIsoDate } from "../../shared/lib/formatting";

export function formatRate(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

const compactCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
/** Valor em centavos no formato curto do eixo dos gráficos ("R$ 1,2 mil"). */
export const compactMoney = (cents: number) =>
  compactCurrency.format(cents / 100);

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
      axisLabel:
        grouping === "Mensal"
          ? formatIsoDate(b.from).slice(3)
          : formatIsoDate(b.from).slice(0, 5),
      values: b.values,
    })),
  };
}

/** Traduz a nota NPS (−100 a 100) numa palavra que a equipe entende. */
export function satisfactionLabel(nps: number | null) {
  if (nps === null) return "—";
  if (nps > 75) return "Excelente";
  if (nps > 50) return "Boa";
  if (nps > 0) return "Razoável";
  return "Precisa de atenção";
}

/** Tempo médio até a primeira resposta, em texto curto ("12 min", "2 h 5 min"). */
export function responseTimeLabel(minutes: number) {
  const rounded = Math.round(minutes);
  if (rounded < 1) return "menos de 1 min";
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Quantidade com a palavra no singular ou plural ("1 cliente", "2 clientes"). */
export function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
