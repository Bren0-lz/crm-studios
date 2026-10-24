import {
  type GroupClass,
  type GroupEnrollment,
  type PatientPlan,
  type Service,
  type TeamFinanceReport,
  type TeamProductionSources,
  addMonthsToIsoDate,
  sessionValueInCents,
} from "@crm/contracts";

/** Competências (AAAA-MM) de `from` até `to`, inclusive. */
export function competencesBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (
    let cursor = `${from.slice(0, 7)}-01`;
    cursor.slice(0, 7) <= to.slice(0, 7);
    cursor = addMonthsToIsoDate(cursor, 1)
  )
    months.push(cursor.slice(0, 7));
  return months;
}

export function buildTeamFinanceReport(input: {
  from: string;
  to: string;
  sources: TeamProductionSources;
  plans: PatientPlan[];
  services: Service[];
  groups: GroupClass[];
  enrollments: GroupEnrollment[];
}): TeamFinanceReport {
  const plans = new Map(input.plans.map((plan) => [plan.id, plan]));
  const prices = new Map(
    input.services.map((service) => [service.id, service.priceInCents]),
  );
  const valueOf = (serviceId: string, plan?: PatientPlan) =>
    sessionValueInCents(
      plan?.services.find((entry) => entry.serviceId === serviceId),
      prices.get(serviceId) ?? 0,
    );

  type Totals = { id: string; name: string; sessions: number; value: number };
  const professionals = new Map<string, Totals>();
  const services = new Map<string, Totals>();
  const add = (
    map: Map<string, Totals>,
    id: string,
    name: string,
    value: number,
  ) => {
    const row = map.get(id) ?? { id, name, sessions: 0, value: 0 };
    row.sessions += 1;
    row.value += value;
    map.set(id, row);
  };
  for (const session of input.sources.sessions) {
    const value = valueOf(
      session.serviceId,
      session.planId ? plans.get(session.planId) : undefined,
    );
    add(professionals, session.professionalId, session.professionalName, value);
    add(services, session.serviceId, session.serviceName, value);
  }

  const commissions = new Map<
    string,
    TeamFinanceReport["byProfessional"][number]["commission"]
  >();
  const commissionOf = (professionalId: string, name: string) => {
    if (!professionals.has(professionalId))
      professionals.set(professionalId, {
        id: professionalId,
        name,
        sessions: 0,
        value: 0,
      });
    const row = commissions.get(professionalId) ?? {
      paidInCents: 0,
      openInCents: 0,
      pendingInCents: 0,
      totalInCents: 0,
    };
    commissions.set(professionalId, row);
    return row;
  };
  for (const entry of input.sources.commissions) {
    const row = commissionOf(entry.professionalId, entry.professionalName);
    if (entry.status === "paid") row.paidInCents += entry.amountInCents;
    else row.openInCents += entry.amountInCents;
    row.totalInCents += entry.amountInCents;
  }
  for (const entry of input.sources.pendingCommissions) {
    const row = commissionOf(entry.professionalId, entry.professionalName);
    row.pendingInCents += entry.amountInCents;
    row.totalInCents += entry.amountInCents;
  }

  const byGroup = input.groups
    .filter((group) => group.active)
    .map((group) => {
      const monthlySessions = group.weeklySlots.length * 4;
      const seats = input.enrollments
        .filter(
          (enrollment) =>
            enrollment.groupId === group.id && enrollment.status === "active",
        )
        .map((enrollment) => {
          const plan = input.plans
            .filter(
              (item) =>
                item.patientId === enrollment.patientId &&
                item.status === "active" &&
                item.services.some(
                  (entry) => entry.serviceId === group.serviceId,
                ),
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          return valueOf(group.serviceId, plan) * monthlySessions;
        });
      const monthlyRevenueInCents = seats.reduce((sum, item) => sum + item, 0);
      const seatValue = seats.length
        ? monthlyRevenueInCents / seats.length
        : valueOf(group.serviceId) * monthlySessions;
      const potentialRevenueInCents = Math.max(
        monthlyRevenueInCents,
        Math.round(seatValue * group.capacity),
      );
      return {
        id: group.id,
        name: group.name,
        serviceName: group.serviceName,
        professionalName: group.professionalName,
        capacity: group.capacity,
        activeEnrollments: seats.length,
        occupancyRate: Math.round((seats.length / group.capacity) * 100),
        monthlySessions,
        monthlyRevenueInCents,
        potentialRevenueInCents,
        idleRevenueInCents: potentialRevenueInCents - monthlyRevenueInCents,
      };
    })
    .sort((a, b) => b.idleRevenueInCents - a.idleRevenueInCents);

  return {
    commissionMonths: competencesBetween(input.from, input.to),
    byProfessional: [...professionals.values()]
      .map((row) => ({
        id: row.id,
        name: row.name,
        completedSessions: row.sessions,
        generatedInCents: row.value,
        commission: commissions.get(row.id) ?? {
          paidInCents: 0,
          openInCents: 0,
          pendingInCents: 0,
          totalInCents: 0,
        },
      }))
      .sort((a, b) => b.generatedInCents - a.generatedInCents),
    byService: [...services.values()]
      .map((row) => ({
        id: row.id,
        name: row.name,
        completedSessions: row.sessions,
        generatedInCents: row.value,
        averageTicketInCents: row.sessions
          ? Math.round(row.value / row.sessions)
          : 0,
      }))
      .sort((a, b) => b.generatedInCents - a.generatedInCents),
    byGroup,
  };
}
