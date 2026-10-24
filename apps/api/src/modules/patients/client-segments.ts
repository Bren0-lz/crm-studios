import type { ClinicRepository } from "../../repository.js";
import { clinicDateOf } from "../finance/daily-cash.js";
export async function clientSegments(
  repository: ClinicRepository,
  clinicId: string,
  financial = false,
) {
  const settings = await repository.getClinicSettings(clinicId),
    timeZone = settings?.timezone ?? "America/Sao_Paulo",
    today = clinicDateOf(new Date(), timeZone),
    now = new Date().toISOString(),
    // Último ano para "último atendimento", serviços e profissionais do cliente.
    since = new Date(Date.now() - 365 * 86400000).toISOString(),
    to = new Date(Date.now() + 31 * 86400000).toISOString();
  const [patients, plans, groups, appointments, finance] = await Promise.all([
    repository.listPatients(clinicId),
    repository.listPatientPlans(clinicId),
    repository.getGroupWorkspace(clinicId, since, to),
    repository.listAppointments(
      clinicId,
      since,
      new Date(Date.now() + 365 * 86400000).toISOString(),
    ),
    financial
      ? repository.getFinancialSummary(clinicId)
      : Promise.resolve(null),
  ]);
  const horizon = clinicDateOf(new Date(Date.now() + 30 * 86400000), timeZone);
  const groupById = new Map(groups.groups.map((group) => [group.id, group]));
  const presentSessions = new Map(
    groups.sessions
      .filter((session) => session.startsAt <= now)
      .map((session) => [session.id, session.startsAt]),
  );
  const sorted = (values: (string | undefined)[]) =>
    [
      ...new Set(values.filter((value): value is string => Boolean(value))),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return patients.map((patient) => {
    const current = plans.filter(
      (plan) =>
        plan.patientId === patient.id &&
        plan.status === "active" &&
        plan.validFrom <= today &&
        (!plan.validUntil || plan.validUntil >= today),
    );
    const own = appointments.filter(
      (appointment) =>
        appointment.patientId === patient.id &&
        appointment.status !== "cancelled",
    );
    const enrolled = groups.enrollments
      .filter(
        (enrollment) =>
          enrollment.patientId === patient.id && enrollment.status === "active",
      )
      .flatMap((enrollment) => groupById.get(enrollment.groupId) ?? []);
    const visits = [
      ...own
        .filter((appointment) => appointment.status === "completed")
        .map((appointment) => appointment.startsAt),
      ...groups.attendance
        .filter(
          (item) =>
            item.patientId === patient.id &&
            (item.status === "present" || item.status === "replacement"),
        )
        .map((item) => presentSessions.get(item.sessionId)),
    ].filter((value): value is string => Boolean(value));
    const lastVisit = visits.sort().at(-1);
    const next = own
      .filter(
        (appointment) =>
          appointment.startsAt > now &&
          (appointment.status === "scheduled" ||
            appointment.status === "confirmed"),
      )
      .map((appointment) => appointment.startsAt)
      .sort()[0];
    return {
      patientId: patient.id,
      services: sorted([
        ...current.flatMap((plan) =>
          plan.services.length
            ? plan.services.map((service) => service.serviceName)
            : [plan.serviceName],
        ),
        ...enrolled.map((group) => group.serviceName),
        ...own.map((appointment) => appointment.serviceName),
      ]),
      groups: sorted(enrolled.map((group) => group.name)),
      professionals: sorted([
        ...enrolled.map((group) => group.professionalName),
        ...own.map((appointment) => appointment.professionalName),
      ]),
      ...(lastVisit ? { lastVisitOn: clinicDateOf(lastVisit, timeZone) } : {}),
      ...(next ? { nextAppointmentAt: next } : {}),
      activePlans: current.length,
      renewalDue: current.some(
        (plan) => plan.validUntil && plan.validUntil <= horizon,
      ),
      availableReplacements: groups.replacementCredits.filter(
        (credit) =>
          credit.patientId === patient.id && credit.status === "available",
      ).length,
      waiting: groups.enrollments.filter(
        (enrollment) =>
          enrollment.patientId === patient.id &&
          enrollment.status === "waitlisted",
      ).length,
      ...(finance
        ? {
            pendingReceivables: finance.receivables.filter(
              (entry) =>
                entry.patientId === patient.id && entry.status === "open",
            ).length,
            overdueReceivables: finance.receivables.filter(
              (entry) =>
                entry.patientId === patient.id &&
                entry.status === "open" &&
                entry.dueDate < today,
            ).length,
          }
        : {}),
    };
  });
}
