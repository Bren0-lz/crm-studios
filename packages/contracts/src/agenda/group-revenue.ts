import type { PatientPlan } from "../plans/types.js";
import type { GroupClass, GroupEnrollment } from "./types.js";

/** Semanas consideradas num mês, como nos planos (`planSessionsForPeriod`). */
const weeksPerMonth = 4;

export interface GroupRevenueMember {
  enrollment: GroupEnrollment;
  /** Valor mensal do plano para a turma; null quando não há plano ativo. */
  monthlyInCents: number | null;
}

export interface GroupRevenueRow {
  group: GroupClass;
  /** Matrículas ativas, em ordem alfabética. */
  members: GroupRevenueMember[];
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
 * valem o ticket médio dos matriculados com plano; sem nenhum, o valor por sessão do plano
 * avulso do serviço (`singlePlanSessionPrices`).
 */
export function groupRevenueOverview(
  groups: GroupClass[],
  enrollments: GroupEnrollment[],
  plans: PatientPlan[],
  singleSessionPrices: ReadonlyMap<string, number>,
  today: string,
): GroupRevenueRow[] {
  return groups.map((group) => {
    const sessionsPerMonth = (group.weeklySlots ?? []).length * weeksPerMonth;
    const members = enrollments
      .filter((item) => item.groupId === group.id && item.status === "active")
      .sort((a, b) => a.patientName.localeCompare(b.patientName, "pt-BR"))
      .map((enrollment): GroupRevenueMember => {
        const share = plans
          .filter(
            (plan) =>
              plan.patientId === enrollment.patientId &&
              plan.status === "active" &&
              plan.validFrom <= today &&
              (!plan.validUntil || plan.validUntil >= today),
          )
          .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
          .flatMap((plan) => plan.services)
          .find((item) => item.serviceId === group.serviceId);
        return {
          enrollment,
          monthlyInCents: share
            ? Math.round(
                (share.totalValueInCents / share.totalSessions) *
                  sessionsPerMonth,
              )
            : null,
        };
      });
    const monthlyValues = members.flatMap((member) =>
      member.monthlyInCents === null ? [] : [member.monthlyInCents],
    );
    const currentInCents = monthlyValues.reduce((sum, value) => sum + value, 0);
    const referenceInCents = monthlyValues.length
      ? Math.round(currentInCents / monthlyValues.length)
      : (singleSessionPrices.get(group.serviceId) ?? 0) * sessionsPerMonth;
    const enrolled = group.activeEnrollments;
    const freeSeats = Math.max(0, group.capacity - enrolled);
    return {
      group,
      members,
      enrolled,
      freeSeats,
      sessionsPerMonth,
      currentInCents,
      potentialInCents: currentInCents + freeSeats * referenceInCents,
    };
  });
}
