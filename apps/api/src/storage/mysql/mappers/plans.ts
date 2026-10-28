import {
  tabCreditPlanName,
  type PatientPlan,
  type PatientPlanService,
  type PlanCatalogEntry,
  type PlanStatus,
  type PlanTemplate,
  type SessionMovement,
} from "@crm/contracts";
import { json } from "./common.js";

export type PlanTemplateRow = Omit<PlanTemplate, "createdAt" | "updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
};

export const planTemplateColumns = `id, clinic_id AS "clinicId", name, total_value_in_cents AS "totalValueInCents", kind, plan_type AS "planType",
  (SELECT JSON_ARRAYAGG(JSON_OBJECT('position',x.position,'serviceId',x.service_id,'totalSessions',x.total_sessions,'totalValueInCents',x.total_value_in_cents,'sessionsPerWeek',x.sessions_per_week))
    FROM plan_template_services x WHERE x.template_id=plan_templates.id) AS services,
  active, created_at AS "createdAt", updated_at AS "updatedAt"`;

/** Itens montados com `JSON_ARRAYAGG` (sem ordem garantida): ordena por `position` e a remove. */
export function orderedItems<T>(value: unknown): T[] {
  const items = json<(T & { position: number })[] | null>(value) ?? [];
  return items
    .sort((a, b) => a.position - b.position)
    .map((item) =>
      Object.fromEntries(
        Object.entries(item).filter(
          ([key, entry]) => key !== "position" && entry !== null,
        ),
      ),
    ) as T[];
}

export function mapPlanTemplate(row: PlanTemplateRow): PlanTemplate {
  return {
    ...row,
    services: orderedItems(row.services),
    active: Boolean(row.active),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface PatientPlanRow {
  branchId?: string;
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
  paymentMethod: PatientPlan["paymentMethod"] | null;
  patientName: string;
  serviceName: string;
  status: PlanStatus;
  autoRenew: boolean;
  renewedFromPlanId: string | null;
  renewedByPlanId: string | null;
  cancelledAt: Date | null;
  cancelledValueInCents: number;
  pausedAt: Date | null;
  pauseReason: string | null;
  pauseExpectedReturn: string | null;
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
  pp.branch_id AS "branchId", pp.id, pp.clinic_id AS "clinicId", pp.patient_id AS "patientId",
  pp.source_tab_id AS "sourceTabId", pp.source_appointment_id AS "sourceAppointmentId",
  pp.service_id AS "serviceId", pp.name, pp.kind,
  pp.total_sessions AS "totalSessions", pp.remaining_sessions AS "remainingSessions",
  pp.valid_from AS "validFrom", pp.valid_until AS "validUntil",
  pp.total_value_in_cents AS "totalValueInCents", pp.installments,
  pp.first_due_date AS "firstDueDate", pp.status, pp.payment_method AS "paymentMethod",
  pp.plan_template_id AS "planTemplateId", pp.auto_renew AS "autoRenew", pp.renewed_from_plan_id AS "renewedFromPlanId",
  (SELECT n.id FROM patient_plans n WHERE n.renewed_from_plan_id = pp.id) AS "renewedByPlanId",
  p.full_name AS "patientName",
  (SELECT GROUP_CONCAT(x.service_name ORDER BY x.position SEPARATOR ', ') FROM patient_plan_services x WHERE x.plan_id=pp.id) AS "serviceName",
  (SELECT JSON_ARRAYAGG(JSON_OBJECT('position',x.position,'serviceId',x.service_id,'serviceName',x.service_name,'totalSessions',x.total_sessions,'remainingSessions',x.remaining_sessions,'totalValueInCents',x.total_value_in_cents))
    FROM patient_plan_services x WHERE x.plan_id=pp.id) AS services,
  pp.cancelled_at AS "cancelledAt", pp.cancelled_value_in_cents AS "cancelledValueInCents",
  pp.paused_at AS "pausedAt", pp.pause_reason AS "pauseReason", pp.pause_expected_return AS "pauseExpectedReturn",
  pp.created_at AS "createdAt", pp.updated_at AS "updatedAt"
`;

export function mapPatientPlan(row: PatientPlanRow): PatientPlan {
  return {
    ...(row.branchId ? { branchId: row.branchId } : {}),
    ...(row.sourceTabId
      ? {
          sourceTabId: row.sourceTabId,
          sourceAppointmentId: row.sourceAppointmentId!,
        }
      : {}),
    services: orderedItems(row.services),
    ...(row.planTemplateId ? { planTemplateId: row.planTemplateId } : {}),
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    serviceId: row.serviceId,
    // Créditos antigos da comanda foram gravados com o código no nome.
    name: row.sourceTabId ? tabCreditPlanName(row.serviceName) : row.name,
    kind: row.kind,
    totalSessions: row.totalSessions,
    remainingSessions: row.remainingSessions,
    validFrom: row.validFrom,
    ...(row.validUntil ? { validUntil: row.validUntil } : {}),
    totalValueInCents: row.totalValueInCents,
    installments: row.installments,
    firstDueDate: row.firstDueDate,
    ...(row.paymentMethod ? { paymentMethod: row.paymentMethod } : {}),
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
    ...(row.pausedAt ? { pausedAt: row.pausedAt.toISOString() } : {}),
    ...(row.pauseReason ? { pauseReason: row.pauseReason } : {}),
    ...(row.pauseExpectedReturn
      ? { pauseExpectedReturn: row.pauseExpectedReturn }
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
