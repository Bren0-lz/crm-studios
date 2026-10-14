import { buildReminderCandidates } from "../../modules/communications/reminders.js";
import type {
  BroadcastMessageDraft,
  CommunicationPreference,
  CommunicationPreferenceInput,
  ManualMessageInput,
  ReminderGenerationOptions,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createCommunicationsRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  return {
    async completeManualMessage(
      clinicId: string,
      actorUserId: string,
      messageId: string,
      status: "sent" | "cancelled",
    ) {
      const message = repositoryContext.outboundMessages.find(
        (item) => item.clinicId === clinicId && item.id === messageId,
      );
      if (!message)
        throw new DomainError(
          "MESSAGE_NOT_FOUND",
          "Mensagem não encontrada.",
          404,
        );
      if (message.status !== "queued")
        throw new DomainError(
          "MESSAGE_NOT_QUEUED",
          "Somente mensagens na fila podem ser concluídas.",
          409,
        );
      if (status === "sent") {
        repositoryContext.assertChannelAllowed(
          clinicId,
          message.patientId,
          message.channel,
        );
        if (new Date(message.scheduledFor).getTime() > Date.now())
          throw new DomainError(
            "MESSAGE_NOT_DUE",
            "A mensagem está programada para uma data futura.",
            409,
          );
      }
      const actor = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === actorUserId,
      );
      if (!actor)
        throw new DomainError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
      message.status = status;
      message.manualCompletion = {
        actorId: actorUserId,
        actorName: actor.fullName,
        occurredAt: now(),
        status,
      };
      if (status === "sent") message.sentAt = now();
      repositoryContext.recordAudit(
        clinicId,
        actorUserId,
        "message.manual_completion",
        "message",
        { status },
        messageId,
      );
      return { ...message };
    },
    async getCommunicationCenter(clinicId: string) {
      return {
        deliveryMode: "outbox_only" as const,
        preferences: repositoryContext.communicationPreferences.filter(
          (item) => item.clinicId === clinicId,
        ),
        messages: repositoryContext.outboundMessages
          .filter((item) => item.clinicId === clinicId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((message) => repositoryContext.toOutboundMessage(message)),
      };
    },

    async setCommunicationPreference(
      clinicId: string,
      input: CommunicationPreferenceInput,
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
      const existing = repositoryContext.communicationPreferences.find(
        (item) =>
          item.clinicId === clinicId &&
          item.patientId === input.patientId &&
          item.channel === input.channel,
      );
      if (existing) {
        existing.allowed = input.allowed;
        existing.updatedAt = now();
        return existing;
      }
      const preference: CommunicationPreference = {
        ...input,
        id: uuid(),
        clinicId,
        updatedAt: now(),
      };
      repositoryContext.communicationPreferences.push(preference);
      return preference;
    },

    async queueManualMessage(clinicId: string, input: ManualMessageInput) {
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.patientId,
      );
      if (!patient)
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      repositoryContext.assertChannelAllowed(
        clinicId,
        patient.id,
        input.channel,
      );
      const recipient =
        input.channel === "email"
          ? patient.email
          : (input.channel === "whatsapp" && patient.whatsapp) || patient.phone;
      if (!recipient)
        throw new DomainError(
          "COMMUNICATION_RECIPIENT_MISSING",
          "O cliente não possui contato para o canal selecionado.",
        );
      return repositoryContext.pushMessage({
        clinicId,
        patient,
        channel: input.channel,
        kind: "manual",
        recipient,
        body: input.body,
        scheduledFor: input.scheduledFor ?? now(),
        idempotencyKey: `manual:${uuid()}`,
      });
    },

    async queueBroadcastMessages(
      clinicId: string,
      drafts: BroadcastMessageDraft[],
    ) {
      // Valida tudo antes de gravar: o comunicado entra inteiro ou não entra.
      const patients = drafts.map((draft) => {
        const patient = repositoryContext.patients.find(
          (item) => item.clinicId === clinicId && item.id === draft.patientId,
        );
        if (!patient)
          throw new DomainError(
            "PATIENT_NOT_FOUND",
            "Cliente não encontrado.",
            404,
          );
        return patient;
      });
      for (const draft of drafts)
        repositoryContext.assertChannelAllowed(
          clinicId,
          draft.patientId,
          draft.channel,
        );
      const batchId = uuid();
      const scheduledFor = now();
      drafts.forEach((draft, index) =>
        repositoryContext.pushMessage({
          clinicId,
          patient: patients[index]!,
          channel: draft.channel,
          kind: "manual",
          recipient: draft.recipient,
          body: draft.body,
          scheduledFor,
          idempotencyKey: `broadcast:${batchId}:${draft.patientId}`,
        }),
      );
      return drafts.length;
    },

    async generateReminders(
      clinicId: string,
      referenceDate: string,
      options: ReminderGenerationOptions = {},
    ) {
      const patients = repositoryContext.patients.filter(
        (item) => item.clinicId === clinicId,
      );
      const encounters = repositoryContext.appointments.filter(
        (item) => item.clinicId === clinicId,
      );
      const groupEncounters = repositoryContext.groupAttendance
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            (item.status === "present" || item.outcome === "present"),
        )
        .flatMap((item) => {
          const session = repositoryContext.groupSessions.find(
            (session) =>
              session.clinicId === clinicId && session.id === item.sessionId,
          );
          return session && session.status !== "cancelled"
            ? [
                {
                  id: session.id,
                  patientId: item.patientId,
                  startsAt: session.startsAt,
                  status: "completed",
                },
              ]
            : [];
        });
      const candidates = buildReminderCandidates(
        patients,
        [...encounters, ...groupEncounters],
        repositoryContext.receivables.filter(
          (item) => item.clinicId === clinicId,
        ),
        repositoryContext.satisfactionSurveys.filter(
          (item) => item.clinicId === clinicId,
        ),
        referenceDate,
        repositoryContext.clinicSettings.timezone,
        options,
      );
      let queued = 0,
        skippedByPreference = 0,
        alreadyQueued = 0;
      for (const candidate of candidates) {
        if (
          repositoryContext.outboundMessages.some(
            (item) =>
              item.clinicId === clinicId &&
              (item.idempotencyKey === candidate.key ||
                item.idempotencyKey === candidate.legacyKey),
          )
        ) {
          alreadyQueued++;
          continue;
        }
        if (
          !repositoryContext.channelAllowed(
            clinicId,
            candidate.patient.id,
            "whatsapp",
          )
        ) {
          skippedByPreference++;
          continue;
        }
        const patient = patients.find(
          (patient) => patient.id === candidate.patient.id,
        )!;
        repositoryContext.pushMessage({
          clinicId,
          patient,
          channel: "whatsapp",
          kind: candidate.kind,
          recipient: patient.whatsapp || patient.phone,
          body: candidate.body,
          scheduledFor: now(),
          idempotencyKey: candidate.key,
        });
        queued++;
      }
      return { queued, skippedByPreference, alreadyQueued };
    },
  };
}
