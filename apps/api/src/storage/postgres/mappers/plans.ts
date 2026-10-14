import type {
  PatientPlan,
  PatientPlanService,
  PlanCatalogEntry,
  PlanStatus,
  PlanTemplate,
  SessionMovement,
} from "@crm/contracts";

export type PlanTemplateRow = Omit<PlanTemplate, "createdAt" | "updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
};

export const planTemplateColumns = `id, clinic_id AS "clinicId", name, total_value_in_cents AS "totalValueInCents", kind, plan_type AS "planType",
  coalesce((SELECT jsonb_agg(jsonb_build_object('serviceId',x.service_id,'totalSessions',x.total_sessions,'totalValueInCents',x.total_value_in_cents,'sessionsPerWeek',x.sessions_per_week) ORDER BY x.position)
    FROM plan_template_services x WHERE x.template_id=plan_templates.id),'[]'::jsonb) AS services,
  active, created_at AS "createdAt", updated_at AS "updatedAt"`;

export function mapPlanTemplate(row: PlanTemplateRow): PlanTemplate {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface PatientPlanRow {
  sourceTabId: string | null;
  sourceAppointmentId: string | null;
  services: PatientPlanService[];
  planTemplateId: string | null;
  id: string;
  clinicId: string;
  patientId: string;
  serviceId: string;
  name: string;
  kind: PatientPlan["kind"];
  totalSessions: number;
  remainingSessions: number;
  validFrom: string;
  validUntil: string | null;
  totalValueInCents: number;
  installments: number;
  firstDueDate: string;
  patientName: string;
  serviceName: string;
  status: PlanStatus;
  autoRenew: boolean;
  renewedFromPlanId: string | null;
  renewedByPlanId: string | null;
  cancelledAt: Date | null;
  cancelledValueInCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionMovementRow {
  groupAttendanceId?: string | null;
  serviceId: string;
  serviceName: string;
  id: string;
  planId: string;
  appointmentId: string | null;
  kind: SessionMovement["kind"];
  quantity: number;
  reason: string;
  createdAt: Date;
}

export const patientPlanColumns = `
  pp.id, pp.clinic_id AS "clinicId", pp.patient_id AS "patientId",
  pp.source_tab_id AS "sourceTabId", pp.source_appointment_id AS "sourceAppointmentId",
  pp.service_id AS "serviceId", pp.name, pp.kind,
  pp.total_sessions AS "totalSessions", pp.remaining_sessions AS "remainingSessions",
  pp.valid_from::text AS "validFrom", pp.valid_until::text AS "validUntil",
  pp.total_value_in_cents AS "totalValueInCents", pp.installments,
  pp.first_due_date::text AS "firstDueDate", pp.status,
  pp.plan_template_id AS "planTemplateId", pp.auto_renew AS "autoRenew", pp.renewed_from_plan_id AS "renewedFromPlanId",
  (SELECT n.id FROM patient_plans n WHERE n.renewed_from_plan_id = pp.id) AS "renewedByPlanId",
  p.full_name AS "patientName",
  (SELECT string_agg(x.service_name, ', ' ORDER BY x.position) FROM patient_plan_services x WHERE x.plan_id=pp.id) AS "serviceName",
  (SELECT jsonb_agg(jsonb_build_object('serviceId',x.service_id,'serviceName',x.service_name,'totalSessions',x.total_sessions,'remainingSessions',x.remaining_sessions,'totalValueInCents',x.total_value_in_cents) ORDER BY x.position)
    FROM patient_plan_services x WHERE x.plan_id=pp.id) AS services,
  pp.cancelled_at AS "cancelledAt", pp.cancelled_value_in_cents AS "cancelledValueInCents",
  pp.created_at AS "createdAt", pp.updated_at AS "updatedAt"
`;

export function mapPatientPlan(row: PatientPlanRow): PatientPlan {
  return {
    ...(row.sourceTabId
      ? {
          sourceTabId: row.sourceTabId,
          sourceAppointmentId: row.sourceAppointmentId!,
        }
      : {}),
    services: row.services,
    ...(row.planTemplateId ? { planTemplateId: row.planTemplateId } : {}),
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    serviceId: row.serviceId,
    name: row.name,
    kind: row.kind,
    totalSessions: row.totalSessions,
    remainingSessions: row.remainingSessions,
    validFrom: row.validFrom,
    ...(row.validUntil ? { validUntil: row.validUntil } : {}),
    totalValueInCents: row.totalValueInCents,
    installments: row.installments,
    firstDueDate: row.firstDueDate,
    patientName: row.patientName,
    serviceName: row.serviceName,
    status: row.status,
    autoRenew: row.autoRenew,
    ...(row.renewedFromPlanId
      ? { renewedFromPlanId: row.renewedFromPlanId }
      : {}),
    ...(row.renewedByPlanId ? { renewedByPlanId: row.renewedByPlanId } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.cancelledAt
      ? {
          cancelledAt: row.cancelledAt.toISOString(),
          cancelledValueInCents: row.cancelledValueInCents,
        }
      : {}),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type PlanCatalogRow = Omit<
  PlanCatalogEntry,
  "createdAt" | "updatedAt"
> & {
  createdAt: Date;
  updatedAt: Date;
};

export const planCatalogColumns =
  'id, clinic_id AS "clinicId", name, total_value_in_cents AS "totalValueInCents", created_at AS "createdAt", updated_at AS "updatedAt"';

export function mapPlanCatalog(row: PlanCatalogRow): PlanCatalogEntry {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
