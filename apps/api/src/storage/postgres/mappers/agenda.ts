import type {
  Appointment,
  AppointmentStatus,
  AppointmentVisitType,
  GroupAttendance,
  GroupClass,
  GroupClassInput,
  GroupEnrollment,
  GroupSession,
  Holiday,
  ReplacementCredit,
  ScheduleBlock,
} from "@crm/contracts";
import type { Pool, PoolClient } from "pg";
import { present } from "./administration.js";

export interface AppointmentRow {
  branchId?: string;
  predecessorId?: string | null;
  absenceReason?: string | null;
  id: string;
  clinicId: string;
  patientId: string | null;
  leadId: string | null;
  leadName: string | null;
  professionalId: string;
  roomId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  notes: string | null;
  patientName: string;
  professionalName: string;
  professionalColor: string;
  roomName: string;
  serviceName: string;
  createdAt: Date;
  updatedAt: Date;
  seriesId: string | null;
  visitType: AppointmentVisitType;
  autoCompletedAt?: Date | null;
}

export interface ScheduleBlockRow {
  id: string;
  clinicId: string;
  professionalId: string | null;
  roomId: string | null;
  professionalName: string | null;
  roomName: string | null;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  status: ScheduleBlock["status"];
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupClassRow {
  id: string;
  clinicId: string;
  name: string;
  sequence: number;
  serviceId: string;
  professionalId: string;
  roomId: string;
  capacity: number;
  weeklySlots: GroupClassInput["weeklySlots"];
  serviceName: string;
  professionalName: string;
  roomName: string;
  activeEnrollments: string | number;
  waitlistCount: string | number;
  active: boolean;
  createdAt: Date;
}

export interface GroupEnrollmentRow {
  id: string;
  clinicId: string;
  groupId: string;
  patientId: string;
  patientName: string;
  status: GroupEnrollment["status"];
  queuePosition: number | null;
  enrolledAt: Date;
  startsOn: string;
  endedOn: string | null;
  updatedAt: Date;
}

/** Fuso da clínica da matrícula `alias` (subconsulta em `clinics`). */
const enrollmentTimezone = (alias: string) =>
  `(SELECT timezone FROM clinics WHERE id=${alias}.clinic_id)`;

/** Colunas de `GroupEnrollmentRow` para a matrícula `e` com o cliente `p`. */
export const groupEnrollmentColumns = `e.id,e.clinic_id AS "clinicId",e.group_id AS "groupId",e.patient_id AS "patientId",p.full_name AS "patientName",e.status,e.queue_position AS "queuePosition",e.enrolled_at AS "enrolledAt",to_char(e.enrolled_at AT TIME ZONE ${enrollmentTimezone("e")},'YYYY-MM-DD') AS "startsOn",to_char(e.ended_at AT TIME ZONE ${enrollmentTimezone("e")},'YYYY-MM-DD') AS "endedOn",e.updated_at AS "updatedAt"`;

/**
 * A matrícula `e` participa do encontro `gs`: começou até a data do encontro e vale nessa
 * data (ativa, ou cancelada com fim igual ou posterior). Espelha `groupEnrollmentCoversSession`.
 */
export function groupEnrollmentCoversSessionSql(e: string, gs: string) {
  const timezone = enrollmentTimezone(e);
  const sessionDate = `(${gs}.starts_at AT TIME ZONE ${timezone})::date`;
  return `(${e}.status<>'waitlisted' AND (${e}.enrolled_at AT TIME ZONE ${timezone})::date<=${sessionDate} AND (${e}.status='active' OR (${e}.ended_at AT TIME ZONE ${timezone})::date>=${sessionDate}))`;
}

export interface GroupSessionRow {
  id: string;
  clinicId: string;
  groupId: string;
  groupName: string;
  professionalId: string;
  professionalName: string;
  roomId: string;
  roomName: string;
  startsAt: Date;
  endsAt: Date;
  status: GroupSession["status"];
  attendanceCount: string | number;
  createdAt: Date;
}

export interface GroupAttendanceRow {
  accountingEnabled?: boolean;
  outcome?: GroupAttendance["outcome"];
  replacementCreditId?: string | null;
  id: string;
  clinicId: string;
  sessionId: string;
  patientId: string;
  patientName: string;
  status: GroupAttendance["status"];
  notes: string | null;
  recordedAt: Date;
}

export interface ReplacementCreditRow {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  sourceSessionId: string;
  status: ReplacementCredit["status"];
  usedSessionId: string | null;
  createdAt: Date;
  usedAt: Date | null;
}

export const appointmentColumns = `
  a.branch_id AS "branchId",
  a.predecessor_id AS "predecessorId",a.absence_reason AS "absenceReason",a.id,
  a.clinic_id AS "clinicId",
  a.patient_id AS "patientId",
  a.lead_id AS "leadId",
  l.full_name AS "leadName",
  a.professional_id AS "professionalId",
  a.room_id AS "roomId",
  a.service_id AS "serviceId",
  a.starts_at AS "startsAt",
  a.ends_at AS "endsAt",
  a.status,
  a.notes,
  coalesce(p.full_name, l.full_name) AS "patientName",
  pr.full_name AS "professionalName",
  pr.color AS "professionalColor",
  r.name AS "roomName",
  s.name AS "serviceName",
  a.created_at AS "createdAt",
  a.updated_at AS "updatedAt",
  a.series_id AS "seriesId",
  a.visit_type AS "visitType",
  a.auto_completed_at AS "autoCompletedAt"
`;

// Atendimento é de cliente (patient_id) ou de lead (lead_id): os dois LEFT JOIN.
export const appointmentJoins = `
  LEFT JOIN patients p ON p.id = a.patient_id
  LEFT JOIN leads l ON l.id = a.lead_id
  JOIN professionals pr ON pr.id = a.professional_id
  JOIN rooms r ON r.id = a.room_id
  JOIN services s ON s.id = a.service_id
`;

export function mapAppointment(row: AppointmentRow): Appointment {
  return {
    ...(row.predecessorId ? { predecessorId: row.predecessorId } : {}),
    ...(row.absenceReason ? { absenceReason: row.absenceReason } : {}),
    ...(row.branchId ? { branchId: row.branchId } : {}),
    id: row.id,
    clinicId: row.clinicId,
    ...(row.patientId ? { patientId: row.patientId } : {}),
    ...(row.leadId ? { leadId: row.leadId } : {}),
    ...(row.leadName ? { leadName: row.leadName } : {}),
    professionalId: row.professionalId,
    roomId: row.roomId,
    serviceId: row.serviceId,
    status: row.status,
    patientName: row.patientName,
    professionalName: row.professionalName,
    professionalColor: row.professionalColor,
    roomName: row.roomName,
    serviceName: row.serviceName,
    notes: present(row.notes),
    visitType: row.visitType,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.seriesId ? { seriesId: row.seriesId } : {}),
    ...(row.autoCompletedAt
      ? { autoCompletedAt: row.autoCompletedAt.toISOString() }
      : {}),
  };
}

