import { z } from "zod";
import type { AppointmentStatus } from "../agenda/types.js";
import type { BroadcastSkippedPatient } from "../patients/types.js";
import {
  autoCampaignBlockedReasonLabels,
  autoCampaignCooldownUnitSchema,
  autoCampaignDeliveryInputSchema,
  autoCampaignInputSchema,
  autoCampaignPromotionDiscountSchema,
  autoCampaignPromotionSchema,
  autoCampaignSkipReasonSchema,
  autoCampaignTriggerSchema,
  broadcastInputSchema,
  broadcastSegmentSchema,
  broadcastSkipReasons,
  campaignAppointmentStatusSchema,
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
  whatsappCampaignPromotionSchema,
  whatsappCampaignSegmentSchema,
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

export type WhatsappCampaignPromotion = z.infer<
  typeof whatsappCampaignPromotionSchema
>;

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
  /** Presente só nas campanhas promocionais. */
  promotion?: WhatsappCampaignPromotion | undefined;
}

export interface WhatsappCampaignDetail extends WhatsappCampaign {
  recipients: WhatsappCampaignRecipient[];
}

export interface WhatsappCampaignPreview {
  /** Clientes escolhidos ou que caem no segmento. */
  matched: number;
  /** Quantos vão receber (com WhatsApp e sem bloqueio). */
  recipients: number;
  /** Quem vai receber (para conferir o filtro antes de criar). */
  included: Array<{ patientId: string; patientName: string; phone: string }>;
  skipped: BroadcastSkippedPatient[];
  sample?: { patientName: string; message: string };
}

export interface CampaignRecipientUpdate {
  campaign: WhatsappCampaign;
  recipient: WhatsappCampaignRecipient;
}

export type CampaignAppointmentStatus = z.infer<
  typeof campaignAppointmentStatusSchema
>;

/** Filtros da campanha como o formulário monta (os padrões ficam por conta do schema). */
export type WhatsappCampaignSegment = Partial<
  z.infer<typeof whatsappCampaignSegmentSchema>
>;

/** Valores reais para os filtros da campanha (selects em vez de texto livre). */
export interface CampaignFilterOptions {
  services: Array<{ id: string; name: string }>;
  professionals: Array<{ id: string; name: string }>;
  cities: string[];
  neighborhoods: string[];
  sources: string[];
  occupations: string[];
  interests: string[];
  levels: string[];
  /** O usuário pode filtrar por parcela vencida (módulo financeiro). */
  finance: boolean;
}

export type AutoCampaignTrigger = z.infer<typeof autoCampaignTriggerSchema>;

export type AutoCampaignTiming = "before" | "after" | "sessions";

export type AutoCampaignInput = z.input<typeof autoCampaignInputSchema>;

export type AutoCampaignCooldownUnit = z.infer<
  typeof autoCampaignCooldownUnitSchema
>;

export type AutoCampaignPromotion = z.infer<typeof autoCampaignPromotionSchema>;

export type AutoCampaignPromotionDiscount = z.infer<
  typeof autoCampaignPromotionDiscountSchema
>;

export type AutoCampaignSkipReason = z.infer<
  typeof autoCampaignSkipReasonSchema
>;

export type AutoCampaignBlockedReason =
  keyof typeof autoCampaignBlockedReasonLabels;

export type AutoCampaignDeliveryInput = z.input<
  typeof autoCampaignDeliveryInputSchema
>;

export interface AutoCampaignStep {
  id: string;
  /** Dias antes/depois do evento ou sessões restantes, conforme o evento. */
  offset: number;
  message: string;
}

export interface AutoCampaign {
  id: string;
  name: string;
  trigger: AutoCampaignTrigger;
  active: boolean;
  steps: AutoCampaignStep[];
  /** Presente só nas campanhas promocionais. */
  promotion?: AutoCampaignPromotion | undefined;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
}

