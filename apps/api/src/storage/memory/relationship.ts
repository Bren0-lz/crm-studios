import {
  defaultRelationshipSettings,
  saoPauloToday,
  type AppModule,
  type ContactActivity,
  type ContactActivityInput,
  type RelationshipSettings,
  type SatisfactionSurvey,
  type SatisfactionSurveyInput,
} from "@crm/contracts";
import {
  buildBirthdayEntries,
  buildContactSuggestions,
  npsDetractorWindowStart,
} from "../../modules/relationship/contact-suggestions.js";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createRelationshipRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  return {
    async getRelationshipSettings(clinicId: string) {
      return structuredClone(
        repositoryContext.relationshipSettings.get(clinicId) ??
          defaultRelationshipSettings,
      );
    },

    async updateRelationshipSettings(
      clinicId: string,
      input: RelationshipSettings,
    ) {
      repositoryContext.relationshipSettings.set(
        clinicId,
        structuredClone(input),
      );
      return structuredClone(input);
    },

    async listContactSuggestions(
      clinicId: string,
      modules: readonly AppModule[],
    ) {
      const today = saoPauloToday();
      const [settings, plans, activities, surveys] = await Promise.all([
        repositoryContext.operations.getRelationshipSettings(clinicId),
        repositoryContext.operations.listPatientPlans(clinicId),
        repositoryContext.operations.listContactActivities(clinicId),
        repositoryContext.operations.listSatisfactionSurveys(clinicId, {
          from: npsDetractorWindowStart(today),
        }),
      ]);
      return buildContactSuggestions(
        {
          patients: repositoryContext.patients.filter(
            (item) =>
              item.clinicId === clinicId &&
              !repositoryContext.isTrashed("patients", item.id),
          ),
          plans,
          appointments: repositoryContext.appointments.filter(
            (item) =>
              item.clinicId === clinicId &&
              !repositoryContext.isTrashed("appointments", item.id),
          ),
          receivables: repositoryContext.receivables.filter(
            (item) => item.clinicId === clinicId,
          ),
          tabs: repositoryContext.patientTabs.filter(
            (item) => item.clinicId === clinicId,
          ),
          activities,
          surveys,
        },
        settings,
        today,
        modules,
      );
    },

    async createContactActivity(
      clinicId: string,
      actorUserId: string,
      input: ContactActivityInput,
    ) {
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.patientId,
      );
      if (!patient)
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      const activity: ContactActivity = {
        id: uuid(),
        clinicId,
        patientId: input.patientId,
        reason: input.reason,
        referenceKey: input.referenceKey,
        outcome: input.outcome,
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.outcome === "snoozed" && input.snoozeUntil
          ? { snoozeUntil: input.snoozeUntil }
          : {}),
        actorUserId,
        createdAt: now(),
      };
      repositoryContext.contactActivities.push(activity);
      return { ...activity };
    },

    async listBirthdays(clinicId: string, month: string) {
      return buildBirthdayEntries(
        repositoryContext.patients.filter(
          (item) =>
            item.clinicId === clinicId &&
            !repositoryContext.isTrashed("patients", item.id),
        ),
        await repositoryContext.operations.listContactActivities(clinicId),
        month,
      );
    },

    async listContactActivities(clinicId: string, patientId?: string) {
      return repositoryContext.contactActivities
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            (!patientId || item.patientId === patientId),
        )
        .reverse()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((item) => ({ ...item }));
    },

    async createSatisfactionSurvey(
      clinicId: string,
      actorUserId: string,
      input: SatisfactionSurveyInput,
    ) {
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.patientId,
      );
      if (!patient)
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      if (input.appointmentId) {
        const appointment = repositoryContext.appointments.find(
          (item) =>
            item.clinicId === clinicId && item.id === input.appointmentId,
        );
        if (!appointment)
          throw new DomainError(
            "APPOINTMENT_NOT_FOUND",
            "Atendimento não encontrado.",
            404,
          );
        if (!appointment.patientId)
          throw new DomainError(
            "LEAD_APPOINTMENT_NOT_ALLOWED",
            "Atendimento de lead não tem pesquisa de satisfação. Converta o lead em cliente primeiro.",
            409,
          );
        if (appointment.patientId !== input.patientId)
          throw new DomainError(
            "SATISFACTION_APPOINTMENT_MISMATCH",
            "O atendimento não pertence a este cliente.",
          );
        if (appointment.status !== "completed")
          throw new DomainError(
            "SATISFACTION_APPOINTMENT_NOT_COMPLETED",
            "Só é possível avaliar atendimentos concluídos.",
          );
        if (
          repositoryContext.satisfactionSurveys.some(
            (item) =>
              item.clinicId === clinicId &&
              item.appointmentId === input.appointmentId,
          )
        )
          throw new DomainError(
            "SATISFACTION_DUPLICATE",
            "Este atendimento já possui pesquisa de satisfação.",
            409,
          );
      }
      if (input.sourceMessageId) {
        const message = repositoryContext.outboundMessages.find(
          (item) =>
            item.clinicId === clinicId &&
            item.id === input.sourceMessageId &&
            item.patientId === input.patientId &&
            item.kind === "satisfaction_followup",
        );
        if (!message)
          throw new DomainError(
            "SATISFACTION_MESSAGE_MISMATCH",
            "A solicitação de NPS não pertence a este cliente.",
            404,
          );
        if (
          repositoryContext.satisfactionSurveys.some(
            (item) =>
              item.clinicId === clinicId &&
              item.sourceMessageId === input.sourceMessageId,
          )
        )
          throw new DomainError(
            "SATISFACTION_DUPLICATE",
            "Esta solicitação já possui resposta de NPS.",
            409,
          );
      }
      const survey: SatisfactionSurvey = {
        ...(input.sourceMessageId
          ? { sourceMessageId: input.sourceMessageId }
          : {}),
        id: uuid(),
        clinicId,
        patientId: patient.id,
        patientName: patient.fullName,
        ...(input.appointmentId ? { appointmentId: input.appointmentId } : {}),
        score: input.score,
        ...(input.comment ? { comment: input.comment } : {}),
        actorUserId,
        createdAt: now(),
      };
      repositoryContext.satisfactionSurveys.push(survey);
      return { ...survey };
    },

    async listSatisfactionSurveys(
      clinicId: string,
      filter: {
        from?: string | undefined;
        to?: string | undefined;
        patientId?: string | undefined;
      } = {},
    ) {
      return repositoryContext.satisfactionSurveys
        .filter((item) => {
          if (item.clinicId !== clinicId) return false;
          if (filter.patientId && item.patientId !== filter.patientId)
            return false;
          const date = saoPauloToday(new Date(item.createdAt));
          return (
            (!filter.from || date >= filter.from) &&
            (!filter.to || date <= filter.to)
          );
        })
        .reverse()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((item) => ({
          ...item,
          patientName:
            repositoryContext.patients.find(
              (patient) =>
                patient.clinicId === clinicId && patient.id === item.patientId,
            )?.fullName ?? item.patientName,
        }));
    },
  };
}
