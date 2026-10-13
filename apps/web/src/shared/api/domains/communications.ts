import type {
  BroadcastInput,
  BroadcastResult,
  CommunicationCenter,
  CommunicationPreference,
  CommunicationPreferenceInput,
  ManualMessageInput,
  OutboundMessage,
  ReminderGenerationResult,
} from "@crm/contracts";
import { request } from "../transport";

export const communicationsApi = {
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
  generateReminders: (referenceDate: string) =>
    request<ReminderGenerationResult>("/communications/reminders/generate", {
      method: "POST",
      body: JSON.stringify({ referenceDate }),
    }),
};
