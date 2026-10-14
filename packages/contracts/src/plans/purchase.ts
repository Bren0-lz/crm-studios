import { z } from "zod";
import { patientPlanInputSchema } from "./model.js";
import { appointmentInputSchema } from "../agenda/model.js";
import { issuedDocumentInputSchema } from "../contracts/model.js";
import type { PatientPlan } from "./types.js";
import type { Appointment, GroupEnrollment } from "../agenda/types.js";
import type { IssuedDocument } from "../contracts/types.js";
export const planPurchaseInputSchema = z.object({
  idempotencyKey: z.uuid(),
  plan: patientPlanInputSchema,
  groupId: z.uuid().optional(),
  appointments: z
    .array(appointmentInputSchema.omit({ patientId: true }))
    .max(120)
    .default([]),
  document: issuedDocumentInputSchema
    .omit({ patientId: true, planId: true })
    .optional(),
});
export type PlanPurchaseInput = z.infer<typeof planPurchaseInputSchema>;
export interface PlanPurchaseResult {
  plan: PatientPlan;
  appointments: Appointment[];
  enrollment?: GroupEnrollment;
  document?: IssuedDocument;
}
