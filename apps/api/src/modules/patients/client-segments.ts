import type { ClinicRepository } from "../../repository.js";
import { clinicDateOf } from "../finance/daily-cash.js";
export async function clientSegments(
  repository: ClinicRepository,
  clinicId: string,
  financial = false,
) {
  const settings = await repository.getClinicSettings(clinicId),
    today = clinicDateOf(new Date(), settings?.timezone ?? "America/Sao_Paulo"),
    to = new Date(Date.now() + 31 * 86400000).toISOString();
  const [patients, plans, groups, finance] = await Promise.all([
    repository.listPatients(clinicId),
    repository.listPatientPlans(clinicId),
    repository.getGroupWorkspace(clinicId, new Date().toISOString(), to),
    financial
      ? repository.getFinancialSummary(clinicId)
      : Promise.resolve(null),
  ]);
  const horizon = clinicDateOf(
    new Date(Date.now() + 30 * 86400000),
    settings?.timezone ?? "America/Sao_Paulo",
  );
  return patients.map((patient) => {
    const current = plans.filter(
      (plan) =>
        plan.patientId === patient.id &&
        plan.status === "active" &&
        plan.validFrom <= today &&
        (!plan.validUntil || plan.validUntil >= today),
    );
    return {
      patientId: patient.id,
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
