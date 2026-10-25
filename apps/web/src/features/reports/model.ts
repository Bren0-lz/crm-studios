import type { SalesPeriodReport } from "@crm/contracts/reports";
import type { ContractedItem, PatientWithoutReturn } from "@crm/contracts";
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

export type NoReturnScheduleFilter = "all" | "unscheduled" | "scheduled";
export const noReturnScheduleFilterLabels: Record<
  NoReturnScheduleFilter,
  string
> = {
  all: "Todos",
  unscheduled: "Sem agendamento",
  scheduled: "Com agendamento",
};
const searchKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
/** Busca por nome (sem acento, minúscula) dos clientes sem retorno. */
export function searchPatientsWithoutReturn(
  items: PatientWithoutReturn[],
  search: string,
) {
  const key = searchKey(search);
  return key
    ? items.filter((item) => searchKey(item.patientName).includes(key))
    : items;
}
export function matchesNoReturnSchedule(
  item: PatientWithoutReturn,
  filter: NoReturnScheduleFilter,
) {
  if (filter === "all") return true;
  return filter === "scheduled"
    ? Boolean(item.nextAppointmentAt)
    : !item.nextAppointmentAt;
}

/** Chave do item contratado no filtro ("plan:Pilates 2x (Pilates)"). */
export const contractedKey = (item: ContractedItem) =>
  `${item.sourceType}:${item.itemName}`;
export const contractedTypeLabels: Record<
  ContractedItem["sourceType"],
  string
> = {
  plan: "Planos",
  service: "Serviços",
  product: "Produtos",
};
/** Opções do filtro "Já contratou": itens da lista, sem repetir, por tipo e nome. */
export function contractedOptions(items: PatientWithoutReturn[]) {
  const unique = new Map<string, ContractedItem>();
  for (const patient of items)
    for (const item of patient.contracted ?? [])
      unique.set(contractedKey(item), item);
  return (Object.keys(contractedTypeLabels) as ContractedItem["sourceType"][])
    .map((sourceType) => ({
      sourceType,
      label: contractedTypeLabels[sourceType],
      items: [...unique.values()]
        .filter((item) => item.sourceType === sourceType)
        .sort((a, b) => a.itemName.localeCompare(b.itemName, "pt-BR")),
    }))
    .filter((group) => group.items.length);
}
/** Filtro "Já contratou": chave vazia aceita todos. */
export function matchesContracted(item: PatientWithoutReturn, key: string) {
  return (
    !key ||
    (item.contracted ?? []).some(
      (contracted) => contractedKey(contracted) === key,
    )
  );
}
