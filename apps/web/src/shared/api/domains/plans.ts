import type {
  PatientPlan,
  PatientPlanInput,
  PlanCatalogEntry,
  PlanCatalogInput,
  PlanRenewalInput,
  PlanStatus,
  PlanTemplate,
  PlanTemplateInput,
  PlanTemplateUpdate,
  SessionMovement,
} from "@crm/contracts";
import { request } from "../transport";

export const plansApi = {
  planCatalog: () => request<PlanCatalogEntry[]>("/plan-catalog"),
  createPlanCatalogEntry: (input: PlanCatalogInput) =>
    request<PlanCatalogEntry>("/plan-catalog", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePlanCatalogEntry: (id: string, input: PlanCatalogInput) =>
    request<PlanCatalogEntry>(`/plan-catalog/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deletePlanCatalogEntry: (id: string) =>
    request<void>(`/plan-catalog/${id}`, { method: "DELETE" }),
  planTemplates: () => request<PlanTemplate[]>("/plan-templates"),
  createPlanTemplate: (input: PlanTemplateInput) =>
    request<PlanTemplate>("/plan-templates", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePlanTemplate: (id: string, input: PlanTemplateUpdate) =>
    request<PlanTemplate>(`/plan-templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  plans: (patientId = "") =>
    request<PatientPlan[]>(`/plans?patientId=${encodeURIComponent(patientId)}`),
  createPlan: (input: PatientPlanInput) =>
    request<PatientPlan>("/plans", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePlanStatus: (id: string, status: PlanStatus) =>
    request<PatientPlan>(`/plans/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  renewPlan: (id: string, input: PlanRenewalInput) =>
    request<PatientPlan>(`/plans/${id}/renew`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  setPlanAutoRenew: (id: string, autoRenew: boolean) =>
    request<PatientPlan>(`/plans/${id}/auto-renew`, {
      method: "PATCH",
      body: JSON.stringify({ autoRenew }),
    }),
  sessionMovements: (id: string) =>
    request<SessionMovement[]>(`/plans/${id}/movements`),
};
