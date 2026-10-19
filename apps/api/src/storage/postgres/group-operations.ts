import {
  type GroupAttendance,
  type GroupAttendanceInput,
  type ReplacementBookingInput,
} from "@crm/contracts";
import type { PoolClient } from "pg";
import { DomainError } from "../../repository.js";
import { assertReplacementTarget } from "../../modules/groups/replacement-target.js";
import type { PostgresRepositoryContext } from "./context.js";
import {
  groupEnrollmentCoversSessionSql,
  groupSessionColumns,
  mapGroupSession,
  mapGroupAttendance,
  mapReplacementCredit,
  type GroupSessionRow,
  type GroupAttendanceRow,
  type ReplacementCreditRow,
} from "./helpers.js";

const attendanceColumns = `ga.id,ga.clinic_id AS "clinicId",ga.session_id AS "sessionId",ga.patient_id AS "patientId",p.full_name AS "patientName",ga.status,ga.notes,ga.recorded_at AS "recordedAt",ga.accounting_enabled AS "accountingEnabled",ga.outcome,ga.replacement_credit_id AS "replacementCreditId"`;
const creditColumns = `rc.id,rc.clinic_id AS "clinicId",rc.patient_id AS "patientId",p.full_name AS "patientName",rc.source_session_id AS "sourceSessionId",rc.status,rc.used_session_id AS "usedSessionId",rc.created_at AS "createdAt",rc.used_at AS "usedAt"`;
export function createGroupOperationsRepository(
  context: PostgresRepositoryContext,
) {
  async function movement(
    client: PoolClient,
    clinicId: string,
    attendanceId: string,
    present: boolean,
  ) {
    const result = await client.query<{
      enabled: boolean;
      patientId: string;
      serviceId: string;
      startsAt: Date;
    }>(
      `SELECT ga.accounting_enabled AS enabled,ga.patient_id AS "patientId",g.service_id AS "serviceId",gs.starts_at AS "startsAt" FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id WHERE ga.clinic_id=$1 AND ga.id=$2 FOR UPDATE OF ga`,
      [clinicId, attendanceId],
    );
    const attendance = result.rows[0]!;
    if (!attendance.enabled) return;
    const ledger = await client.query<{
      balance: number;
      consumed: boolean;
      reversed: boolean;
      planId: string | null;
      serviceId: string | null;
    }>(
      `SELECT coalesce(sum(quantity),0)::int AS balance,bool_or(kind='consumption') AS consumed,bool_or(kind='reversal') AS reversed,(SELECT plan_id FROM session_movements WHERE clinic_id=$1 AND group_attendance_id=$2 GROUP BY plan_id,service_id HAVING sum(quantity)<0 LIMIT 1) AS "planId",(SELECT service_id FROM session_movements WHERE clinic_id=$1 AND group_attendance_id=$2 GROUP BY plan_id,service_id HAVING sum(quantity)<0 LIMIT 1) AS "serviceId" FROM session_movements WHERE clinic_id=$1 AND group_attendance_id=$2`,
      [clinicId, attendanceId],
    );
    const entry = ledger.rows[0]!;
    if ((present && entry.balance < 0) || (!present && entry.balance >= 0))
      return;
    const plans = present
      ? await client.query<{ id: string; balance: number }>(
          `SELECT pp.id,pps.remaining_sessions AS balance FROM patient_plans pp JOIN patient_plan_services pps ON pps.plan_id=pp.id AND pps.clinic_id=pp.clinic_id JOIN clinics c ON c.id=pp.clinic_id WHERE pp.clinic_id=$1 AND pp.patient_id=$2 AND pps.service_id=$3 AND pps.remaining_sessions>0 AND pp.status='active' AND pp.source_tab_id IS NULL AND pp.valid_from<=($4::timestamptz AT TIME ZONE c.timezone)::date AND (pp.valid_until IS NULL OR pp.valid_until>=($4::timestamptz AT TIME ZONE c.timezone)::date) ORDER BY pp.valid_until NULLS LAST,pp.created_at LIMIT 1 FOR UPDATE OF pp,pps`,
          [
            clinicId,
            attendance.patientId,
            attendance.serviceId,
            attendance.startsAt,
          ],
        )
      : await client.query<{ id: string; balance: number }>(
          `SELECT pp.id,pps.remaining_sessions AS balance FROM patient_plans pp JOIN patient_plan_services pps ON pps.plan_id=pp.id AND pps.clinic_id=pp.clinic_id WHERE pp.clinic_id=$1 AND pp.id=$2 AND pps.service_id=$3 FOR UPDATE OF pp,pps`,
          [clinicId, entry.planId, entry.serviceId],
        );
    const plan = plans.rows[0];
    if (!plan || (present && plan.balance < 1))
      throw new DomainError(
        "NO_SESSION_BALANCE",
        "O cliente não possui plano vigente com saldo para este serviço.",
        409,
      );
    const quantity = present ? -1 : 1,
      serviceId = present ? attendance.serviceId : entry.serviceId;
    await client.query(
      `INSERT INTO session_movements(clinic_id,plan_id,group_attendance_id,service_id,kind,quantity,reason) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        clinicId,
        plan.id,
        attendanceId,
        serviceId,
        present
          ? entry.consumed
            ? "adjustment"
            : "consumption"
          : entry.reversed
            ? "adjustment"
            : "reversal",
        quantity,
        present ? "Presença em turma" : "Correção da presença em turma",
      ],
    );
    await client.query(
      "UPDATE patient_plan_services SET remaining_sessions=remaining_sessions+$4 WHERE clinic_id=$1 AND plan_id=$2 AND service_id=$3",
      [clinicId, plan.id, serviceId, quantity],
    );
    await client.query(
      "UPDATE patient_plans SET remaining_sessions=remaining_sessions+$3,updated_at=now() WHERE clinic_id=$1 AND id=$2",
      [clinicId, plan.id, quantity],
    );
  }
  async function readAttendance(
    client: PoolClient,
    clinicId: string,
    id: string,
  ) {
    const result = await client.query<GroupAttendanceRow>(
      `SELECT ${attendanceColumns} FROM group_attendance ga JOIN patients p ON p.id=ga.patient_id AND p.clinic_id=ga.clinic_id WHERE ga.clinic_id=$1 AND ga.id=$2`,
      [clinicId, id],
    );
    return mapGroupAttendance(result.rows[0]!);
  }
  return {
    async recordGroupAttendance(
      clinicId: string,
      actorUserId: string,
      sessionId: string,
      patientId: string,
      input: GroupAttendanceInput,
    ) {
      return context.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const allowed = await client.query(
          `SELECT gs.id FROM group_sessions gs JOIN group_enrollments e ON e.group_id=gs.group_id AND e.clinic_id=gs.clinic_id WHERE gs.clinic_id=$1 AND gs.id=$2 AND gs.status<>'cancelled' AND e.patient_id=$3 AND ${groupEnrollmentCoversSessionSql("e", "gs")} FOR UPDATE OF gs`,
          [clinicId, sessionId, patientId],
        );
        if (!allowed.rowCount)
          throw new DomainError(
            "GROUP_ATTENDANCE_NOT_ALLOWED",
            "Matrícula ativa não encontrada.",
            404,
          );
        const existing = await client.query<{ status: string }>(
          "SELECT status FROM group_attendance WHERE clinic_id=$1 AND session_id=$2 AND patient_id=$3 FOR UPDATE",
          [clinicId, sessionId, patientId],
        );
        if (existing.rows[0]?.status === "replacement")
          throw new DomainError(
            "REPLACEMENT_ATTENDANCE_REQUIRED",
            "Registre a presença pela reposição.",
            409,
          );
        const credits = await client.query<{ status: string }>(
          "SELECT status FROM replacement_credits WHERE clinic_id=$1 AND source_session_id=$2 AND patient_id=$3 FOR UPDATE",
          [clinicId, sessionId, patientId],
        );
        if (
          credits.rows[0]?.status === "used" &&
          input.status !== "excused_absence"
        )
          throw new DomainError(
            "REPLACEMENT_ALREADY_USED",
            "A reposição desta falta já foi utilizada.",
            409,
          );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO group_attendance(clinic_id,session_id,patient_id,status,notes,recorded_by_user_id,accounting_enabled) VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(session_id,patient_id) DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes,recorded_by_user_id=EXCLUDED.recorded_by_user_id,recorded_at=now() RETURNING id`,
          [
            clinicId,
            sessionId,
            patientId,
            input.status,
            input.notes ?? null,
            actorUserId,
          ],
        );
        const id = inserted.rows[0]!.id;
        await movement(client, clinicId, id, input.status === "present");
        if (input.status === "excused_absence")
          await client.query(
            `INSERT INTO replacement_credits(clinic_id,patient_id,source_session_id) VALUES($1,$2,$3) ON CONFLICT(patient_id,source_session_id) DO UPDATE SET status=CASE WHEN replacement_credits.status='cancelled' THEN 'available' ELSE replacement_credits.status END`,
            [clinicId, patientId, sessionId],
          );
        else
          await client.query(
            "UPDATE replacement_credits SET status='cancelled' WHERE clinic_id=$1 AND patient_id=$2 AND source_session_id=$3 AND status='available'",
            [clinicId, patientId, sessionId],
          );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "group.attendance",
          "group_session",
          sessionId,
          { patientId, status: input.status },
        );
        return readAttendance(client, clinicId, id);
      });
    },
    async bookReplacement(
      clinicId: string,
      actorUserId: string,
      input: ReplacementBookingInput,
    ) {
      return context.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const creditResult = await client.query<ReplacementCreditRow>(
          `SELECT ${creditColumns} FROM replacement_credits rc JOIN patients p ON p.id=rc.patient_id AND p.clinic_id=rc.clinic_id WHERE rc.clinic_id=$1 AND rc.id=$2 FOR UPDATE OF rc`,
          [clinicId, input.creditId],
        );
        const credit = creditResult.rows[0];
        if (!credit || credit.status !== "available")
          throw new DomainError(
            "REPLACEMENT_NOT_AVAILABLE",
            "Crédito de reposição indisponível.",
            409,
          );
        const sessions = await client.query<{
          id: string;
          groupId: string;
          serviceId: string;
          capacity: number;
          status: string;
          startsAt: Date;
        }>(
          `SELECT gs.id,gs.group_id AS "groupId",g.service_id AS "serviceId",g.capacity,gs.status,gs.starts_at AS "startsAt" FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id WHERE gs.clinic_id=$1 AND gs.id=ANY($2::uuid[]) ORDER BY gs.id FOR UPDATE OF gs,g`,
          [clinicId, [input.sessionId, credit.sourceSessionId]],
        );
        const meeting = sessions.rows.find(
            (item) => item.id === input.sessionId,
          ),
          original = sessions.rows.find(
            (item) => item.id === credit.sourceSessionId,
          );
        if (meeting)
          assertReplacementTarget(
            meeting.id,
            credit.sourceSessionId,
            meeting.startsAt,
          );
        if (
          !meeting ||
          !original ||
          meeting.status !== "scheduled" ||
          meeting.serviceId !== original.serviceId
        )
          throw new DomainError(
            "REPLACEMENT_NOT_AVAILABLE",
            "Encontro incompatível ou indisponível.",
            409,
          );
        const existing = await client.query<{
          id: string;
          creditId: string | null;
          outcome: string | null;
        }>(
          `SELECT id,replacement_credit_id AS "creditId",outcome FROM group_attendance WHERE clinic_id=$1 AND session_id=$2 AND patient_id=$3 FOR UPDATE`,
          [clinicId, meeting.id, credit.patientId],
        );
        const previous = existing.rows[0];
        if (
          previous &&
          !(
            previous.creditId === credit.id &&
            ["cancelled", "excused_absence"].includes(previous.outcome ?? "")
          )
        )
          throw new DomainError(
            "REPLACEMENT_DUPLICATE_ATTENDANCE",
            "O cliente já possui presença registrada nesta sessão.",
            409,
          );
        const seats = await client.query<{
          regular: number;
          replacements: number;
          enrolled: boolean;
        }>(
          `SELECT (SELECT count(DISTINCT e.patient_id)::int FROM group_enrollments e JOIN group_sessions gs ON gs.id=$3 AND gs.clinic_id=e.clinic_id WHERE e.clinic_id=$1 AND e.group_id=$2 AND ${groupEnrollmentCoversSessionSql("e", "gs")}) AS regular,(SELECT count(*)::int FROM group_attendance WHERE clinic_id=$1 AND session_id=$3 AND status='replacement' AND coalesce(outcome,'scheduled') NOT IN ('cancelled','excused_absence')) AS replacements,EXISTS(SELECT 1 FROM group_enrollments e JOIN group_sessions gs ON gs.id=$3 AND gs.clinic_id=e.clinic_id WHERE e.clinic_id=$1 AND e.group_id=$2 AND e.patient_id=$4 AND ${groupEnrollmentCoversSessionSql("e", "gs")}) AS enrolled`,
          [clinicId, meeting.groupId, meeting.id, credit.patientId],
        );
        const occupancy = seats.rows[0]!;
        if (
          !occupancy.enrolled &&
          occupancy.regular + occupancy.replacements >= meeting.capacity
        )
          throw new DomainError(
            "GROUP_SESSION_FULL",
            "A sessão está lotada.",
            409,
          );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO group_attendance(clinic_id,session_id,patient_id,status,recorded_by_user_id,accounting_enabled,outcome,replacement_credit_id) VALUES($1,$2,$3,'replacement',$4,true,'scheduled',$5) ON CONFLICT(session_id,patient_id) DO UPDATE SET outcome='scheduled',recorded_at=now(),recorded_by_user_id=EXCLUDED.recorded_by_user_id RETURNING id`,
          [clinicId, meeting.id, credit.patientId, actorUserId, credit.id],
        );
        await client.query(
          "UPDATE replacement_credits SET status='used',used_session_id=$3,used_at=now() WHERE clinic_id=$1 AND id=$2",
          [clinicId, credit.id, meeting.id],
        );
        const updated = await client.query<ReplacementCreditRow>(
          `SELECT ${creditColumns} FROM replacement_credits rc JOIN patients p ON p.id=rc.patient_id AND p.clinic_id=rc.clinic_id WHERE rc.clinic_id=$1 AND rc.id=$2`,
          [clinicId, credit.id],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "group.replacement",
          "group_session",
          meeting.id,
          { creditId: credit.id },
        );
        return {
          attendance: await readAttendance(
            client,
            clinicId,
            inserted.rows[0]!.id,
          ),
          credit: mapReplacementCredit(updated.rows[0]!),
        };
      });
    },
    async recordReplacementAttendance(
      clinicId: string,
      actorUserId: string,
      attendanceId: string,
      status: Exclude<GroupAttendance["outcome"], undefined | "scheduled">,
    ) {
      return context.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const result = await client.query<{
          sessionId: string;
          creditId: string;
        }>(
          `SELECT ga.session_id AS "sessionId",rc.id AS "creditId" FROM group_attendance ga JOIN replacement_credits rc ON rc.clinic_id=ga.clinic_id AND rc.patient_id=ga.patient_id AND rc.used_session_id=ga.session_id WHERE ga.clinic_id=$1 AND ga.id=$2 AND ga.status='replacement' AND rc.status='used' FOR UPDATE OF ga,rc`,
          [clinicId, attendanceId],
        );
        const item = result.rows[0];
        if (!item)
          throw new DomainError(
            "REPLACEMENT_NOT_AVAILABLE",
            "Este crédito não está reservado neste encontro.",
            409,
          );
        await movement(client, clinicId, attendanceId, status === "present");
        await client.query(
          "UPDATE group_attendance SET outcome=$3,recorded_by_user_id=$4,recorded_at=now() WHERE clinic_id=$1 AND id=$2",
          [clinicId, attendanceId, status, actorUserId],
        );
        if (status === "cancelled" || status === "excused_absence")
          await client.query(
            "UPDATE replacement_credits SET status='available',used_session_id=NULL,used_at=NULL WHERE clinic_id=$1 AND id=$2",
            [clinicId, item.creditId],
          );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "group.replacement_attendance",
          "group_session",
          item.sessionId,
          { status },
        );
        return readAttendance(client, clinicId, attendanceId);
      });
    },
    async updateGroupSessionProfessional(
      clinicId: string,
      actorUserId: string,
      sessionId: string,
      professionalId: string,
    ) {
      return context.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const meeting = await client.query<{ startsAt: Date; endsAt: Date }>(
          `SELECT starts_at AS "startsAt",ends_at AS "endsAt" FROM group_sessions WHERE clinic_id=$1 AND id=$2 AND status<>'cancelled' FOR UPDATE`,
          [clinicId, sessionId],
        );
        if (!meeting.rows[0])
          throw new DomainError(
            "GROUP_SESSION_NOT_FOUND",
            "Encontro não encontrado.",
            404,
          );
        const professional = await client.query(
          "SELECT id FROM professionals WHERE clinic_id=$1 AND id=$2 AND active FOR UPDATE",
          [clinicId, professionalId],
        );
        if (!professional.rowCount)
          throw new DomainError(
            "PROFESSIONAL_NOT_FOUND",
            "Profissional não encontrado.",
            404,
          );
        const { startsAt, endsAt } = meeting.rows[0];
        const conflicts = await client.query(
          `SELECT 1 FROM appointments WHERE clinic_id=$1 AND professional_id=$2 AND status<>'cancelled' AND starts_at<$4 AND ends_at>$3 UNION ALL SELECT 1 FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id WHERE gs.clinic_id=$1 AND gs.id<>$5 AND coalesce(gs.professional_id,g.professional_id)=$2 AND gs.status<>'cancelled' AND gs.starts_at<$4 AND gs.ends_at>$3 UNION ALL SELECT 1 FROM schedule_blocks WHERE clinic_id=$1 AND professional_id=$2 AND status='active' AND starts_at<$4 AND ends_at>$3`,
          [clinicId, professionalId, startsAt, endsAt, sessionId],
        );
        if (conflicts.rowCount)
          throw new DomainError(
            "APPOINTMENT_CONFLICT",
            "O profissional está ocupado ou bloqueado nesse horário.",
            409,
          );
        await client.query(
          "UPDATE group_sessions SET professional_id=$3,updated_at=now() WHERE clinic_id=$1 AND id=$2",
          [clinicId, sessionId, professionalId],
        );
        const result = await client.query<GroupSessionRow>(
          `SELECT ${groupSessionColumns},(SELECT count(*) FROM group_attendance ga WHERE ga.clinic_id=gs.clinic_id AND ga.session_id=gs.id) AS "attendanceCount" FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id JOIN professionals p ON p.id=coalesce(gs.professional_id,g.professional_id) JOIN rooms r ON r.id=g.room_id WHERE gs.clinic_id=$1 AND gs.id=$2`,
          [clinicId, sessionId],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "group.professional",
          "group_session",
          sessionId,
          { professionalId },
        );
        return mapGroupSession(result.rows[0]!);
      });
    },
  };
}
