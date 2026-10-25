import type {
  AutoCampaign,
  AutoCampaignDelivery,
  AutoCampaignDeliveryInput,
  AutoCampaignInput,
  AutoCampaignQueue,
  CampaignFilterOptions,
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
  CommunicationPreference,
  CommunicationPreferenceInput,
} from "@crm/contracts";
import { request } from "../transport";

export const communicationsApi = {
  autoCampaigns: () =>
    request<AutoCampaign[]>("/communications/auto-campaigns"),
  autoCampaignQueue: () =>
    request<AutoCampaignQueue>("/communications/auto-campaigns/queue"),
  createAutoCampaign: (input: AutoCampaignInput) =>
    request<AutoCampaign>("/communications/auto-campaigns", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAutoCampaign: (id: string, input: AutoCampaignInput) =>
    request<AutoCampaign>(`/communications/auto-campaigns/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteAutoCampaign: (id: string) =>
    request<void>(`/communications/auto-campaigns/${id}`, {
      method: "DELETE",
    }),
  recordAutoCampaignDelivery: (input: AutoCampaignDeliveryInput) =>
    request<AutoCampaignDelivery>("/communications/auto-campaigns/deliveries", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  undoAutoCampaignDelivery: (id: string) =>
    request<void>(`/communications/auto-campaigns/deliveries/${id}`, {
      method: "DELETE",
    }),
  communicationPreferences: (patientId: string) =>
    request<CommunicationPreference[]>(
      `/communications/preferences?patientId=${encodeURIComponent(patientId)}`,
    ),
  setCommunicationPreference: (input: CommunicationPreferenceInput) =>
    request<CommunicationPreference>("/communications/preferences", {
      method: "PUT",
      body: JSON.stringify(input),
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
  campaignFilterOptions: () =>
    request<CampaignFilterOptions>("/communications/campaigns/filter-options"),
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
