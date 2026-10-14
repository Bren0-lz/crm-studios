import { createClinicWriteLock } from "./write-lock.js";
import {
  type ClinicalResource,
  type ClinicalResourceInput,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { validateClinicalResource } from "../../modules/clinical/resources.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createClinicalResourcesRepository(
  context: MemoryRepositoryContext,
) {
  const resources = context.clinicalResources;
  const write = createClinicWriteLock();
  const operations = {
    async listClinicalSources(clinicId: string, patientId?: string) {
      const appointments = context.appointments
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.patientId &&
            item.status !== "cancelled" &&
            (!patientId ||
              context.patientIds(clinicId, patientId).has(item.patientId)),
        )
        .map((item) => ({
          id: item.id,
          type: "appointment" as const,
          patientId:
            context.patients.find(
              (p) => p.clinicId === clinicId && p.id === item.patientId,
            )?.mergedIntoPatientId ?? item.patientId!,
          patientName: item.patientName,
          professionalId: item.professionalId,
          professionalName: item.professionalName,
          startsAt: item.startsAt,
        }));
      const groups = context.groupAttendance
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            (item.status === "present" || item.outcome === "present") &&
            (!patientId ||
              context.patientIds(clinicId, patientId).has(item.patientId)),
        )
        .flatMap((item) => {
          const meeting = context.groupSessions.find(
            (session) =>
              session.clinicId === clinicId &&
              session.id === item.sessionId &&
              session.status !== "cancelled",
          );
          return meeting
            ? [
                {
                  id: item.id,
                  type: "group_attendance" as const,
                  patientId:
                    context.patients.find(
                      (p) => p.clinicId === clinicId && p.id === item.patientId,
                    )?.mergedIntoPatientId ?? item.patientId,
                  patientName: item.patientName,
                  professionalId: meeting.professionalId,
                  professionalName: meeting.professionalName,
                  startsAt: meeting.startsAt,
                },
              ]
            : [];
        });
      return [...appointments, ...groups].sort((a, b) =>
        b.startsAt.localeCompare(a.startsAt),
      );
    },
    async listClinicalResources(
      clinicId: string,
      actorUserId: string,
      patientId?: string,
      action: "read" | "export" = "read",
      catalogOnly = false,
    ) {
      if (patientId) {
        if (
          !context.patients.some(
            (item) => item.clinicId === clinicId && item.id === patientId,
          )
        )
          throw new DomainError(
            "PATIENT_NOT_FOUND",
            "Cliente não encontrado.",
            404,
          );
        context.addClinicalAccessEvent(
          clinicId,
          patientId,
          actorUserId,
          action,
          "workspace",
        );
      }
      if (!patientId && !catalogOnly)
        for (const id of new Set(
          resources
            .filter((item) => item.clinicId === clinicId && item.patientId)
            .map((item) => item.patientId!),
        ))
          context.addClinicalAccessEvent(
            clinicId,
            id,
            actorUserId,
            action,
            "workspace",
          );
      return structuredClone(
        resources
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              (!catalogOnly || !item.patientId) &&
              (!patientId ||
                !item.patientId ||
                context.patientIds(clinicId, patientId).has(item.patientId)),
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    },
    async saveClinicalResource(
      clinicId: string,
      actorUserId: string,
      input: ClinicalResourceInput,
      id?: string,
    ) {
      const previous = resources.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (id && !previous)
        throw new DomainError(
          "CLINICAL_RESOURCE_NOT_FOUND",
          "Registro clínico não encontrado.",
          404,
        );
      const actor = context.users.find(
        (item) => item.clinicId === clinicId && item.id === actorUserId,
      );
      if (!actor)
        throw new DomainError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
      const templateSnapshot = await validateClinicalResource(
        input,
        {
          samePatient: async (a, b) => {
            const first = await context.operations.getPatient(clinicId, a),
              second = await context.operations.getPatient(clinicId, b);
            return Boolean(first && second && first.id === second.id);
          },
          patient: async (patientId) =>
            context.patients.some(
              (item) => item.clinicId === clinicId && item.id === patientId,
            ),
          professional: async (professionalId) =>
            context.professionals.some(
              (item) =>
                item.clinicId === clinicId && item.id === professionalId,
            ),
          resource: async (resourceId) =>
            resources.find(
              (item) => item.clinicId === clinicId && item.id === resourceId,
            ),
          catalog: async (catalogId, kind) =>
            (
              await context.operations.listClinicCatalog(
                clinicId,
                kind as "muscle_group",
              )
            ).some((item) => item.id === catalogId),
          source: async (type, sourceId) => {
            if (type === "appointment") {
              const appointment = context.appointments.find(
                (item) =>
                  item.clinicId === clinicId &&
                  item.id === sourceId &&
                  item.patientId &&
                  item.status !== "cancelled",
              );
              return appointment?.patientId
                ? {
                    patientId: appointment.patientId,
                    professionalId: appointment.professionalId,
                  }
                : undefined;
            }
            const attendance = context.groupAttendance.find(
              (item) =>
                item.clinicId === clinicId &&
                item.id === sourceId &&
                (item.status === "present" || item.outcome === "present"),
            );
            const meeting = context.groupSessions.find(
              (item) =>
                item.clinicId === clinicId && item.id === attendance?.sessionId,
            );
            return attendance && meeting
              ? {
                  patientId: attendance.patientId,
                  professionalId: meeting.professionalId,
                }
              : undefined;
          },
          executions: async (trainingId) =>
            resources.filter(
              (item) =>
                item.clinicId === clinicId &&
                item.data.kind === "training_execution" &&
                item.data.trainingId === trainingId,
            ).length,
        },
        previous,
      );
      const fork =
        previous?.kind === "evolution_template" &&
        previous.status === "published";
      const resourceId = !previous || fork ? uuid() : previous.id;
      const originStartsAt =
        previous?.originStartsAt ??
        (input.kind === "evolution"
          ? input.sourceType === "appointment"
            ? context.appointments.find(
                (entry) =>
                  entry.clinicId === clinicId && entry.id === input.sourceId,
              )?.startsAt
            : context.groupSessions.find(
                (entry) =>
                  entry.clinicId === clinicId &&
                  entry.id ===
                    context.groupAttendance.find(
                      (attendance) =>
                        attendance.clinicId === clinicId &&
                        attendance.id === input.sourceId,
                    )?.sessionId,
              )?.startsAt
          : undefined);
      const item: ClinicalResource = {
        ...(originStartsAt ? { originStartsAt } : {}),
        id: resourceId,
        clinicId,
        kind: input.kind,
        name: input.name,
        ...("patientId" in input ? { patientId: input.patientId } : {}),
        data: structuredClone(input),
        status:
          input.kind === "evolution_template"
            ? input.status
            : input.kind === "evolution" || input.kind === "clinical_document"
              ? "draft"
              : "active" in input && !input.active
                ? "inactive"
                : "active",
        familyId: previous?.familyId ?? resourceId,
        version:
          previous?.kind === "evolution_template"
            ? Math.max(
                ...resources
                  .filter(
                    (item) =>
                      item.clinicId === clinicId &&
                      item.familyId === previous.familyId,
                  )
                  .map((item) => item.version),
              ) + 1
            : (previous?.version ?? 0) + 1,
        authorId: actor.id,
        authorName: actor.fullName,
        createdAt: fork ? now() : (previous?.createdAt ?? now()),
        updatedAt: now(),
        history: previous
          ? [
              ...previous.history,
              {
                ...(previous.templateSnapshot
                  ? {
                      templateSnapshot: structuredClone(
                        previous.templateSnapshot,
                      ),
                    }
                  : {}),
                version: previous.version,
                data: structuredClone(previous.data),
                authorName: previous.authorName,
                occurredAt: previous.updatedAt,
              },
            ]
          : [],
        ...(templateSnapshot ? { templateSnapshot } : {}),
      };
      if (previous && !fork) Object.assign(previous, item);
      else resources.push(item);
      context.recordAudit(
        clinicId,
        actorUserId,
        "clinical.resource_saved",
        "clinical_resource",
        { kind: input.kind, version: item.version },
        item.id,
      );
      return structuredClone(item);
    },
    async finalizeClinicalResource(
      clinicId: string,
      actorUserId: string,
      id: string,
    ) {
      const item = resources.find(
        (entry) => entry.clinicId === clinicId && entry.id === id,
      );
      if (!item || !["evolution", "clinical_document"].includes(item.kind))
        throw new DomainError(
          "CLINICAL_RESOURCE_NOT_FOUND",
          "Evolução ou documento não encontrado.",
          404,
        );
      if (item.status !== "finalized") {
        const data = item.data;
        if (
          data.kind === "evolution" &&
          ![
            data.body,
            data.subjective,
            data.objective,
            data.assessment,
            data.plan,
            Object.keys(data.values).length ? "respostas" : "",
          ].some(Boolean)
        )
          throw new DomainError(
            "CLINICAL_RECORD_EMPTY",
            "Preencha o registro antes de finalizar.",
            400,
          );
        item.status = "finalized";
        item.updatedAt = now();
        context.recordAudit(
          clinicId,
          actorUserId,
          "clinical.resource_finalized",
          "clinical_resource",
          {},
          id,
        );
      }
      return structuredClone(item);
    },
  };
  return {
    ...operations,
    saveClinicalResource: (
      ...args: Parameters<typeof operations.saveClinicalResource>
    ) => write(args[0], () => operations.saveClinicalResource(...args)),
    finalizeClinicalResource: (
      ...args: Parameters<typeof operations.finalizeClinicalResource>
    ) => write(args[0], () => operations.finalizeClinicalResource(...args)),
  };
}
