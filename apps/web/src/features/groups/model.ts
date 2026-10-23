import type {
  GroupClass,
  GroupEnrollment,
  GroupSession,
  PatientPlan,
  Service,
} from "@crm/contracts";
import { groupOperationRange } from "../../shared/lib/formatting";

/** "Pilates Turma A · 18 de out. · 18:00", com data e hora no fuso da clínica (não no do navegador). */
export function groupSessionLabel(session: GroupSession, timezone: string) {
  const startsAt = new Date(session.startsAt);
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
  }).format(startsAt);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(startsAt);
  return `${session.groupName} · ${date} · ${time}`;
}

export const groupSessionStatusLabels: Record<GroupSession["status"], string> =
  {
    scheduled: "Agendado",
    completed: "Concluído",
    cancelled: "Cancelado",
  };

/** Datas do calendário ("AAAA-MM-DD") calculadas ao meio-dia UTC: sem efeito de fuso. */
function utcNoon(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

export function shiftIsoDate(date: string, days: number) {
  const value = utcNoon(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** "2026-12" + 1 → "2027-01". */
export function shiftMonth(month: string, offset: number) {
  const [year, monthIndex] = month.split("-").map(Number) as [number, number];
  const value = new Date(Date.UTC(year, monthIndex - 1 + offset, 1, 12));
  return value.toISOString().slice(0, 7);
}

/** Dias da grade do mês, de segunda a domingo (semanas completas). */
export function calendarMonthDays(month: string) {
  const first = `${month}-01`;
  const start = shiftIsoDate(first, -((utcNoon(first).getUTCDay() + 6) % 7));
  const last = shiftIsoDate(`${shiftMonth(month, 1)}-01`, -1);
  const end = shiftIsoDate(last, 6 - ((utcNoon(last).getUTCDay() + 6) % 7));
  const days: string[] = [];
  for (let day = start; day <= end; day = shiftIsoDate(day, 1)) days.push(day);
  return days;
}

/**
 * Período consultado no workspace: a grade inteira do mês visível (com um dia de folga
 * para qualquer fuso) somada à janela operacional das reposições.
 */
export function groupCalendarRange(month: string, now = new Date()) {
  const days = calendarMonthDays(month);
  const operation = groupOperationRange(now);
  const from = `${shiftIsoDate(days[0]!, -1)}T00:00:00.000Z`;
  const to = `${shiftIsoDate(days[days.length - 1]!, 2)}T00:00:00.000Z`;
  return {
    from: from < operation.from ? from : operation.from,
    to: to > operation.to ? to : operation.to,
  };
}

/** Semanas consideradas num mês, como nos planos (`planSessionsForPeriod`). */
const weeksPerMonth = 4;

export interface GroupRevenueRow {
  group: GroupClass;
  enrolled: number;
  freeSeats: number;
  /** Encontros por mês: horários semanais × 4 semanas. */
  sessionsPerMonth: number;
  /** Soma mensal dos planos ativos dos matriculados para o serviço da turma. */
  currentInCents: number;
  /** Atual + vagas livres × valor de referência por aluno (turma cheia). */
  potentialInCents: number;
}

/**
 * Faturamento mensal de cada turma. Cada matriculado contribui com o valor por sessão do
 * plano ativo mais recente que cobre o serviço da turma (valor do serviço ÷ sessões)
 * × encontros da turma no mês. Matriculado sem plano ativo não soma. As vagas livres
 * valem o ticket médio dos matriculados com plano; sem nenhum, o preço avulso do serviço.
 */
export function groupRevenueOverview(
  groups: GroupClass[],
  enrollments: GroupEnrollment[],
  plans: PatientPlan[],
  services: Pick<Service, "id" | "priceInCents">[],
  today: string,
): GroupRevenueRow[] {
  return groups.map((group) => {
    const sessionsPerMonth = (group.weeklySlots ?? []).length * weeksPerMonth;
    const members = enrollments.filter(
      (item) => item.groupId === group.id && item.status === "active",
    );
    const monthlyValues = members.flatMap((member) => {
      const share = plans
        .filter(
          (plan) =>
            plan.patientId === member.patientId &&
            plan.status === "active" &&
            plan.validFrom <= today &&
            (!plan.validUntil || plan.validUntil >= today),
        )
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
        .flatMap((plan) => plan.services)
        .find((item) => item.serviceId === group.serviceId);
      return share
        ? [
            Math.round(
              (share.totalValueInCents / share.totalSessions) *
                sessionsPerMonth,
            ),
          ]
        : [];
    });
    const currentInCents = monthlyValues.reduce((sum, value) => sum + value, 0);
    const referenceInCents = monthlyValues.length
      ? Math.round(currentInCents / monthlyValues.length)
      : (services.find((item) => item.id === group.serviceId)?.priceInCents ??
          0) * sessionsPerMonth;
    const enrolled = group.activeEnrollments;
    const freeSeats = Math.max(0, group.capacity - enrolled);
    return {
      group,
      enrolled,
      freeSeats,
      sessionsPerMonth,
      currentInCents,
      potentialInCents: currentInCents + freeSeats * referenceInCents,
    };
  });
}
