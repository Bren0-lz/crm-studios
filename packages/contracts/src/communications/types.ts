import { z } from "zod";
import type { BroadcastSkippedPatient } from "../patients/types.js";
import {
  broadcastInputSchema,
  broadcastSegmentSchema,
  broadcastSkipReasons,
  communicationChannelSchema,
  communicationKindSchema,
  communicationPreferenceInputSchema,
  manualMessageInputSchema,
  reminderGenerationInputSchema,
} from "./model.js";

export type ReminderGenerationOptions = Partial<
  Omit<z.infer<typeof reminderGenerationInputSchema>, "referenceDate">
>;

export type CommunicationChannel = z.infer<typeof communicationChannelSchema>;

export type CommunicationKind = z.infer<typeof communicationKindSchema>;

export type CommunicationPreferenceInput = z.infer<
  typeof communicationPreferenceInputSchema
>;

export type ManualMessageInput = z.infer<typeof manualMessageInputSchema>;

export type BroadcastSegment = z.infer<typeof broadcastSegmentSchema>;

export type BroadcastInput = z.infer<typeof broadcastInputSchema>;

export type BroadcastSkipReason = (typeof broadcastSkipReasons)[number];

export interface CommunicationPreference extends CommunicationPreferenceInput {
  id: string;
  clinicId: string;
  updatedAt: string;
}

export interface OutboundMessage {
  satisfactionSurveyId?: string;
  manualCompletion?: {
    actorId: string;
    actorName: string;
    occurredAt: string;
    status: "sent" | "cancelled";
  };
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  channel: CommunicationChannel;
  kind: CommunicationKind;
  recipient: string;
  body: string;
  status: "queued" | "sent" | "failed" | "cancelled";
  scheduledFor: string;
  sentAt?: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
}

export interface CommunicationCenter {
  deliveryMode: "outbox_only";
  preferences: CommunicationPreference[];
  messages: OutboundMessage[];
}

export interface ReminderGenerationResult {
  queued: number;
  skippedByPreference: number;
  alreadyQueued: number;
}

/** Mensagem pronta para a fila (já com `{{nome}}` preenchido). */
export interface BroadcastMessageDraft {
  patientId: string;
  channel: CommunicationChannel;
  recipient: string;
  body: string;
}

export interface BroadcastResult {
  /** `true` na prévia: nada foi gravado. */
  preview: boolean;
  channel: CommunicationChannel;
  /** Clientes que caem no segmento. */
  matched: number;
  /** Enfileiradas (envio) ou que seriam enfileiradas (prévia). */
  queued: number;
  skipped: BroadcastSkippedPatient[];
  /** Texto do primeiro destinatário, para conferência. */
  sampleBody?: string;
}
