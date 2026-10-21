import { z } from "zod";
import type { BroadcastSkippedPatient } from "../patients/types.js";
import {
  broadcastInputSchema,
  broadcastSegmentSchema,
  broadcastSkipReasons,
  campaignRecipientStatusSchema,
  communicationChannelSchema,
  communicationKindSchema,
  communicationPreferenceInputSchema,
  manualMessageInputSchema,
  messageTemplateImageInputSchema,
  messageTemplateInputSchema,
  reminderGenerationInputSchema,
  whatsappCampaignAudienceSchema,
  whatsappCampaignInputSchema,
  whatsappCampaignPreviewInputSchema,
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

export type MessageTemplateImageInput = z.infer<
  typeof messageTemplateImageInputSchema
>;

export type MessageTemplateInput = z.input<typeof messageTemplateInputSchema>;

export type MessageImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface MessageTemplateImage {
  id: string;
  fileName: string;
  mimeType: MessageImageMimeType;
  sizeBytes: number;
}

/** Mensagem padrão do acervo de campanhas (texto com `{{nome}}` + até 3 imagens). */
export interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  images: MessageTemplateImage[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface MessageTemplateImageContent extends MessageTemplateImage {
  dataUrl: string;
}

export type WhatsappCampaignAudience = z.infer<
  typeof whatsappCampaignAudienceSchema
>;

export type WhatsappCampaignPreviewInput = z.input<
  typeof whatsappCampaignPreviewInputSchema
>;

export type WhatsappCampaignInput = z.input<typeof whatsappCampaignInputSchema>;

export type CampaignRecipientStatus = z.infer<
  typeof campaignRecipientStatusSchema
>;

/** Destinatário já com a mensagem personalizada (antes de gravar). */
export interface WhatsappCampaignRecipientDraft {
  patientId: string;
  patientName: string;
  phone: string;
  message: string;
}

export interface WhatsappCampaignRecipient extends WhatsappCampaignRecipientDraft {
  id: string;
  status: CampaignRecipientStatus;
  handledAt?: string;
  handledByName?: string;
}

export interface WhatsappCampaign {
  id: string;
  name: string;
  templateId: string;
  templateTitle: string;
  /** Texto da mensagem padrão no momento da criação (com os códigos). */
  body: string;
  /** Imagens da mensagem padrão no momento da criação. */
  images: MessageTemplateImage[];
  total: number;
  sent: number;
  skipped: number;
  createdAt: string;
  createdByName: string;
  completedAt?: string;
}

export interface WhatsappCampaignDetail extends WhatsappCampaign {
  recipients: WhatsappCampaignRecipient[];
}

export interface WhatsappCampaignPreview {
  /** Clientes escolhidos ou que caem no segmento. */
  matched: number;
  /** Quantos vão receber (com WhatsApp e sem bloqueio). */
  recipients: number;
  skipped: BroadcastSkippedPatient[];
  sample?: { patientName: string; message: string };
}

export interface CampaignRecipientUpdate {
  campaign: WhatsappCampaign;
  recipient: WhatsappCampaignRecipient;
}
