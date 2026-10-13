import type {
  BroadcastMessageDraft,
  CommunicationPreference,
  CommunicationPreferenceInput,
  ManualMessageInput,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { localDate, now, uuid } from "./helpers.js";

export function createCommunicationsRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  return {
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

    async generateReminders(clinicId: string, referenceDate: string) {
      let queued = 0;
      let skippedByPreference = 0;
      let alreadyQueued = 0;
      for (const appointment of repositoryContext.appointments.filter(
        (item) =>
          item.clinicId === clinicId &&
          ["scheduled", "confirmed"].includes(item.status) &&
          localDate(new Date(item.startsAt)) === referenceDate,
      )) {
        // Atendimento de lead não tem cliente para receber lembrete.
        const patient = repositoryContext.patients.find(
          (item) =>
            appointment.patientId !== undefined &&
            item.id === appointment.patientId,
        );
        if (!patient) continue;
        const key = `appointment:${appointment.id}:whatsapp`;
        if (
          repositoryContext.outboundMessages.some(
            (item) => item.idempotencyKey === key,
          )
        ) {
          alreadyQueued += 1;
        } else if (
          !repositoryContext.channelAllowed(clinicId, patient.id, "whatsapp")
        ) {
          skippedByPreference += 1;
        } else {
          const time = new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(appointment.startsAt));
          repositoryContext.pushMessage({
            clinicId,
            patient,
            channel: "whatsapp",
            kind: "appointment_reminder",
            recipient: patient.whatsapp || patient.phone,
            body: `Olá, ${patient.fullName}. Lembramos do seu atendimento em ${referenceDate.split("-").reverse().join("/")} às ${time}.`,
            scheduledFor: now(),
            idempotencyKey: key,
          });
          queued += 1;
        }
      }
      for (const receivable of repositoryContext.receivables.filter(
        (item) =>
          item.clinicId === clinicId &&
          item.status === "open" &&
          item.dueDate <= referenceDate,
      )) {
        const patient = repositoryContext.patients.find(
          (item) => item.id === receivable.patientId,
        )!;
        const key = `receivable:${receivable.id}:whatsapp`;
        if (
          repositoryContext.outboundMessages.some(
            (item) => item.idempotencyKey === key,
          )
        ) {
          alreadyQueued += 1;
        } else if (
          !repositoryContext.channelAllowed(clinicId, patient.id, "whatsapp")
        ) {
          skippedByPreference += 1;
        } else {
          repositoryContext.pushMessage({
            clinicId,
            patient,
            channel: "whatsapp",
            kind: "payment_reminder",
            recipient: patient.whatsapp || patient.phone,
            body: `Olá, ${patient.fullName}. Identificamos uma parcela com vencimento em ${receivable.dueDate.split("-").reverse().join("/")}. Fale com a clínica se precisar de ajuda.`,
            scheduledFor: now(),
            idempotencyKey: key,
          });
          queued += 1;
        }
      }
      return { queued, skippedByPreference, alreadyQueued };
    },
  };
}
