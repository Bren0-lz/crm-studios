import type {
  CampaignRecipientStatus,
  CampaignRecipientUpdate,
  MessageTemplate,
  MessageTemplateImageContent,
  MessageTemplateInput,
  WhatsappCampaign,
  WhatsappCampaignDetail,
  WhatsappCampaignInput,
  WhatsappCampaignPreview,
  WhatsappCampaignPreviewInput,
  BroadcastInput,
  BroadcastResult,
  CommunicationCenter,
  CommunicationPreference,
  CommunicationPreferenceInput,
  ManualMessageInput,
  OutboundMessage,
  ReminderGenerationResult,
  ReminderGenerationOptions,
} from "@crm/contracts";
import { request } from "../transport";

export const communicationsApi = {
  completeManualMessage: (id: string, status: "sent" | "cancelled") =>
    request<OutboundMessage>(`/communications/messages/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  communications: () => request<CommunicationCenter>("/communications"),
  setCommunicationPreference: (input: CommunicationPreferenceInput) =>
    request<CommunicationPreference>("/communications/preferences", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  queueMessage: (input: ManualMessageInput) =>
    request<OutboundMessage>("/communications/messages", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  broadcastPreview: (input: BroadcastInput) =>
    request<BroadcastResult>("/communications/broadcast/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  sendBroadcast: (input: BroadcastInput) =>
    request<BroadcastResult>("/communications/broadcast", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  generateReminders: (
    referenceDate: string,
    options?: ReminderGenerationOptions,
  ) =>
    request<ReminderGenerationResult>("/communications/reminders/generate", {
      method: "POST",
      body: JSON.stringify({ referenceDate, ...options }),
    }),
  messageTemplates: () =>
    request<MessageTemplate[]>("/communications/templates"),
  messageTemplateImage: (imageId: string) =>
    request<MessageTemplateImageContent>(
      `/communications/template-images/${imageId}`,
    ),
  createMessageTemplate: (input: MessageTemplateInput) =>
    request<MessageTemplate>("/communications/templates", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMessageTemplate: (id: string, input: MessageTemplateInput) =>
    request<MessageTemplate>(`/communications/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  archiveMessageTemplate: (id: string, archived: boolean) =>
    request<MessageTemplate>(`/communications/templates/${id}/archive`, {
      method: "POST",
      body: JSON.stringify({ archived }),
    }),
  whatsappCampaigns: () =>
    request<WhatsappCampaign[]>("/communications/campaigns"),
  whatsappCampaign: (id: string) =>
    request<WhatsappCampaignDetail>(`/communications/campaigns/${id}`),
  previewWhatsappCampaign: (input: WhatsappCampaignPreviewInput) =>
    request<WhatsappCampaignPreview>("/communications/campaigns/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createWhatsappCampaign: (input: WhatsappCampaignInput) =>
    request<WhatsappCampaignDetail>("/communications/campaigns", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  setCampaignRecipientStatus: (
    campaignId: string,
    recipientId: string,
    status: CampaignRecipientStatus,
  ) =>
    request<CampaignRecipientUpdate>(
      `/communications/campaigns/${campaignId}/recipients/${recipientId}`,
      { method: "POST", body: JSON.stringify({ status }) },
    ),
};
