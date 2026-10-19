import type {
  Lead,
  LeadActivity,
  LeadContact,
  LeadContactInput,
  LeadConversion,
  LeadConversionInput,
  LeadDuplicateMatch,
  LeadDuplicateQuery,
  LeadInput,
  LeadStage,
  LeadTask,
  LeadTaskInput,
  LeadTaskStatus,
} from "@crm/contracts";
import { request } from "../transport";

export const commercialApi = {
  leads: () => request<Lead[]>("/leads"),
  /** Clientes e leads com o mesmo telefone, e-mail ou CPF (só id e nome). */
  leadDuplicates: (query: LeadDuplicateQuery) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (typeof value === "string" && value.trim()) params.set(key, value);
    return request<{ matches: LeadDuplicateMatch[] }>(
      `/leads/duplicates?${params.toString()}`,
    );
  },
  createLead: (input: LeadInput) =>
    request<Lead>("/leads", { method: "POST", body: JSON.stringify(input) }),
  updateLead: (id: string, input: LeadInput) =>
    request<Lead>(`/leads/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  moveLead: (id: string, stage: LeadStage, lostReason?: string) =>
    request<Lead>(`/leads/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage, lostReason }),
    }),
  convertLead: (id: string, input: LeadConversionInput = {}) =>
    request<LeadConversion>(`/leads/${id}/convert`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  leadActivity: (id: string) => request<LeadActivity>(`/leads/${id}/activity`),
  createLeadContact: (id: string, input: LeadContactInput) =>
    request<LeadContact>(`/leads/${id}/contacts`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createLeadTask: (id: string, input: LeadTaskInput) =>
    request<LeadTask>(`/leads/${id}/tasks`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateLeadTaskStatus: (id: string, status: LeadTaskStatus) =>
    request<LeadTask>(`/lead-tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
