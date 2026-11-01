import type { PoolClient } from "./infrastructure/mysql-client.js";
import {
  clinicDateOf,
  DEFAULT_CLINIC_TIMEZONE,
} from "./modules/finance/daily-cash.js";
import { insertRows } from "./storage/mysql/sql.js";
import {
  buildDemoScenarios,
  demoMessageTemplates,
  demoPlanTemplates,
  demoProfessionals,
  demoRooms,
  demoServices,
  demoUserId,
} from "./demo-scenarios.js";

const at = (value: string | null | undefined) =>
  value ? new Date(value) : null;
const ignore = { onDuplicate: "ignore" } as const;

// Called inside the same transaction as the original demonstration seed.
export async function seedDemoScenarios(client: PoolClient, branchId: string) {
  const data = buildDemoScenarios();
  const clinicId = data.plans[0]!.clinicId;
  await insertRows(
    client,
    "professionals",
    demoProfessionals.map((item) => ({
      id: item.id,
      clinic_id: item.clinicId,
      branch_id: branchId,
      full_name: item.fullName,
      crefito: item.crefito,
      specialty: item.specialty,
      color: item.color,
      active: item.active,
    })),
    ignore,
  );
  await insertRows(
    client,
    "rooms",
    demoRooms.map((item) => ({
      id: item.id,
      clinic_id: item.clinicId,
      branch_id: branchId,
      name: item.name,
      capacity: item.capacity,
      active: item.active,
    })),
    ignore,
  );
  await insertRows(
    client,
    "services",
    demoServices.map((item) => ({
      id: item.id,
      clinic_id: item.clinicId,
      name: item.name,
      duration_minutes: item.durationMinutes,
      color: item.color,
      professional_ids: item.professionalIds ?? [],
      room_ids: item.roomIds ?? [],
      active: item.active,
    })),
    ignore,
  );
  await insertRows(
    client,
    "plan_templates",
    demoPlanTemplates.map((item) => ({
      id: item.id,
      clinic_id: item.clinicId,
      name: item.name,
      total_value_in_cents: item.totalValueInCents,
      service_id: item.services[0]!.serviceId,
      kind: item.kind,
      total_sessions: item.services[0]!.totalSessions,
      plan_type: item.planType,
      active: item.active,
    })),
    ignore,
  );
  await insertRows(
    client,
    "plan_template_services",
    demoPlanTemplates.flatMap((item) =>
      item.services.map((entry, position) => ({
        clinic_id: item.clinicId,
        template_id: item.id,
        service_id: entry.serviceId,
        position,
        total_sessions: entry.totalSessions,
        total_value_in_cents: entry.totalValueInCents,
      })),
    ),
    ignore,
  );
  await insertRows(
    client,
    "patient_plans",
    data.plans.map((plan) => ({
      id: plan.id,
      clinic_id: plan.clinicId,
      branch_id: branchId,
      patient_id: plan.patientId,
      service_id: plan.serviceId,
      name: plan.name,
      kind: plan.kind,
      total_sessions: plan.totalSessions,
      remaining_sessions: plan.remainingSessions,
      valid_from: plan.validFrom,
      valid_until: plan.validUntil ?? null,
      total_value_in_cents: plan.totalValueInCents,
      installments: plan.installments,
      first_due_date: plan.firstDueDate,
      status: plan.status,
      cancelled_at: at(plan.cancelledAt),
      cancelled_value_in_cents: plan.cancelledValueInCents ?? 0,
      auto_renew: plan.autoRenew,
      created_at: at(plan.createdAt),
      updated_at: at(plan.updatedAt),
    })),
    ignore,
  );
  const services = new Map(
    demoServices.map((service) => [service.id, service]),
  );
  await insertRows(
    client,
    "patient_plan_services",
    data.plans.map((plan) => ({
      clinic_id: plan.clinicId,
      plan_id: plan.id,
      service_id: plan.serviceId,
      position: 0,
      service_name: services.get(plan.serviceId)?.name ?? plan.name,
      total_sessions: plan.totalSessions,
      remaining_sessions: plan.remainingSessions,
      total_value_in_cents: plan.totalValueInCents,
    })),
    ignore,
  );
  await insertRows(
    client,
    "appointments",
    data.appointments.map((item) => ({
      id: item.id,
      clinic_id: item.clinicId,
      branch_id: branchId,
      patient_id: item.patientId,
      professional_id: item.professionalId,
      room_id: item.roomId,
      service_id: item.serviceId,
      starts_at: at(item.startsAt),
      ends_at: at(item.endsAt),
      status: item.status,
      created_at: at(item.createdAt),
      updated_at: at(item.updatedAt),
    })),
    ignore,
  );
  await insertRows(
    client,
    "session_movements",
    data.movements.map((item) => ({
      id: item.id,
      clinic_id: clinicId,
      plan_id: item.planId,
      service_id: item.serviceId,
      appointment_id: item.appointmentId ?? null,
      kind: item.kind,
      quantity: item.quantity,
      reason: item.reason,
      actor_user_id: demoUserId,
      created_at: at(item.createdAt),
    })),
    ignore,
  );
  await insertRows(
    client,
    "receivables",
    data.receivables.map((item) => ({
      id: item.id,
      clinic_id: item.clinicId,
      branch_id: branchId,
      patient_id: item.patientId,
      plan_id: item.planId ?? null,
      description: item.description,
      installment_number: item.installmentNumber,
      installment_count: item.installmentCount,
      due_date: item.dueDate,
      amount_in_cents: item.amountInCents,
      status: item.status,
      paid_at: at(item.paidAt),
      payment_method: item.paymentMethod ?? null,
      posted_on: clinicDateOf(item.createdAt, DEFAULT_CLINIC_TIMEZONE),
      competence: clinicDateOf(item.createdAt, DEFAULT_CLINIC_TIMEZONE).slice(
        0,
        7,
      ),
      created_at: at(item.createdAt),
      updated_at: at(item.updatedAt),
    })),
    ignore,
  );
  await insertRows(
    client,
    "financial_events",
    data.financialEvents.map((item) => ({
      id: item.id,
      clinic_id: clinicId,
      receivable_id: item.receivableId,
      actor_user_id: demoUserId,
      kind: item.kind,
      amount_in_cents: item.amountInCents,
      created_at: at(item.createdAt),
    })),
    ignore,
  );
  await insertRows(
    client,
    "group_classes",
    data.groups.map((item) => ({
      id: item.id,
      clinic_id: item.clinicId,
      branch_id: branchId,
      name: item.name,
      sequence: item.sequence,
      service_id: item.serviceId,
      professional_id: item.professionalId,
      room_id: item.roomId,
      capacity: item.capacity,
      weekly_slots: item.weeklySlots,
      active: item.active,
      created_at: at(item.createdAt),
    })),
    ignore,
  );
  await insertRows(
    client,
    "group_enrollments",
    data.enrollments.map((item) => ({
      id: item.id,
      clinic_id: item.clinicId,
      group_id: item.groupId,
      patient_id: item.patientId,
      status: item.status,
      enrolled_at: at(item.enrolledAt),
      updated_at: at(item.updatedAt),
      ended_at: item.status === "cancelled" ? at(item.updatedAt) : null,
    })),
    ignore,
  );
  await insertRows(
    client,
    "group_sessions",
    data.sessions.map((item) => ({
      id: item.id,
      clinic_id: item.clinicId,
      group_id: item.groupId,
      starts_at: at(item.startsAt),
      ends_at: at(item.endsAt),
      status: item.status,
      created_at: at(item.createdAt),
    })),
    ignore,
  );
  await insertRows(
    client,
    "group_attendance",
    data.attendance.map((item) => ({
      id: item.id,
      clinic_id: item.clinicId,
      session_id: item.sessionId,
      patient_id: item.patientId,
      status: item.status,
      notes: item.notes ?? null,
      recorded_by_user_id: demoUserId,
      recorded_at: at(item.recordedAt),
    })),
    ignore,
  );
  await insertRows(
    client,
    "message_templates",
    demoMessageTemplates.map((item) => ({
      id: item.id,
      clinic_id: clinicId,
      title: item.title,
      body: item.body,
      created_by: demoUserId,
    })),
    ignore,
  );
}
