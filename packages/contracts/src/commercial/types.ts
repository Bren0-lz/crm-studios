import { z } from "zod";
import type { LeadStage, Patient } from "../patients/types.js";
import {
  leadContactChannelSchema,
  leadContactInputSchema,
  leadInputSchema,
  leadTaskInputSchema,
  leadTaskStatusSchema,
} from "./model.js";

export type LeadInput = z.infer<typeof leadInputSchema>;

export type LeadContactChannel = z.infer<typeof leadContactChannelSchema>;

export type LeadContactInput = z.infer<typeof leadContactInputSchema>;

export type LeadTaskStatus = z.infer<typeof leadTaskStatusSchema>;

export type LeadTaskInput = z.infer<typeof leadTaskInputSchema>;

export interface Lead extends LeadInput {
  id: string;
  clinicId: string;
  stage: LeadStage;
  lostReason?: string;
  convertedPatientId?: string;
  createdAt: string;
  updatedAt: string;
  responsibleName?: string;
  openTasks: number;
  overdueTasks: number;
  lastContactAt?: string;
}

export interface LeadConversion {
  lead: Lead;
  patient: Patient;
  reusedExisting: boolean;
}

export interface LeadContact extends LeadContactInput {
  id: string;
  clinicId: string;
  leadId: string;
  actorName: string;
  occurredAt: string;
  createdAt: string;
}

export interface LeadTask extends LeadTaskInput {
  id: string;
  clinicId: string;
  leadId: string;
  status: LeadTaskStatus;
  assignedUserName?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  contacts: LeadContact[];
  tasks: LeadTask[];
}

export interface CommercialSourceBreakdown {
  source: string;
  leads: number;
  won: number;
  lost: number;
  conversionRate: number;
}
