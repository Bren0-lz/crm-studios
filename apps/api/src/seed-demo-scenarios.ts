import type { PoolClient } from "pg";
import {
  buildDemoScenarios,
  demoProfessionals,
  demoRooms,
  demoServices,
  demoUserId,
} from "./demo-scenarios.js";

// Called inside the same transaction as the original demonstration seed.
export async function seedDemoScenarios(client: PoolClient) {
  const data = buildDemoScenarios();
  await client.query(
    `INSERT INTO professionals (id, clinic_id, full_name, crefito, specialty, color, active)
    SELECT id, "clinicId", "fullName", crefito, specialty, color, active
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "clinicId" uuid, "fullName" text, crefito text, specialty text, color text, active boolean)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(demoProfessionals)],
  );
  await client.query(
    `INSERT INTO rooms (id, clinic_id, name, capacity, active)
    SELECT id, "clinicId", name, capacity, active
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "clinicId" uuid, name text, capacity integer, active boolean)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(demoRooms)],
  );
  await client.query(
    `INSERT INTO services (id, clinic_id, name, duration_minutes, price_in_cents, color, active)
    SELECT id, "clinicId", name, "durationMinutes", "priceInCents", color, active
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "clinicId" uuid, name text, "durationMinutes" integer, "priceInCents" integer, color text, active boolean)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(demoServices)],
  );
  await client.query(
    `INSERT INTO patient_plans (id, clinic_id, patient_id, service_id, name, kind, total_sessions, remaining_sessions, valid_from, valid_until, total_value_in_cents, installments, first_due_date, status, cancelled_at, cancelled_value_in_cents, auto_renew, created_at, updated_at)
    SELECT id, "clinicId", "patientId", "serviceId", name, kind::plan_kind, "totalSessions", "remainingSessions", "validFrom"::date, "validUntil"::date, "totalValueInCents", installments, "firstDueDate"::date, status::plan_status, "cancelledAt"::timestamptz, coalesce("cancelledValueInCents", 0), "autoRenew", "createdAt"::timestamptz, "updatedAt"::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "clinicId" uuid, "patientId" uuid, "serviceId" uuid, name text, kind text, "totalSessions" integer, "remainingSessions" integer, "validFrom" text, "validUntil" text, "totalValueInCents" integer, installments integer, "firstDueDate" text, status text, "cancelledAt" text, "cancelledValueInCents" integer, "autoRenew" boolean, "createdAt" text, "updatedAt" text)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(data.plans)],
  );
  await client.query(
    `INSERT INTO patient_plan_services (clinic_id,plan_id,service_id,position,service_name,total_sessions,remaining_sessions,total_value_in_cents)
     SELECT pp.clinic_id,pp.id,pp.service_id,0,s.name,pp.total_sessions,pp.remaining_sessions,pp.total_value_in_cents
     FROM patient_plans pp JOIN services s ON s.id=pp.service_id WHERE pp.id=ANY($1::uuid[]) ON CONFLICT DO NOTHING`, [data.plans.map((plan) => plan.id)]);
  await client.query(
    `INSERT INTO appointments (id, clinic_id, patient_id, professional_id, room_id, service_id, starts_at, ends_at, status, created_at, updated_at)
    SELECT id, "clinicId", "patientId", "professionalId", "roomId", "serviceId", "startsAt"::timestamptz, "endsAt"::timestamptz, status::appointment_status, "createdAt"::timestamptz, "updatedAt"::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "clinicId" uuid, "patientId" uuid, "professionalId" uuid, "roomId" uuid, "serviceId" uuid, "startsAt" text, "endsAt" text, status text, "createdAt" text, "updatedAt" text)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(data.appointments)],
  );
  await client.query(
    `INSERT INTO session_movements (id, clinic_id, plan_id, service_id, appointment_id, kind, quantity, reason, actor_user_id, created_at)
    SELECT id, $2::uuid, "planId", "serviceId", "appointmentId", kind::session_movement_kind, quantity, reason, $3::uuid, "createdAt"::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "planId" uuid, "serviceId" uuid, "appointmentId" uuid, kind text, quantity integer, reason text, "createdAt" text)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(data.movements), data.plans[0]!.clinicId, demoUserId],
  );
  await client.query(
    `INSERT INTO receivables (id, clinic_id, patient_id, plan_id, description, installment_number, installment_count, due_date, amount_in_cents, status, paid_at, payment_method, created_at, updated_at)
    SELECT id, "clinicId", "patientId", "planId", description, "installmentNumber", "installmentCount", "dueDate"::date, "amountInCents", status::receivable_status, "paidAt"::timestamptz, "paymentMethod", "createdAt"::timestamptz, "updatedAt"::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "clinicId" uuid, "patientId" uuid, "planId" uuid, description text, "installmentNumber" integer, "installmentCount" integer, "dueDate" text, "amountInCents" integer, status text, "paidAt" text, "paymentMethod" text, "createdAt" text, "updatedAt" text)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(data.receivables)],
  );
  await client.query(
    `INSERT INTO financial_events (id, clinic_id, receivable_id, actor_user_id, kind, amount_in_cents, created_at)
    SELECT id, $2::uuid, "receivableId", $3::uuid, kind, "amountInCents", "createdAt"::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "receivableId" uuid, kind text, "amountInCents" integer, "createdAt" text)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(data.financialEvents), data.plans[0]!.clinicId, demoUserId],
  );
  await client.query(
    `INSERT INTO group_classes (id, clinic_id, name, sequence, service_id, professional_id, room_id, capacity, weekly_slots, active, created_at)
    SELECT id, "clinicId", name, sequence, "serviceId", "professionalId", "roomId", capacity, "weeklySlots", active, "createdAt"::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "clinicId" uuid, name text, sequence integer, "serviceId" uuid, "professionalId" uuid, "roomId" uuid, capacity integer, "weeklySlots" jsonb, active boolean, "createdAt" text)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(data.groups)],
  );
  await client.query(
    `INSERT INTO group_enrollments (id, clinic_id, group_id, patient_id, status, enrolled_at, updated_at)
    SELECT id, "clinicId", "groupId", "patientId", status, "enrolledAt"::timestamptz, "updatedAt"::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "clinicId" uuid, "groupId" uuid, "patientId" uuid, status text, "enrolledAt" text, "updatedAt" text)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(data.enrollments)],
  );
  await client.query(
    `INSERT INTO group_sessions (id, clinic_id, group_id, starts_at, ends_at, status, created_at)
    SELECT id, "clinicId", "groupId", "startsAt"::timestamptz, "endsAt"::timestamptz, status, "createdAt"::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "clinicId" uuid, "groupId" uuid, "startsAt" text, "endsAt" text, status text, "createdAt" text)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(data.sessions)],
  );
  await client.query(
    `INSERT INTO group_attendance (id, clinic_id, session_id, patient_id, status, notes, recorded_by_user_id, recorded_at)
    SELECT id, "clinicId", "sessionId", "patientId", status, notes, $2::uuid, "recordedAt"::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, "clinicId" uuid, "sessionId" uuid, "patientId" uuid, status text, notes text, "recordedAt" text)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(data.attendance), demoUserId],
  );
}
