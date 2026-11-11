import {
  type PatientMergeInput,
  type Patient,
  saoPauloToday,
} from "@crm/contracts";
import {
  mergePreview,
  validateMerge,
  inactivityCutoff,
} from "../../modules/patients/management.js";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now } from "./helpers.js";

export function createPatientManagementRepository(
  context: MemoryRepositoryContext,
) {
  const previewMerge = (
    clinicId: string,
    sourceId: string,
    targetId: string,
  ) => {
    const source = context.patients.find(
      (item) => item.clinicId === clinicId && item.id === sourceId,
    );
    const target = context.patients.find(
      (item) => item.clinicId === clinicId && item.id === targetId,
    );
    const conflicts: string[] = [];
    if (
      context.groupEnrollments.some(
        (a) =>
          a.clinicId === clinicId &&
          a.patientId === sourceId &&
          a.status !== "cancelled" &&
          context.groupEnrollments.some(
            (b) =>
              b.clinicId === clinicId &&
              b.patientId === targetId &&
              b.groupId === a.groupId &&
              b.status !== "cancelled",
          ),
      )
    )
      conflicts.push(
        "Os dois clientes têm matrícula na mesma turma. Cancele a matrícula duplicada.",
      );
    if (
      context.groupAttendance.some(
        (a) =>
          a.clinicId === clinicId &&
          a.patientId === sourceId &&
          context.groupAttendance.some(
            (b) =>
              b.clinicId === clinicId &&
              b.patientId === targetId &&
              b.sessionId === a.sessionId,
          ),
      )
    )
      conflicts.push(
        "Existem frequências dos dois clientes no mesmo encontro. Revise os registros antes de mesclar.",
      );
    return mergePreview(source, target, conflicts);
  };
  const inactiveCandidates = (clinicId: string, months: number) => {
    const today = saoPauloToday(),
      cutoff = inactivityCutoff(today, months);
    return context.patients
      .filter(
        (patient) =>
          patient.clinicId === clinicId &&
          patient.status === "active" &&
          !patient.mergedIntoPatientId &&
          !context.isTrashed("patients", patient.id),
      )
      .filter((patient) => {
        if (
          context.patientPlans.some(
            (plan) =>
              plan.clinicId === clinicId &&
              plan.patientId === patient.id &&
              plan.status === "active" &&
              plan.validFrom <= today &&
              (!plan.validUntil || plan.validUntil >= today),
          )
        )
          return false;
        if (
          context.groupEnrollments.some(
            (enrollment) =>
              enrollment.clinicId === clinicId &&
              enrollment.patientId === patient.id &&
              enrollment.status === "active" &&
              context.groupSessions.some(
                (session) =>
                  session.clinicId === clinicId &&
                  session.groupId === enrollment.groupId &&
                  session.status === "scheduled" &&
                  session.startsAt >= today,
              ),
          )
        )
          return false;
        if (
          context.appointments.some(
            (appointment) =>
              appointment.clinicId === clinicId &&
              !context.isTrashed("appointments", appointment.id) &&
              appointment.patientId === patient.id &&
              appointment.status !== "cancelled" &&
              appointment.startsAt.slice(0, 10) >= cutoff,
          )
        )
          return false;
        if (
          context.groupAttendance.some(
            (attendance) =>
              attendance.clinicId === clinicId &&
              attendance.patientId === patient.id &&
              context.groupSessions.some(
                (session) =>
                  session.id === attendance.sessionId &&
                  session.startsAt.slice(0, 10) >= cutoff,
              ),
          )
        )
          return false;
        return patient.createdAt.slice(0, 10) <= cutoff;
      })
      .map((patient) => ({ ...patient }));
  };
  return {
    async getPatient(clinicId: string, patientId: string) {
      const original = context.patients.find(
        (item) => item.clinicId === clinicId && item.id === patientId,
      );
      const patient = original?.mergedIntoPatientId
        ? context.patients.find(
            (item) =>
              item.clinicId === clinicId &&
              item.id === original.mergedIntoPatientId,
          )
        : original;
      return patient && !context.isTrashed("patients", patient.id)
        ? structuredClone(patient)
        : null;
    },
    async setPatientStatus(
      clinicId: string,
      actorUserId: string,
      patientId: string,
      status: Patient["status"],
    ) {
      const patient = context.patients.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === patientId &&
          !item.mergedIntoPatientId,
      );
      if (!patient) return null;
      if (patient.status !== status) {
        patient.status = status;
        patient.updatedAt = now();
        if (status === "inactive") patient.inactiveAt = now();
        else delete patient.inactiveAt;
        context.recordAudit(
          clinicId,
          actorUserId,
          "patient.status",
          "patient",
          { status },
          patientId,
        );
      }
      return { ...patient };
    },
    async previewInactivePatients(clinicId: string, months: number) {
      return inactiveCandidates(clinicId, months);
    },
    async inactivatePatients(
      clinicId: string,
      actorUserId: string,
      months: number,
      patientIds: string[],
    ) {
      const eligible = new Set(
        inactiveCandidates(clinicId, months).map((item) => item.id),
      );
      let changed = 0;
      for (const id of new Set(patientIds))
        if (eligible.has(id)) {
          const item = context.patients.find(
            (patient) => patient.clinicId === clinicId && patient.id === id,
          )!;
          item.status = "inactive";
          item.inactiveAt = now();
          item.updatedAt = now();
          changed++;
        }
      context.recordAudit(
        clinicId,
        actorUserId,
        "patients.inactivated",
        "patient",
        { months, changed },
      );
      return { changed, skipped: patientIds.length - changed };
    },
    async previewPatientMerge(
      clinicId: string,
      sourceId: string,
      targetId: string,
    ) {
      return previewMerge(clinicId, sourceId, targetId);
    },
    async mergePatients(
      clinicId: string,
      actorUserId: string,
      input: PatientMergeInput,
    ) {
      const preview = previewMerge(clinicId, input.sourceId, input.targetId);
      const merged = validateMerge(preview, input);
      if (
        merged.cpf &&
        context.patients.some(
          (item) =>
            item.clinicId === clinicId &&
            item.id !== input.sourceId &&
            item.id !== input.targetId &&
            item.cpf === merged.cpf,
        )
      )
        throw new DomainError(
          "PATIENT_DUPLICATE",
          "Já existe um cliente com este CPF.",
          409,
        );
      const source = context.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.sourceId,
      )!;
      const target = context.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.targetId,
      )!;
      Object.assign(target, merged, { updatedAt: now() });
      source.status = "inactive";
      source.inactiveAt = now();
      source.mergedIntoPatientId = target.id;
      source.updatedAt = now();
      delete source.cpf;
      for (const preference of [...context.communicationPreferences].filter(
        (item) => item.clinicId === clinicId && item.patientId === source.id,
      )) {
        const existing = context.communicationPreferences.find(
          (item) =>
            item.clinicId === clinicId &&
            item.patientId === target.id &&
            item.channel === preference.channel,
        );
        if (existing) {
          existing.allowed = existing.allowed && preference.allowed;
          context.communicationPreferences.splice(
            context.communicationPreferences.indexOf(preference),
            1,
          );
        }
      }
      for (const patient of context.patients)
        if (
          patient.clinicId === clinicId &&
          patient.mergedIntoPatientId === source.id
        )
          patient.mergedIntoPatientId = target.id;
      for (const [collectionName, collection] of Object.entries(context))
        if (
          Array.isArray(collection) &&
          !/^(clinical|therapeutic|treatment)/.test(collectionName)
        )
          for (const value of collection) {
            if (typeof value !== "object" || !value) continue;
            const row = value as Record<string, unknown>;
            if (row.clinicId === clinicId && row.patientId === source.id) {
              row.patientId = target.id;
              if (
                row.data &&
                typeof row.data === "object" &&
                "patientId" in row.data
              )
                (row.data as { patientId: string }).patientId = target.id;
              if (
                "patientName" in row &&
                collectionName !== "externalOperations"
              )
                row.patientName = target.fullName;
            }
          }
      context.recordAudit(
        clinicId,
        actorUserId,
        "patients.merged",
        "patient",
        {
          sourceId: source.id,
          targetId: target.id,
          sourceSnapshot: preview.source,
        },
        target.id,
      );
      return { ...target };
    },
  };
}
