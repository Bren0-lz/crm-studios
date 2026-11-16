import type {
  GroupWaitlistItem,
  WaitlistEntry,
  WaitlistEntryInput,
  WaitlistEntryUpdate,
  WaitlistOptions,
} from "@crm/contracts";
import { request } from "../transport";

export const waitlistApi = {
  waitlist: () => request<WaitlistEntry[]>("/waitlist"),
  /** Espera das turmas (matrículas `waitlisted`), mostrada junto da lista (RE14). */
  groupWaitlist: () => request<GroupWaitlistItem[]>("/waitlist/groups"),
  waitlistOptions: () => request<WaitlistOptions>("/waitlist/options"),
  createWaitlistEntry: (input: WaitlistEntryInput) =>
    request<WaitlistEntry>("/waitlist", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateWaitlistEntry: (id: string, input: WaitlistEntryUpdate) =>
    request<WaitlistEntry>(`/waitlist/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteWaitlistEntry: (id: string) =>
    request<void>(`/waitlist/${id}`, { method: "DELETE" }),
};
