import { z } from "zod";
import {
  patientPlanInputSchema,
  planCatalogInputSchema,
  planPauseDetailsSchema,
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
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  sourceTabId?: string;
  sourceAppointmentId?: string;
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
  /** Pausa em andamento: início, motivo e previsão de retorno. */
  pausedAt?: string;
  pauseReason?: string;
  pauseExpectedReturn?: string;
  /** Situação das parcelas do plano (só na listagem; ausente sem cobrança). */
  paymentSummary?: PlanPaymentSummary;
}

/** Parcelas do plano por situação; canceladas ficam fora. */
export interface PlanPaymentSummary {
  installmentCount: number;
  paidCount: number;
  openCount: number;
  overdueCount: number;
  paidInCents: number;
  openInCents: number;
}

export type PlanPauseDetails = z.infer<typeof planPauseDetailsSchema>;

export interface SessionMovement {
  groupAttendanceId?: string;
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
