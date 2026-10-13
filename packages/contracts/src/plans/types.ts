import { z } from "zod";
import {
  patientPlanInputSchema,
  planCatalogInputSchema,
  planRenewalInputSchema,
  planServiceInputSchema,
  planStatusSchema,
  planTemplateInputSchema,
  planTemplateUpdateSchema,
  planTermsSchema,
  planTypeSchema,
} from "./model.js";

export type PlanCatalogInput = z.infer<typeof planCatalogInputSchema>;

export interface PlanCatalogEntry extends PlanCatalogInput {
  id: string;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
}

export type PlanServiceInput = z.infer<typeof planServiceInputSchema>;

export type PlanType = z.infer<typeof planTypeSchema>;

export type PlanTemplateInput = z.infer<typeof planTemplateInputSchema>;

export type PlanTemplateUpdate = z.infer<typeof planTemplateUpdateSchema>;

export interface PlanTemplate extends PlanTemplateInput {
  id: string;
  clinicId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientPlanService extends PlanServiceInput {
  serviceName: string;
  remainingSessions: number;
}

export type PlanStatus = z.infer<typeof planStatusSchema>;

export type PlanTerms = z.infer<typeof planTermsSchema>;

export type PatientPlanInput = z.infer<typeof patientPlanInputSchema>;

export type PlanRenewalInput = z.infer<typeof planRenewalInputSchema>;

export interface PatientPlan extends Omit<
  PatientPlanInput,
  "planTemplateId" | "services"
> {
  serviceId: string;
  totalSessions: number;
  services: PatientPlanService[];
  planTemplateId?: string;
  id: string;
  clinicId: string;
  patientName: string;
  serviceName: string;
  status: PlanStatus;
  remainingSessions: number;
  autoRenew: boolean;
  renewedFromPlanId?: string;
  renewedByPlanId?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancelledValueInCents?: number;
}

export interface SessionMovement {
  serviceId: string;
  serviceName?: string;
  id: string;
  planId: string;
  appointmentId?: string;
  kind: "credit" | "consumption" | "reversal" | "adjustment";
  quantity: number;
  reason: string;
  createdAt: string;
}
