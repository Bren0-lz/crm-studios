import { leadPatientProfile } from "@crm/contracts/commercial";
import type {
  Lead,
  LeadContact,
  LeadStage,
  LeadTask,
  LeadTaskStatus,
} from "@crm/contracts";
import { json } from "./common.js";

export interface LeadRow {
  branchId?: string;
  eventId?: string | null;
  contactMethod: string | null;
  profile?: Record<string, unknown>;
  id: string;
  clinicId: string;
  fullName: string;
  phone: string;
  email: string | null;
  source: string;
  interest: string;
  notes: string | null;
  stage: LeadStage;
  lostReason: string | null;
  convertedPatientId: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  tags: string[];
  openTasks: number;
  overdueTasks: number;
  lastContactAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadContactRow {
  contactMethod: string | null;
  id: string;
  clinicId: string;
  leadId: string;
  channel: LeadContact["channel"];
  direction: LeadContact["direction"];
  notes: string;
  /** TINYINT(1): 0 = tentativa sem resposta. */
  reached: number | boolean;
  actorName: string;
  occurredAt: Date;
  createdAt: Date;
}

export interface LeadTaskRow {
  id: string;
  clinicId: string;
  leadId: string;
  title: string;
  notes: string | null;
  dueAt: Date;
  assignedUserId: string | null;
  assignedUserName: string | null;
  status: LeadTaskStatus;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const leadColumns = `
  branch_id AS "branchId", id, clinic_id AS "clinicId", full_name AS "fullName", phone, email,
  contact_method AS "contactMethod",profile,source, interest, notes, stage, lost_reason AS "lostReason",
  converted_patient_id AS "convertedPatientId", event_id AS "eventId",
  responsible_user_id AS "responsibleUserId", tags,
  (SELECT u.full_name FROM users u WHERE u.id = leads.responsible_user_id) AS "responsibleName",
  (SELECT COUNT(*) FROM lead_tasks lt WHERE lt.lead_id = leads.id AND lt.status = 'open') AS "openTasks",
  (SELECT COUNT(*) FROM lead_tasks lt WHERE lt.lead_id = leads.id AND lt.status = 'open' AND lt.due_at < NOW(6)) AS "overdueTasks",
  (SELECT MAX(lc.occurred_at) FROM lead_contacts lc WHERE lc.lead_id = leads.id) AS "lastContactAt",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export function mapLead(row: LeadRow): Lead {
  return {
    ...(row.branchId ? { branchId: row.branchId } : {}),
    ...leadPatientProfile(json(row.profile) ?? {}),
    id: row.id,
    clinicId: row.clinicId,
    fullName: row.fullName,
    phone: row.phone,
    ...(row.email ? { email: row.email } : {}),
    source: row.source,
    ...(row.contactMethod ? { contactMethod: row.contactMethod } : {}),
    interest: row.interest,
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.responsibleUserId
      ? { responsibleUserId: row.responsibleUserId }
      : {}),
    ...(row.responsibleName ? { responsibleName: row.responsibleName } : {}),
    tags: json(row.tags) ?? [],
    stage: row.stage,
    ...(row.lostReason ? { lostReason: row.lostReason } : {}),
    ...(row.convertedPatientId
      ? { convertedPatientId: row.convertedPatientId }
      : {}),
    ...(row.eventId ? { eventId: row.eventId } : {}),
    openTasks: Number(row.openTasks ?? 0),
    overdueTasks: Number(row.overdueTasks ?? 0),
    ...(row.lastContactAt
      ? { lastContactAt: row.lastContactAt.toISOString() }
      : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapLeadContact(row: LeadContactRow): LeadContact {
  return {
    id: row.id,
    clinicId: row.clinicId,
    leadId: row.leadId,
    channel: row.channel,
    ...(row.contactMethod ? { contactMethod: row.contactMethod } : {}),
    direction: row.direction,
    notes: row.notes,
    reached: Boolean(Number(row.reached)),
    actorName: row.actorName,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapLeadTask(row: LeadTaskRow): LeadTask {
  return {
    id: row.id,
    clinicId: row.clinicId,
    leadId: row.leadId,
    title: row.title,
    ...(row.notes ? { notes: row.notes } : {}),
    dueAt: row.dueAt.toISOString(),
    ...(row.assignedUserId ? { assignedUserId: row.assignedUserId } : {}),
    ...(row.assignedUserName ? { assignedUserName: row.assignedUserName } : {}),
    status: row.status,
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
