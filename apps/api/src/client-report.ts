import {
  clientAgeBandLabels,
  clientAgeBandSchema,
  type Appointment,
  type ClientAgeBand,
  type ClientReport,
  type ClientReportFilter,
  type ClientRevenueRankingEntry,
  type ClientSessionsRankingEntry,
  type Patient,
  type PatientPlan,
  type ReceivedPayment,
} from "@crm/contracts";
import { clinicDateOf, DEFAULT_CLINIC_TIMEZONE } from "./daily-cash.js";
import { DomainError } from "./repository.js";

export interface ClientReportSources {
  /** Cadastro: nome e data de nascimento. */
  patients: Pick<Patient, "id" | "fullName" | "birthDate">[];
  /** Atendimentos; contam os concluídos de clientes (sem `patientId` = lead, fica de fora). */
  appointments: Pick<Appointment, "patientId" | "patientName" | "status" | "startsAt">[];
  plans: Pick<
    PatientPlan,
    "patientId" | "status" | "validFrom" | "validUntil" | "cancelledAt"
  >[];
  /** Eventos de recebimento (`payment`) e estorno (`reversal`). */
  payments: Pick<
    ReceivedPayment,
    "patientId" | "patientName" | "kind" | "occurredAt" | "amountInCents"
  >[];
}

/** Tamanho de cada ranking. */
export const CLIENT_RANKING_SIZE = 20;
const DEFAULT_MONTHS = 6;
const OPEN_END = "9999-12-31";

function addMonthsToMonth(month: string, count: number) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, value! - 1 + count, 1))
    .toISOString()
    .slice(0, 7);
}

/**
 * Mesmos padrões da retenção: `to` ausente = hoje; `from` ausente = 1º dia do
 * mês cinco meses antes do mês de `to`. Período invertido → 400.
 */
export function resolveClientReportPeriod(
  filter: ClientReportFilter,
  today: string,
): { from: string; to: string } {
  const to = filter.to ?? today;
  const from =
    filter.from ?? `${addMonthsToMonth(to.slice(0, 7), 1 - DEFAULT_MONTHS)}-01`;
  if (from > to)
    throw new DomainError(
      "INVALID_PERIOD",
      "A data inicial deve ser anterior à data final.",
      400,
    );
  return { from, to };
}

/** Idade completa (anos) em `on`; `null` sem data ou com data posterior a `on`. */
export function ageOn(birthDate: string | undefined, on: string): number | null {
  if (!birthDate || birthDate > on) return null;
  const age = Number(on.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return on.slice(5) < birthDate.slice(5) ? age - 1 : age;
}

export function ageBandOf(age: number | null): ClientAgeBand {
  if (age === null) return "unknown";
  if (age <= 17) return "0-17";
  if (age <= 29) return "18-29";
  if (age <= 44) return "30-44";
  if (age <= 59) return "45-59";
  return "60+";
}

/**
 * Relatório de clientes do período `from`–`to` (datas no fuso da clínica):
 *
 * - Ranking de sessões: atendimentos concluídos de clientes (lead fica de
 *   fora) cuja data de início cai no período.
 * - Ranking de recebimentos: pagamentos menos estornos (como no caixa do dia)
 *   pela data do evento; só entra quem ficou com saldo positivo.
 * - Os dois rankings vão até 20 clientes, em ordem decrescente e, no empate,
 *   por nome.
 * - Ativo: atendimento concluído no período ou plano vigente em algum dia do
 *   período (mesma regra da retenção: vigência de `validFrom` até o menor
 *   entre `validUntil` e o dia do cancelamento; pausado conta como vigente).
 * - Faixa etária: idade completa na data `to`; sem data de nascimento (ou
 *   data posterior a `to`) cai em "sem data".
 */
export function buildClientReport(
  period: { from: string; to: string },
  sources: ClientReportSources,
  timeZone: string = DEFAULT_CLINIC_TIMEZONE,
  generatedAt: Date = new Date(),
): ClientReport {
  const inPeriod = (date: string) => date >= period.from && date <= period.to;
  const dateOf = (iso: string) => clinicDateOf(iso, timeZone);
  const patients = new Map(sources.patients.map((item) => [item.id, item]));
  const names = new Map<string, string>();
  const nameOf = (patientId: string) =>
    patients.get(patientId)?.fullName ?? names.get(patientId) ?? "";

  const active = new Set<string>();
  const sessions = new Map<string, number>();
  for (const appointment of sources.appointments) {
    if (appointment.status !== "completed" || !appointment.patientId) continue;
    if (!inPeriod(dateOf(appointment.startsAt))) continue;
    names.set(appointment.patientId, appointment.patientName);
    active.add(appointment.patientId);
    sessions.set(
      appointment.patientId,
      (sessions.get(appointment.patientId) ?? 0) + 1,
    );
  }

  for (const plan of sources.plans) {
    let end = plan.validUntil || OPEN_END;
    if (plan.status === "cancelled" && plan.cancelledAt) {
      const cancelDate = dateOf(plan.cancelledAt);
      if (cancelDate < end) end = cancelDate;
    }
    if (end < plan.validFrom) continue;
    if (plan.validFrom <= period.to && end >= period.from) active.add(plan.patientId);
  }

  const received = new Map<string, number>();
  for (const payment of sources.payments) {
    if (!inPeriod(dateOf(payment.occurredAt))) continue;
    names.set(payment.patientId, payment.patientName);
    const amount =
      payment.kind === "reversal"
        ? -Math.abs(payment.amountInCents)
        : payment.amountInCents;
    received.set(payment.patientId, (received.get(payment.patientId) ?? 0) + amount);
  }

  const rank = <T extends { patientName: string; patientId: string }>(
    entries: T[],
    value: (entry: T) => number,
  ) =>
    entries
      .sort(
        (a, b) =>
          value(b) - value(a) ||
          a.patientName.localeCompare(b.patientName, "pt-BR") ||
          a.patientId.localeCompare(b.patientId),
      )
      .slice(0, CLIENT_RANKING_SIZE);

  const topBySessions = rank<ClientSessionsRankingEntry>(
    [...sessions].map(([patientId, completedSessions]) => ({
      patientId,
      patientName: nameOf(patientId),
      completedSessions,
    })),
    (entry) => entry.completedSessions,
  );
  const topByRevenue = rank<ClientRevenueRankingEntry>(
    [...received]
      .filter(([, amount]) => amount > 0)
      .map(([patientId, receivedInCents]) => ({
        patientId,
        patientName: nameOf(patientId),
        receivedInCents,
      })),
    (entry) => entry.receivedInCents,
  );

  const bands = new Map<ClientAgeBand, number>();
  for (const patientId of active) {
    const band = ageBandOf(ageOn(patients.get(patientId)?.birthDate, period.to));
    bands.set(band, (bands.get(band) ?? 0) + 1);
  }

  return {
    generatedAt: generatedAt.toISOString(),
    from: period.from,
    to: period.to,
    topBySessions,
    topByRevenue,
    activeClients: active.size,
    ageDistribution: clientAgeBandSchema.options.map((band) => ({
      band,
      label: clientAgeBandLabels[band],
      clients: bands.get(band) ?? 0,
    })),
  };
}
