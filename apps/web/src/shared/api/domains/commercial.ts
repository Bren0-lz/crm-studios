import type {
  Lead,
  LeadActivity,
  LeadContact,
  LeadContactInput,
  LeadConversion,
  LeadConversionInput,
  LeadInput,
  LeadStage,
  LeadTask,
  LeadTaskInput,
  LeadTaskStatus,
} from "@crm/contracts";
import { request } from "../transport";

export const commercialApi = {
  leads: () => request<Lead[]>("/leads"),
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