export function mapScheduleBlock(row: ScheduleBlockRow): ScheduleBlock {
  return {
    id: row.id,
    clinicId: row.clinicId,
    ...(row.professionalId ? { professionalId: row.professionalId } : {}),
    ...(row.roomId ? { roomId: row.roomId } : {}),
    ...(row.professionalName ? { professionalName: row.professionalName } : {}),
    ...(row.roomName ? { roomName: row.roomName } : {}),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapGroupClass(row: GroupClassRow): GroupClass {
  return {
    id: row.id,
    clinicId: row.clinicId,
    name: row.name,
    sequence: row.sequence,
    serviceId: row.serviceId,
    professionalId: row.professionalId,
    roomId: row.roomId,
    capacity: row.capacity,
    weeklySlots: row.weeklySlots,
    serviceName: row.serviceName,
    professionalName: row.professionalName,
    roomName: row.roomName,
    activeEnrollments: Number(row.activeEnrollments),
    waitlistCount: Number(row.waitlistCount),
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapGroupEnrollment(row: GroupEnrollmentRow): GroupEnrollment {
  return {
    id: row.id,
    clinicId: row.clinicId,
    groupId: row.groupId,
    patientId: row.patientId,
    patientName: row.patientName,
    status: row.status,
    ...(row.queuePosition !== null ? { queuePosition: row.queuePosition } : {}),
    enrolledAt: row.enrolledAt.toISOString(),
    startsOn: row.startsOn,
    ...(row.endedOn !== null ? { endedOn: row.endedOn } : {}),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapGroupSession(row: GroupSessionRow): GroupSession {
  return {
    id: row.id,
    clinicId: row.clinicId,
    groupId: row.groupId,
    groupName: row.groupName,
    professionalId: row.professionalId,
    professionalName: row.professionalName,
    roomId: row.roomId,
    roomName: row.roomName,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    attendanceCount: Number(row.attendanceCount),
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapGroupAttendance(row: GroupAttendanceRow): GroupAttendance {
  return {
    ...(row.accountingEnabled !== undefined
      ? { accountingEnabled: row.accountingEnabled }
      : {}),
    ...(row.outcome ? { outcome: row.outcome } : {}),
    ...(row.replacementCreditId
      ? { replacementCreditId: row.replacementCreditId }
      : {}),
    id: row.id,
    clinicId: row.clinicId,
    sessionId: row.sessionId,
    patientId: row.patientId,
    patientName: row.patientName,
    status: row.status,
    ...(row.notes ? { notes: row.notes } : {}),
    recordedAt: row.recordedAt.toISOString(),
  };
}

export function mapReplacementCredit(
  row: ReplacementCreditRow,
): ReplacementCredit {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    patientName: row.patientName,
    sourceSessionId: row.sourceSessionId,
    status: row.status,
    ...(row.usedSessionId ? { usedSessionId: row.usedSessionId } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.usedAt ? { usedAt: row.usedAt.toISOString() } : {}),
  };
}

// Encontros já reservados ocupam a agenda. Com `includeWeeklySlots`, os horários fixos das
// turmas ativas também contam depois do período já reservado, para que um atendimento marcado
// meses à frente não ocupe o horário de uma turma antes de o encontro ser gerado.
export async function hasGroupSessionConflict(
  client: Pool | PoolClient,
  clinicId: string,
  professionalId: string | undefined,
  roomId: string | undefined,
  startsAt: Date,
  endsAt: Date,
  includeWeeklySlots = true,
) {
  const result = await client.query(
    `SELECT 1 FROM group_sessions gs
     JOIN group_classes g ON g.id = gs.group_id
     WHERE gs.clinic_id = $1 AND gs.status <> 'cancelled'
       AND (($2::uuid IS NOT NULL AND coalesce(gs.professional_id,g.professional_id) = $2)
         OR ($3::uuid IS NOT NULL AND g.room_id = $3))
       AND gs.starts_at < $5 AND gs.ends_at > $4
     UNION ALL
     SELECT 1 FROM group_classes g
     JOIN clinics c ON c.id = g.clinic_id
     CROSS JOIN LATERAL jsonb_array_elements(g.weekly_slots) AS s(slot)
     WHERE $6 AND g.clinic_id = $1 AND g.active
       AND (($2::uuid IS NOT NULL AND g.professional_id = $2)
         OR ($3::uuid IS NOT NULL AND g.room_id = $3))
       AND EXTRACT(DOW FROM ($4::timestamptz AT TIME ZONE c.timezone)) = (s.slot->>'weekday')::int
       AND (s.slot->>'endTime')::time > ($4::timestamptz AT TIME ZONE c.timezone)::time
       AND (s.slot->>'startTime')::time < CASE
         WHEN ($5::timestamptz AT TIME ZONE c.timezone)::date > ($4::timestamptz AT TIME ZONE c.timezone)::date
           THEN time '23:59:59.999'
         ELSE ($5::timestamptz AT TIME ZONE c.timezone)::time END
       AND ((($4::timestamptz AT TIME ZONE c.timezone)::date + (s.slot->>'startTime')::time) AT TIME ZONE c.timezone)
         > coalesce(g.sessions_generated_until, now())
     LIMIT 1`,
    [
      clinicId,
      professionalId ?? null,
      roomId ?? null,
      startsAt,
      endsAt,
      includeWeeklySlots,
    ],
  );
  return Boolean(result.rowCount);
}

export const groupSessionColumns = `gs.id,gs.clinic_id AS "clinicId",gs.group_id AS "groupId",g.name AS "groupName",coalesce(gs.professional_id,g.professional_id) AS "professionalId",p.full_name AS "professionalName",g.room_id AS "roomId",r.name AS "roomName",gs.starts_at AS "startsAt",gs.ends_at AS "endsAt",gs.status,gs.created_at AS "createdAt"`;

export interface HolidayRow {
  id: string;
  clinicId: string;
  date: string;
  name: string;
  createdAt: Date;
}

export const holidayColumns = `id, clinic_id AS "clinicId", to_char(date, 'YYYY-MM-DD') AS date,
  name, created_at AS "createdAt"`;

export function mapHoliday(row: HolidayRow): Holiday {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