/** Envio (ou não envio) registrado pela equipe para uma mensagem de um evento. */
export interface AutoCampaignDelivery {
  id: string;
  campaignId: string;
  stepId: string;
  patientId: string;
  occurrenceKey: string;
  status: "sent" | "skipped";
  skipReason?: AutoCampaignSkipReason | undefined;
  note?: string | undefined;
  /** Texto como estava quando foi marcado. */
  message: string;
  /** Campanha promocional enviada: último dia (aaaa-mm-dd) em que a promoção vale. */
  promotionValidUntil?: string | undefined;
  handledAt: string;
  handledByName: string;
}

export type AutoCampaignItemStatus = "pending" | "sent" | "skipped";

/** Uma mensagem a enviar agora: cliente + campanha + momento atual do evento. */
export interface AutoCampaignItem {
  /** `<campanha>:<mensagem>:<ocorrência>`. */
  key: string;
  campaignId: string;
  campaignName: string;
  trigger: AutoCampaignTrigger;
  stepId: string;
  stepLabel: string;
  patientId: string;
  patientName: string;
  /** WhatsApp (ou telefone) do cliente; vazio quando não há. */
  phone: string;
  /** Identifica o evento (ex.: `<cliente>:<ano>` no aniversário, id do plano). */
  occurrenceKey: string;
  /** Data do evento (aaaa-mm-dd), quando houver. */
  eventDate?: string | undefined;
  /** Situação legível ("Aniversário em 2 dias (27/10)"). */
  detail: string;
  /** Mensagem com os códigos preenchidos. */
  message: string;
  status: AutoCampaignItemStatus;
  delivery?: AutoCampaignDelivery | undefined;
  /** O sistema não tem como enviar: aparece como não enviada, com o motivo. */
  blockedReason?: AutoCampaignBlockedReason | undefined;
}

export interface AutoCampaignSummary {
  campaignId: string;
  name: string;
  trigger: AutoCampaignTrigger;
  active: boolean;
  pending: number;
  sent: number;
  skipped: number;
}

/** Uso de uma promoção num agendamento; cancelar o atendimento desfaz o uso. */
export interface AutoCampaignRedemption {
  id: string;
  campaignId: string;
  patientId: string;
  occurrenceKey: string;
  appointmentId: string;
  /** Status atual do atendimento (cancelado = uso desfeito). */
  appointmentStatus: AppointmentStatus;
  /** Dia (aaaa-mm-dd) em que o atendimento foi agendado com a promoção. */
  redeemedOn: string;
  /** Último dia em que o cliente fica fora desta campanha, quando há bloqueio. */
  blockedUntil?: string | undefined;
}

/** `GET /communications/auto-campaigns/products`: produtos para o desconto da promoção. */
export interface AutoCampaignProductOption {
  id: string;
  name: string;
  active: boolean;
}

/** `GET /appointments/promotions`: promoções que o cliente pode usar ao agendar hoje. */
export interface AutoCampaignPromotionOffer {
  /** `manual` = campanha manual (WhatsApp); ausente = campanha automática. */
  source?: "manual" | undefined;
  campaignId: string;
  campaignName: string;
  occurrenceKey: string;
  /** Último dia (aaaa-mm-dd) para agendar com a promoção. */
  validUntil: string;
  /** Desconto da promoção, quando a campanha tem. */
  discount?: AutoCampaignPromotionDiscount | undefined;
  /** Planos em que o desconto vale; ausente ou vazio = qualquer plano. */
  planTemplateIds?: string[] | undefined;
  /** `false` = o desconto não vale em plano nenhum (ver `promotionAppliesToPlan`). */
  appliesToPlans?: boolean | undefined;
  /** `true` = o desconto vale também em produtos (ver `promotionAppliesToProduct`). */
  appliesToProducts?: boolean | undefined;
  /** Produtos em que o desconto vale; ausente ou vazio = qualquer produto. */
  productIds?: string[] | undefined;
}

/** `GET /communications/auto-campaigns/queue`: a fila de hoje. */
export interface AutoCampaignQueue {
  date: string;
  items: AutoCampaignItem[];
  campaigns: AutoCampaignSummary[];
}
