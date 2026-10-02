import {
  saoPauloToday,
  type Appointment,
  type PatientPlan,
  type RetentionMonth,
  type RetentionReport,
  type RetentionReportFilter,
} from "@crm/contracts";
import { DomainError } from "./repository.js";

export interface RetentionReportSources {
  /** Atendimentos; contam os concluídos de clientes (sem `patientId` = lead, fica de fora). */
  appointments: Pick<Appointment, "patientId" | "status" | "startsAt">[];
  plans: Pick<
    PatientPlan,
    | "patientId"
    | "status"
    | "validFrom"
    | "validUntil"
    | "cancelledAt"
    | "cancelledValueInCents"
  >[];
}

/** Maior período aceito, em meses. */
export const MAX_RETENTION_MONTHS = 24;
const DEFAULT_RETENTION_MONTHS = 6;
const OPEN_END = "9999-12-31";

function addMonthsToMonth(month: string, count: number) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, value! - 1 + count, 1))
    .toISOString()
    .slice(0, 7);
}

function monthsBetween(start: string, end: string) {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  return (endYear! - startYear!) * 12 + (endMonth! - startMonth!) + 1;
}

/** Data (aaaa-mm-dd) de um instante no fuso da clínica. */
const clinicDate = (iso: string) => saoPauloToday(new Date(iso));

/**
 * Aplica os padrões do período e valida: `to` ausente = hoje; `from` ausente =
 * 1º dia do mês cinco meses antes do mês de `to`. Período invertido ou com mais
 * de 24 meses → 400.
 */
export function resolveRetentionPeriod(
  filter: RetentionReportFilter,
  today: string,
): { from: string; to: string } {
  const to = filter.to ?? today;
  const from =
    filter.from ??
    `${addMonthsToMonth(to.slice(0, 7), 1 - DEFAULT_RETENTION_MONTHS)}-01`;
  if (from > to)
    throw new DomainError(
      "INVALID_PERIOD",
      "A data inicial deve ser anterior à data final.",
      400,
    );
  if (monthsBetween(from.slice(0, 7), to.slice(0, 7)) > MAX_RETENTION_MONTHS)
    throw new DomainError(
      "RETENTION_PERIOD_TOO_LONG",
      `O relatório de retenção cobre no máximo ${MAX_RETENTION_MONTHS} meses.`,
      400,
    );
  return { from, to };
}

/**
 * Retenção mês a mês de `from` a `to` (o fim é limitado ao mês atual).
 *
 * - Ativo no mês: atendimento concluído no mês (fuso da clínica) ou plano
 *   vigente em algum dia do mês. Vigência: de `validFrom` até o menor entre
 *   `validUntil` (sem fim = em aberto) e o dia do cancelamento (inclusive);
 *   plano cancelado antes de começar nunca fica vigente. Plano pausado conta
 *   como vigente, porque não há histórico das pausas.
 * - Novo no mês: a primeira atividade do cliente (primeiro atendimento
 *   concluído ou início do primeiro plano vigente), em toda a história, caiu
 *   no mês.
 * - Perdido: ativo no mês anterior e não ativo no mês.
 * - Retenção: (ativos do mês anterior − perdidos) ÷ ativos do mês anterior;
 *   `null` sem ativos no mês anterior.
 * - Cancelamentos: planos cancelados no mês (data de `cancelledAt` no fuso da
 *   clínica) e a soma de `cancelledValueInCents`.
 */
export function buildRetentionReport(
  period: { from: string; to: string },
  sources: RetentionReportSources,
  today: string,
  generatedAt: Date = new Date(),
): RetentionReport {
  const startMonth = period.from.slice(0, 7);
  const currentMonth = today.slice(0, 7);
  const endMonth =
    period.to.slice(0, 7) < currentMonth ? period.to.slice(0, 7) : currentMonth;
  const previousMonth = addMonthsToMonth(startMonth, -1);

  const activeByMonth = new Map<string, Set<string>>();
  const markActive = (month: string, patientId: string) => {
    if (month < previousMonth || month > endMonth) return;
    let set = activeByMonth.get(month);
    if (!set) activeByMonth.set(month, (set = new Set()));
    set.add(patientId);
  };
  const firstActivity = new Map<string, string>();
  const markFirst = (patientId: string, date: string) => {
    const current = firstActivity.get(patientId);
    if (!current || date < current) firstActivity.set(patientId, date);
  };

  for (const appointment of sources.appointments) {
    if (appointment.status !== "completed" || !appointment.patientId) continue;
    const date = clinicDate(appointment.startsAt);
    markActive(date.slice(0, 7), appointment.patientId);
    markFirst(appointment.patientId, date);
  }

  const cancellations = new Map<string, { count: number; value: number }>();
  for (const plan of sources.plans) {
    const cancelDate =
      plan.status === "cancelled" && plan.cancelledAt
        ? clinicDate(plan.cancelledAt)
        : undefined;
    if (cancelDate) {
      const month = cancelDate.slice(0, 7);
      const entry = cancellations.get(month) ?? { count: 0, value: 0 };
      entry.count += 1;
      entry.value += plan.cancelledValueInCents ?? 0;
      cancellations.set(month, entry);
    }
    let end = plan.validUntil || OPEN_END;
    if (cancelDate && cancelDate < end) end = cancelDate;
    if (end < plan.validFrom) continue;
    markFirst(plan.patientId, plan.validFrom);
    const first =
      plan.validFrom.slice(0, 7) > previousMonth
        ? plan.validFrom.slice(0, 7)
        : previousMonth;
    const last = end.slice(0, 7) < endMonth ? end.slice(0, 7) : endMonth;
    for (let month = first; month <= last; month = addMonthsToMonth(month, 1))
      markActive(month, plan.patientId);
  }

  const newByMonth = new Map<string, number>();
  for (const date of firstActivity.values()) {
    const month = date.slice(0, 7);
    newByMonth.set(month, (newByMonth.get(month) ?? 0) + 1);
  }

  const months: RetentionMonth[] = [];
  const empty = new Set<string>();
  for (let month = startMonth; month <= endMonth; month = addMonthsToMonth(month, 1)) {
    const active = activeByMonth.get(month) ?? empty;
    const previous = activeByMonth.get(addMonthsToMonth(month, -1)) ?? empty;
    let lostClients = 0;
    for (const patientId of previous) if (!active.has(patientId)) lostClients += 1;
    const cancelled = cancellations.get(month);
    months.push({
      month,
      activeClients: active.size,
      newClients: newByMonth.get(month) ?? 0,
      lostClients,
      retentionRate:
        previous.size === 0 ? null : (previous.size - lostClients) / previous.size,
      cancelledPlans: cancelled?.count ?? 0,
      cancelledValueInCents: cancelled?.value ?? 0,
    });
  }

  return {
    generatedAt: generatedAt.toISOString(),
    from: period.from,
    to: period.to,
    startMonth,
    endMonth,
    months,
    totals: {
      newClients: months.reduce((sum, item) => sum + item.newClients, 0),
      lostClients: months.reduce((sum, item) => sum + item.lostClients, 0),
      cancelledPlans: months.reduce((sum, item) => sum + item.cancelledPlans, 0),
      cancelledValueInCents: months.reduce(
        (sum, item) => sum + item.cancelledValueInCents,
        0,
      ),
    },
  };
}
