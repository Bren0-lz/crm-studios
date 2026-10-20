import {
  type Appointment,
  type AppointmentInput,
  type AppointmentRescheduleEvent,
  type AppointmentRescheduleInput,
  type AppointmentStatus,
  type AppointmentUpdateInput,
  type GroupAttendanceInput,
  type GroupClassInput,
  groupClassName,
  type GroupClassUpdateInput,
  type GroupEnrollmentInput,
  type GroupSession,
  type GroupWorkspace,
  type HolidayInput,
  type LeadAppointmentInput,
  type RecurringAppointmentInput,
  type ReplacementBookingInput,
  type ScheduleBlockInput,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import {
  clampGroupSessionUntil,
  groupSessionHorizon,
} from "../../modules/groups/group-schedule.js";
import { assertAppointmentStarted } from "../../modules/agenda/appointment-start.js";
import { DomainError } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";
import {
  appointmentColumns,
  appointmentJoins,
  type AppointmentRow,
  type GroupAttendanceRow,
  type GroupClassRow,
  type GroupEnrollmentRow,
  groupEnrollmentColumns,
  groupSessionColumns,
  type GroupSessionRow,
  hasDatabaseCode,
  hasGroupSessionConflict,
  holidayColumns,
  type HolidayRow,
  mapAppointment,
  mapGroupAttendance,
  mapGroupClass,
  mapGroupEnrollment,
  mapGroupSession,
  mapHoliday,
  mapReplacementCredit,
  mapScheduleBlock,
  type ReplacementCreditRow,
  type ScheduleBlockRow,
  branchClause,
} from "./helpers.js";

export function createAgendaRepository(
  repositoryContext: PostgresRepositoryContext,
) {
  return {
    async listHolidays(clinicId: string, from?: string, to?: string) {
      const result = await repositoryContext.pool.query<HolidayRow>(
        `SELECT ${holidayColumns} FROM holidays
       WHERE clinic_id = $1
         AND ($2::date IS NULL OR date >= $2::date)
         AND ($3::date IS NULL OR date <= $3::date)
       ORDER BY date`,
        [clinicId, from ?? null, to ?? null],
      );
      return result.rows.map(mapHoliday);
    },

    async createHoliday(clinicId: string, input: HolidayInput) {
      try {
        const result = await repositoryContext.pool.query<HolidayRow>(
          `INSERT INTO holidays (clinic_id, date, name)
         VALUES ($1, $2::date, $3)
         RETURNING ${holidayColumns}`,
          [clinicId, input.date, input.name],
        );
        return mapHoliday(result.rows[0]!);
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "HOLIDAY_DUPLICATE",
            "Já existe um feriado nesta data.",
            409,
          );
        throw error;
      }
    },

    async deleteHoliday(clinicId: string, holidayId: string) {
      const result = await repositoryContext.pool.query(
        "DELETE FROM holidays WHERE clinic_id = $1 AND id = $2",
        [clinicId, holidayId],
      );
      return Boolean(result.rowCount);
    },

    async listSubscriberIdsWithoutGroup(clinicId: string) {
      const result = await repositoryContext.pool.query<{ patientId: string }>(
        `
        SELECT DISTINCT pp.patient_id AS "patientId"
        FROM patient_plans pp
        WHERE pp.clinic_id = $1
          AND pp.status = 'active'
          AND pp.kind <> 'single'
          AND (pp.valid_until IS NULL OR pp.valid_until >= CURRENT_DATE)
          AND NOT EXISTS (
            SELECT 1
            FROM group_enrollments e
            JOIN group_classes g ON g.id = e.group_id AND g.clinic_id = e.clinic_id
            WHERE e.clinic_id = $1
              AND e.patient_id = pp.patient_id
              AND e.status = 'active'
              AND g.active
              AND EXISTS (SELECT 1 FROM patient_plan_services x WHERE x.plan_id=pp.id AND x.service_id=g.service_id)
          )
      `,
        [clinicId],
      );
      return result.rows.map((row) => row.patientId);
    },

    async listAppointments(clinicId: string, from: string, to: string) {
      const result = await repositoryContext.pool.query<AppointmentRow>(
        `
        SELECT ${appointmentColumns}
        FROM appointments a
        ${appointmentJoins}
        WHERE a.clinic_id = $1 AND a.starts_at < $3 AND a.ends_at > $2
          AND ($4::uuid[] IS NULL OR a.branch_id = ANY($4::uuid[]))
        ORDER BY a.starts_at
      `,
        [clinicId, from, to, repositoryContext.branchReadIds()],
      );
      return result.rows.map(mapAppointment);
    },

    async listPendingFinalizationAppointments(clinicId: string, now: string) {
      const result = await repositoryContext.pool.query<AppointmentRow>(
        `
        SELECT ${appointmentColumns}
        FROM appointments a
        ${appointmentJoins}
        WHERE a.clinic_id = $1
          AND a.status IN ('scheduled', 'confirmed')
          AND a.ends_at < $2
          AND ($3::uuid[] IS NULL OR a.branch_id = ANY($3::uuid[]))
        ORDER BY a.starts_at
      `,
        [clinicId, now, repositoryContext.branchReadIds()],
      );
      return result.rows.map(mapAppointment);
    },

    async createAppointment(clinicId: string, input: AppointmentInput) {
      const related = await repositoryContext.pool.query<{
        durationMinutes: number;
      }>(
        `
        SELECT s.duration_minutes AS "durationMinutes"
        FROM patients p, professionals pr, rooms r, services s
        WHERE p.id = $2 AND p.clinic_id = $1 AND p.status = 'active'
          AND pr.id = $3 AND pr.clinic_id = $1 AND pr.active = true
          AND r.id = $4 AND r.clinic_id = $1 AND r.active = true
          AND s.id = $5 AND s.clinic_id = $1 AND s.active = true
      `,
        [
          clinicId,
          input.patientId,
          input.professionalId,
          input.roomId,
          input.serviceId,
        ],
      );
      if (!related.rows[0]) {
        throw new DomainError(
          "RELATED_RECORD_NOT_FOUND",
          "Cliente, profissional, sala ou serviço não encontrado.",
          404,
        );
      }
      return repositoryContext.insertAppointment(
        clinicId,
        input,
        related.rows[0].durationMinutes,
        { patientId: input.patientId, leadId: null },
      );
    },

    async createLeadAppointment(
      clinicId: string,
      leadId: string,
      input: LeadAppointmentInput,
    ) {
      const lead = await repositoryContext.pool.query<{
        convertedPatientId: string | null;
      }>(
        `SELECT converted_patient_id AS "convertedPatientId"
       FROM leads WHERE clinic_id = $1 AND id = $2`,
        [clinicId, leadId],
      );
      if (!lead.rows[0]) return null;
      if (lead.rows[0].convertedPatientId)
        throw new DomainError(
          "LEAD_ALREADY_CONVERTED",
          "Este lead já foi convertido em cliente. Agende pelo cliente.",
          409,
        );
      const related = await repositoryContext.pool.query<{
        durationMinutes: number;
      }>(
        `
        SELECT s.duration_minutes AS "durationMinutes"
        FROM professionals pr, rooms r, services s
        WHERE pr.id = $2 AND pr.clinic_id = $1 AND pr.active = true
          AND r.id = $3 AND r.clinic_id = $1 AND r.active = true
          AND s.id = $4 AND s.clinic_id = $1 AND s.active = true
      `,
        [clinicId, input.professionalId, input.roomId, input.serviceId],
      );
      if (!related.rows[0])
        throw new DomainError(
          "RELATED_RECORD_NOT_FOUND",
          "Profissional, sala ou serviço não encontrado.",
          404,
        );
      return repositoryContext.insertAppointment(
        clinicId,
        input,
        related.rows[0].durationMinutes,
        { patientId: null, leadId },
      );
    },

    async rescheduleAppointment(
      clinicId: string,
      actorUserId: string,
      appointmentId: string,
      input: AppointmentRescheduleInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const current = await client.query<{
          status: AppointmentStatus;
          startsAt: Date;
          endsAt: Date;
          professionalId: string;
          roomId: string;
          serviceId: string;
        }>(
          `SELECT status, starts_at AS "startsAt", ends_at AS "endsAt",
                professional_id AS "professionalId", room_id AS "roomId",
                service_id AS "serviceId"
         FROM appointments WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
          [clinicId, appointmentId],
        );
        const previous = current.rows[0];
        if (!previous) {
          await client.query("COMMIT");
          return null;
        }
        if (!["scheduled", "confirmed"].includes(previous.status))
          throw new DomainError(
            "APPOINTMENT_RESCHEDULE_FORBIDDEN",
            "Somente atendimentos agendados ou confirmados podem ser reagendados.",
            409,
          );
        const related = await client.query<{ durationMinutes: number }>(
          `SELECT s.duration_minutes AS "durationMinutes"
         FROM services s, professionals p, rooms r
         WHERE s.clinic_id = $1 AND s.id = $2
           AND p.clinic_id = $1 AND p.id = $3 AND p.active
           AND r.clinic_id = $1 AND r.id = $4 AND r.active`,
          [clinicId, previous.serviceId, input.professionalId, input.roomId],
        );
        if (!related.rows[0])
          throw new DomainError(
            "RELATED_RECORD_NOT_FOUND",
            "Profissional, sala ou serviço não encontrado.",
            404,
          );
        await repositoryContext.resourceBranch(client, clinicId, {
          professionalId: input.professionalId,
          roomId: input.roomId,
          appointmentId,
        });
        const startsAt = new Date(input.startsAt);
        const endsAt = new Date(
          startsAt.getTime() + related.rows[0].durationMinutes * 60_000,
        );
        if (
          startsAt.getTime() === previous.startsAt.getTime() &&
          input.professionalId === previous.professionalId &&
          input.roomId === previous.roomId
        ) {
          const unchanged = await repositoryContext.findAppointment(
            clinicId,
            appointmentId,
            client,
          );
          await client.query("COMMIT");
          return unchanged;
        }
        if (
          await hasGroupSessionConflict(
            client,
            clinicId,
            input.professionalId,
            input.roomId,
            startsAt,
            endsAt,
          )
        )
          throw new DomainError(
            "APPOINTMENT_CONFLICT",
            "O profissional ou a sala está ocupado por uma turma nesse horário.",
            409,
          );
        await client.query(
          `UPDATE appointments
         SET professional_id = $3, room_id = $4, starts_at = $5,
             ends_at = $6, updated_at = now()
         WHERE clinic_id = $1 AND id = $2`,
          [
            clinicId,
            appointmentId,
            input.professionalId,
            input.roomId,
            startsAt,
            endsAt,
          ],
        );
        await client.query(
          `INSERT INTO appointment_reschedules (
           clinic_id, appointment_id, actor_user_id,
           previous_starts_at, previous_ends_at,
           previous_professional_id, previous_room_id,
           starts_at, ends_at, professional_id, room_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            clinicId,
            appointmentId,
            actorUserId,
            previous.startsAt,
            previous.endsAt,
            previous.professionalId,
            previous.roomId,
            startsAt,
            endsAt,
            input.professionalId,
            input.roomId,
          ],
        );
        const appointment = await repositoryContext.findAppointment(
          clinicId,
          appointmentId,
          client,
        );
        await client.query("COMMIT");
        return appointment;
      } catch (error) {
        await client.query("ROLLBACK");
        if (hasDatabaseCode(error, "23P01") || hasDatabaseCode(error, "40P01"))
          throw new DomainError(
            "APPOINTMENT_CONFLICT",
            "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
            409,
          );
        throw error;
      } finally {
        client.release();
      }
    },

    async findAppointmentServiceId(clinicId: string, appointmentId: string) {
      const result = await repositoryContext.pool.query<{ serviceId: string }>(
        `SELECT service_id AS "serviceId" FROM appointments
         WHERE clinic_id = $1 AND id = $2`,
        [clinicId, appointmentId],
      );
      return result.rows[0]?.serviceId ?? null;
    },

    async findAppointment(clinicId: string, appointmentId: string) {
      return repositoryContext.findAppointment(clinicId, appointmentId);
    },

    async updateAppointment(
      clinicId: string,
      actorUserId: string,
      appointmentId: string,
      input: AppointmentUpdateInput,
    ) {
      try {
        return await repositoryContext.inTransaction(async (client) => {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [clinicId],
          );
          const current = await client.query<{
            status: AppointmentStatus;
            startsAt: Date;
            professionalId: string;
            roomId: string;
            serviceId: string;
            notes: string | null;
          }>(
            `SELECT status, starts_at AS "startsAt",
                    professional_id AS "professionalId", room_id AS "roomId",
                    service_id AS "serviceId", notes
             FROM appointments WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
            [clinicId, appointmentId],
          );
          const previous = current.rows[0];
          if (!previous) return null;
          if (!["scheduled", "confirmed"].includes(previous.status))
            throw new DomainError(
              "APPOINTMENT_UPDATE_FORBIDDEN",
              "Somente atendimentos agendados ou confirmados podem ser editados.",
              409,
            );
          const related = await client.query<{ durationMinutes: number }>(
            `SELECT s.duration_minutes AS "durationMinutes"
             FROM services s, rooms r
             WHERE s.clinic_id = $1 AND s.id = $2 AND (s.active OR s.id = $4)
               AND r.clinic_id = $1 AND r.id = $3 AND r.active`,
            [clinicId, input.serviceId, input.roomId, previous.serviceId],
          );
          if (!related.rows[0])
            throw new DomainError(
              "RELATED_RECORD_NOT_FOUND",
              "Sala ou serviço não encontrado.",
              404,
            );
          const serviceChanged = input.serviceId !== previous.serviceId;
          if (serviceChanged) {
            // Crédito da comanda/plano de origem é do serviço original.
            const linked = await client.query(
              `SELECT 1 FROM patient_tab_services
               WHERE clinic_id = $1 AND appointment_id = $2
               UNION ALL
               SELECT 1 FROM patient_plans
               WHERE clinic_id = $1 AND source_appointment_id = $2
               LIMIT 1`,
              [clinicId, appointmentId],
            );
            if (linked.rowCount)
              throw new DomainError(
                "APPOINTMENT_SERVICE_LOCKED",
                "Este atendimento está vinculado a uma comanda ou plano: o serviço não pode ser alterado.",
                409,
              );
          }
          const notes = input.notes ?? "";
          if (
            !serviceChanged &&
            input.roomId === previous.roomId &&
            (previous.notes ?? "") === notes
          )
            return repositoryContext.findAppointment(
              clinicId,
              appointmentId,
              client,
            );
          const startsAt = new Date(previous.startsAt);
          const endsAt = new Date(
            startsAt.getTime() + related.rows[0].durationMinutes * 60_000,
          );
          if (
            await hasGroupSessionConflict(
              client,
              clinicId,
              previous.professionalId,
              input.roomId,
              startsAt,
              endsAt,
            )
          )
            throw new DomainError(
              "APPOINTMENT_CONFLICT",
              "O profissional ou a sala está ocupado por uma turma nesse horário.",
              409,
            );
          const names = await client.query<{
            previousServiceName: string;
            previousRoomName: string;
            serviceName: string;
            roomName: string;
          }>(
            `SELECT ps.name AS "previousServiceName", pr.name AS "previousRoomName",
                    s.name AS "serviceName", r.name AS "roomName"
             FROM services ps, rooms pr, services s, rooms r
             WHERE ps.clinic_id = $1 AND ps.id = $2 AND pr.clinic_id = $1 AND pr.id = $3
               AND s.clinic_id = $1 AND s.id = $4 AND r.clinic_id = $1 AND r.id = $5`,
            [
              clinicId,
              previous.serviceId,
              previous.roomId,
              input.serviceId,
              input.roomId,
            ],
          );
          await client.query(
            `UPDATE appointments
             SET service_id = $3, room_id = $4, notes = $5, ends_at = $6,
                 updated_at = now()
             WHERE clinic_id = $1 AND id = $2`,
            [
              clinicId,
              appointmentId,
              input.serviceId,
              input.roomId,
              notes || null,
              endsAt,
            ],
          );
          const name = names.rows[0];
          await repositoryContext.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "appointment.updated",
            "appointment",
            appointmentId,
            {
              previous: {
                serviceId: previous.serviceId,
                serviceName: name?.previousServiceName,
                roomId: previous.roomId,
                roomName: name?.previousRoomName,
                notes: previous.notes ?? "",
              },
              current: {
                serviceId: input.serviceId,
                serviceName: name?.serviceName,
                roomId: input.roomId,
                roomName: name?.roomName,
                notes,
              },
            },
          );
          return repositoryContext.findAppointment(
            clinicId,
            appointmentId,
            client,
          );
        });
      } catch (error) {
        if (hasDatabaseCode(error, "23P01") || hasDatabaseCode(error, "40P01"))
          throw new DomainError(
            "APPOINTMENT_CONFLICT",
            "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
            409,
          );
        throw error;
      }
    },

    async listAppointmentReschedules(clinicId: string, appointmentId: string) {
      const appointment = await repositoryContext.pool.query(
        "SELECT 1 FROM appointments WHERE clinic_id = $1 AND id = $2",
        [clinicId, appointmentId],
      );
      if (!appointment.rowCount) return null;
      const result = await repositoryContext.pool.query<{
        id: string;
        appointmentId: string;
        previousStartsAt: Date;
        previousEndsAt: Date;
        previousProfessionalId: string;
        previousProfessionalName: string;
        previousRoomId: string;
        previousRoomName: string;
        startsAt: Date;
        endsAt: Date;
        professionalId: string;
        professionalName: string;
        roomId: string;
        roomName: string;
        actorName: string;
        createdAt: Date;
      }>(
        `SELECT ar.id, ar.appointment_id AS "appointmentId",
              ar.previous_starts_at AS "previousStartsAt",
              ar.previous_ends_at AS "previousEndsAt",
              ar.previous_professional_id AS "previousProfessionalId",
              previous_pr.full_name AS "previousProfessionalName",
              ar.previous_room_id AS "previousRoomId",
              previous_r.name AS "previousRoomName",
              ar.starts_at AS "startsAt", ar.ends_at AS "endsAt",
              ar.professional_id AS "professionalId",
              current_pr.full_name AS "professionalName",
              ar.room_id AS "roomId", current_r.name AS "roomName",
              u.full_name AS "actorName", ar.created_at AS "createdAt"
       FROM appointment_reschedules ar JOIN users u ON u.id = ar.actor_user_id
       JOIN professionals previous_pr ON previous_pr.id = ar.previous_professional_id
       JOIN rooms previous_r ON previous_r.id = ar.previous_room_id
       JOIN professionals current_pr ON current_pr.id = ar.professional_id
       JOIN rooms current_r ON current_r.id = ar.room_id
       WHERE ar.clinic_id = $1 AND ar.appointment_id = $2
       ORDER BY ar.created_at DESC, ar.id DESC`,
        [clinicId, appointmentId],
      );
      return result.rows.map((row): AppointmentRescheduleEvent => ({
        ...row,
        previousStartsAt: row.previousStartsAt.toISOString(),
        previousEndsAt: row.previousEndsAt.toISOString(),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      }));
    },

    async createRecurringAppointments(
      clinicId: string,
      input: RecurringAppointmentInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const related = await client.query<{ durationMinutes: number }>(
          `SELECT s.duration_minutes AS "durationMinutes"
         FROM patients p, professionals pr, rooms r, services s
         WHERE p.id = $2 AND p.clinic_id = $1 AND p.status = 'active'
           AND pr.id = $3 AND pr.clinic_id = $1 AND pr.active = true
           AND r.id = $4 AND r.clinic_id = $1 AND r.active = true
           AND s.id = $5 AND s.clinic_id = $1 AND s.active = true`,
          [
            clinicId,
            input.patientId,
            input.professionalId,
            input.roomId,
            input.serviceId,
          ],
        );
        if (!related.rows[0])
          throw new DomainError(
            "RELATED_RECORD_NOT_FOUND",
            "Cliente, profissional, sala ou serviço não encontrado.",
            404,
          );
        const branchId = await repositoryContext.resourceBranch(
          client,
          clinicId,
          { professionalId: input.professionalId, roomId: input.roomId },
        );
        const seriesId = randomUUID();
        const ids: string[] = [];
        for (let index = 0; index < input.occurrences; index += 1) {
          const startsAt = new Date(input.startsAt);
          startsAt.setUTCDate(
            startsAt.getUTCDate() + index * input.intervalWeeks * 7,
          );
          const endsAt = new Date(
            startsAt.getTime() + related.rows[0].durationMinutes * 60_000,
          );
          if (
            await hasGroupSessionConflict(
              client,
              clinicId,
              input.professionalId,
              input.roomId,
              startsAt,
              endsAt,
            )
          )
            throw new DomainError(
              "APPOINTMENT_CONFLICT",
              `A ocorrência ${index + 1} conflita com uma turma.`,
              409,
            );
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO appointments
             (clinic_id, patient_id, professional_id, room_id, service_id,
              starts_at, ends_at, notes, series_id, visit_type, branch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [
              clinicId,
              input.patientId,
              input.professionalId,
              input.roomId,
              input.serviceId,
              startsAt,
              endsAt,
              input.notes || null,
              seriesId,
              input.visitType,
              branchId,
            ],
          );
          ids.push(inserted.rows[0]!.id);
        }
        const appointments = await Promise.all(
          ids.map((id) =>
            repositoryContext.findAppointment(clinicId, id, client),
          ),
        );
        await client.query("COMMIT");
        return appointments.filter(
          (item): item is Appointment => item !== null,
        );
      } catch (error) {
        await client.query("ROLLBACK");
        if (hasDatabaseCode(error, "23P01"))
          throw new DomainError(
            "APPOINTMENT_CONFLICT",
            "Uma das ocorrências conflita com a agenda. Nenhum atendimento foi criado.",
            409,
          );
        throw error;
      } finally {
        client.release();
      }
    },

    async listScheduleBlocks(clinicId: string, from: string, to: string) {
      const result = await repositoryContext.pool.query<ScheduleBlockRow>(
        `SELECT b.id, b.clinic_id AS "clinicId",
              b.professional_id AS "professionalId", b.room_id AS "roomId",
              pr.full_name AS "professionalName", r.name AS "roomName",
              b.starts_at AS "startsAt", b.ends_at AS "endsAt", b.reason,
              b.status, b.created_at AS "createdAt", b.updated_at AS "updatedAt"
       FROM schedule_blocks b
       LEFT JOIN professionals pr ON pr.id = b.professional_id
       LEFT JOIN rooms r ON r.id = b.room_id
       WHERE b.clinic_id = $1 AND b.status = 'active'
         AND b.starts_at < $3 AND b.ends_at > $2 AND ${branchClause("b.branch_id", 4)}
       ORDER BY b.starts_at`,
        [clinicId, from, to, repositoryContext.branchReadIds()],
      );
      return result.rows.map(mapScheduleBlock);
    },

    async createScheduleBlock(clinicId: string, input: ScheduleBlockInput) {
      const related = await repositoryContext.pool.query<{
        professionalName: string | null;
        roomName: string | null;
      }>(
        `SELECT pr.full_name AS "professionalName", r.name AS "roomName"
       FROM clinics c
       LEFT JOIN professionals pr
         ON pr.clinic_id = c.id AND pr.id = $2 AND pr.active
       LEFT JOIN rooms r ON r.clinic_id = c.id AND r.id = $3 AND r.active
       WHERE c.id = $1`,
        [clinicId, input.professionalId || null, input.roomId || null],
      );
      if (
        !related.rows[0] ||
        (input.professionalId && !related.rows[0].professionalName) ||
        (input.roomId && !related.rows[0].roomName)
      )
        throw new DomainError(
          "RELATED_RECORD_NOT_FOUND",
          "Profissional ou sala não encontrado.",
          404,
        );
      if (
        await hasGroupSessionConflict(
          repositoryContext.pool,
          clinicId,
          input.professionalId,
          input.roomId,
          new Date(input.startsAt),
          new Date(input.endsAt),
          false,
        )
      )
        throw new DomainError(
          "SCHEDULE_BLOCK_CONFLICT",
          "O bloqueio conflita com uma turma existente.",
          409,
        );
      const branchId = await repositoryContext.resourceBranch(
        repositoryContext.pool,
        clinicId,
        { professionalId: input.professionalId, roomId: input.roomId },
      );
      try {
        const inserted = await repositoryContext.pool.query<{ id: string }>(
          `INSERT INTO schedule_blocks
           (clinic_id, professional_id, room_id, starts_at, ends_at, reason, branch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [
            clinicId,
            input.professionalId || null,
            input.roomId || null,
            input.startsAt,
            input.endsAt,
            input.reason,
            branchId,
          ],
        );
        return (await repositoryContext.findScheduleBlock(
          clinicId,
          inserted.rows[0]!.id,
        ))!;
      } catch (error) {
        if (hasDatabaseCode(error, "23P01"))
          throw new DomainError(
            "SCHEDULE_BLOCK_CONFLICT",
            "O bloqueio conflita com um atendimento ou bloqueio existente.",
            409,
          );
        throw error;
      }
    },

    async cancelScheduleBlock(clinicId: string, blockId: string) {
      const result = await repositoryContext.pool.query(
        `UPDATE schedule_blocks SET status = 'cancelled', updated_at = now()
       WHERE clinic_id = $1 AND id = $2 RETURNING id`,
        [clinicId, blockId],
      );
      return result.rows[0]
        ? repositoryContext.findScheduleBlock(clinicId, blockId)
        : null;
    },

    async getGroupWorkspace(
      clinicId: string,
      from: string,
      to: string,
    ): Promise<GroupWorkspace> {
      await repositoryContext.ensureGroupSessionsUntil(
        clinicId,
        groupSessionHorizon(),
      );
      const branchIds = repositoryContext.branchReadIds();
      const [groups, enrollments, sessions, attendance, credits] =
        await Promise.all([
          repositoryContext.pool.query<GroupClassRow>(
            `SELECT g.id,g.clinic_id AS "clinicId",g.name,g.sequence,g.service_id AS "serviceId",g.professional_id AS "professionalId",g.room_id AS "roomId",g.capacity,g.weekly_slots AS "weeklySlots",s.name AS "serviceName",p.full_name AS "professionalName",r.name AS "roomName",g.active,g.created_at AS "createdAt",count(e.id) FILTER (WHERE e.status='active') AS "activeEnrollments",count(e.id) FILTER (WHERE e.status='waitlisted') AS "waitlistCount" FROM group_classes g JOIN services s ON s.id=g.service_id JOIN professionals p ON p.id=g.professional_id JOIN rooms r ON r.id=g.room_id LEFT JOIN group_enrollments e ON e.group_id=g.id WHERE g.clinic_id=$1 AND ${branchClause("g.branch_id", 2)} GROUP BY g.id,s.name,p.full_name,r.name ORDER BY g.name`,
            [clinicId, branchIds],
          ),
          repositoryContext.pool.query<GroupEnrollmentRow>(
            `SELECT ${groupEnrollmentColumns} FROM group_enrollments e JOIN patients p ON p.id=e.patient_id JOIN group_classes g ON g.id=e.group_id WHERE e.clinic_id=$1 AND ${branchClause("g.branch_id", 2)} ORDER BY e.enrolled_at`,
            [clinicId, branchIds],
          ),
          repositoryContext.pool.query<GroupSessionRow>(
            `SELECT ${groupSessionColumns},count(ga.id) AS "attendanceCount" FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id JOIN professionals p ON p.id=coalesce(gs.professional_id,g.professional_id) JOIN rooms r ON r.id=g.room_id LEFT JOIN group_attendance ga ON ga.session_id=gs.id WHERE gs.clinic_id=$1 AND gs.starts_at<$3 AND gs.ends_at>$2 AND ${branchClause("g.branch_id", 4)} GROUP BY gs.id,g.id,p.full_name,r.name ORDER BY gs.starts_at`,
            [clinicId, from, to, branchIds],
          ),
          repositoryContext.pool.query<GroupAttendanceRow>(
            `SELECT ga.id,ga.clinic_id AS "clinicId",ga.session_id AS "sessionId",ga.patient_id AS "patientId",p.full_name AS "patientName",ga.status,ga.notes,ga.recorded_at AS "recordedAt",ga.accounting_enabled AS "accountingEnabled",ga.outcome,ga.replacement_credit_id AS "replacementCreditId" FROM group_attendance ga JOIN patients p ON p.id=ga.patient_id JOIN group_sessions gs ON gs.id=ga.session_id JOIN group_classes g ON g.id=gs.group_id WHERE ga.clinic_id=$1 AND gs.starts_at<$3 AND gs.ends_at>$2 AND ${branchClause("g.branch_id", 4)} ORDER BY ga.recorded_at`,
            [clinicId, from, to, branchIds],
          ),
          repositoryContext.pool.query<
            ReplacementCreditRow & { sourceGroupId: string }
          >(
            `SELECT rc.id,rc.clinic_id AS "clinicId",rc.patient_id AS "patientId",p.full_name AS "patientName",rc.source_session_id AS "sourceSessionId",gs.group_id AS "sourceGroupId",rc.status,rc.used_session_id AS "usedSessionId",rc.created_at AS "createdAt",rc.used_at AS "usedAt" FROM replacement_credits rc JOIN patients p ON p.id=rc.patient_id JOIN group_sessions gs ON gs.id=rc.source_session_id AND gs.clinic_id=rc.clinic_id JOIN group_classes g ON g.id=gs.group_id WHERE rc.clinic_id=$1 AND ${branchClause("g.branch_id", 2)} ORDER BY rc.created_at DESC`,
            [clinicId, branchIds],
          ),
        ]);
      return {
        groups: groups.rows.map(mapGroupClass),
        enrollments: enrollments.rows.map(mapGroupEnrollment),
        sessions: sessions.rows.map(mapGroupSession),
        attendance: attendance.rows.map(mapGroupAttendance),
        replacementCredits: credits.rows.map((row) => ({
          ...mapReplacementCredit(row),
          sourceGroupId: row.sourceGroupId,
        })),
      };
    },

    async createGroupClass(clinicId: string, input: GroupClassInput) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const related = await client.query<{
          serviceName: string;
          professionalName: string;
          roomName: string;
          roomCapacity: number;
        }>(
          `SELECT s.name AS "serviceName",p.full_name AS "professionalName",r.name AS "roomName",r.capacity AS "roomCapacity" FROM services s,professionals p,rooms r WHERE s.id=$2 AND s.clinic_id=$1 AND s.active AND p.id=$3 AND p.clinic_id=$1 AND p.active AND r.id=$4 AND r.clinic_id=$1 AND r.active FOR UPDATE OF s`,
          [clinicId, input.serviceId, input.professionalId, input.roomId],
        );
        const names = related.rows[0];
        if (!names)
          throw new DomainError(
            "GROUP_RELATED_RECORD_NOT_FOUND",
            "Serviço, profissional ou sala não encontrado.",
            404,
          );
        if (input.capacity > names.roomCapacity)
          throw new DomainError(
            "GROUP_EXCEEDS_ROOM_CAPACITY",
            "A capacidade da turma excede a capacidade da sala.",
            409,
          );
        await repositoryContext.assertGroupScheduleAvailable(
          client,
          clinicId,
          input,
        );
        const branchId = await repositoryContext.resourceBranch(
          client,
          clinicId,
          { professionalId: input.professionalId, roomId: input.roomId },
        );
        // O lock no serviço serializa a escolha da próxima letra entre criações simultâneas.
        const next = await client.query<{ sequence: number }>(
          `SELECT coalesce(max(sequence),0)+1 AS sequence FROM group_classes WHERE clinic_id=$1 AND service_id=$2`,
          [clinicId, input.serviceId],
        );
        const sequence = next.rows[0]!.sequence;
        const name = groupClassName(names.serviceName, sequence);
        const result = await client.query<{
          id: string;
          branchId: string;
          createdAt: Date;
        }>(
          `INSERT INTO group_classes(clinic_id,name,sequence,service_id,professional_id,room_id,capacity,weekly_slots,branch_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING id,branch_id AS "branchId",created_at AS "createdAt"`,
          [
            clinicId,
            name,
            sequence,
            input.serviceId,
            input.professionalId,
            input.roomId,
            input.capacity,
            JSON.stringify(input.weeklySlots),
            branchId,
          ],
        );
        await repositoryContext.ensureGroupSessions(
          client,
          clinicId,
          groupSessionHorizon(),
          {
            groupId: result.rows[0]!.id,
          },
        );
        await client.query("COMMIT");
        return {
          ...input,
          branchId: result.rows[0]!.branchId,
          id: result.rows[0]!.id,
          clinicId,
          name,
          sequence,
          serviceName: names.serviceName,
          professionalName: names.professionalName,
          roomName: names.roomName,
          activeEnrollments: 0,
          waitlistCount: 0,
          active: true,
          createdAt: result.rows[0]!.createdAt.toISOString(),
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async updateGroupClass(
      clinicId: string,
      groupId: string,
      input: GroupClassUpdateInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query<{
          roomCapacity: number;
          activeEnrollments: string;
          professionalId: string;
          roomId: string;
        }>(
          `SELECT r.capacity AS "roomCapacity",(SELECT count(*) FROM group_enrollments e WHERE e.group_id=g.id AND e.status='active') AS "activeEnrollments",g.professional_id AS "professionalId",g.room_id AS "roomId" FROM group_classes g JOIN rooms r ON r.id=g.room_id WHERE g.clinic_id=$1 AND g.id=$2 FOR UPDATE OF g`,
          [clinicId, groupId],
        );
        const current = result.rows[0];
        if (!current) {
          await client.query("ROLLBACK");
          return null;
        }
        if (input.capacity > current.roomCapacity)
          throw new DomainError(
            "GROUP_EXCEEDS_ROOM_CAPACITY",
            "A capacidade da turma excede a capacidade da sala.",
            409,
          );
        const activeCount = Number(current.activeEnrollments);
        if (input.capacity < activeCount)
          throw new DomainError(
            "GROUP_BELOW_ENROLLMENTS",
            "A capacidade não pode ser menor que o número de matrículas ativas.",
            409,
          );
        await repositoryContext.assertGroupScheduleAvailable(client, clinicId, {
          id: groupId,
          professionalId: current.professionalId,
          roomId: current.roomId,
          weeklySlots: input.weeklySlots,
        });
        await client.query(
          `UPDATE group_classes SET capacity=$3,weekly_slots=$4::jsonb,sessions_generated_until=NULL,updated_at=now() WHERE clinic_id=$1 AND id=$2`,
          [
            clinicId,
            groupId,
            input.capacity,
            JSON.stringify(input.weeklySlots),
          ],
        );
        // Refaz a agenda futura: encontros sem presença nem reposição saem e são gerados de novo
        // com os horários atuais; os que já têm registros ficam como estão.
        await client.query(
          `DELETE FROM group_sessions gs WHERE gs.clinic_id=$1 AND gs.group_id=$2 AND gs.starts_at>now() AND gs.status='scheduled' AND NOT EXISTS (SELECT 1 FROM group_attendance ga WHERE ga.session_id=gs.id) AND NOT EXISTS (SELECT 1 FROM replacement_credits rc WHERE rc.source_session_id=gs.id OR rc.used_session_id=gs.id)`,
          [clinicId, groupId],
        );
        await repositoryContext.ensureGroupSessions(
          client,
          clinicId,
          groupSessionHorizon(),
          { groupId },
        );
        if (input.capacity > activeCount) {
          await client.query(
            `WITH waiting AS (SELECT id FROM group_enrollments WHERE clinic_id=$1 AND group_id=$2 AND status='waitlisted' ORDER BY queue_position,enrolled_at LIMIT $3) UPDATE group_enrollments e SET status='active',queue_position=NULL,updated_at=now(),enrolled_at=GREATEST(e.enrolled_at,now()) FROM waiting WHERE e.id=waiting.id`,
            [clinicId, groupId, input.capacity - activeCount],
          );
        }
        await client.query(
          `WITH ordered AS (SELECT id,row_number() OVER (ORDER BY queue_position,enrolled_at) AS position FROM group_enrollments WHERE clinic_id=$1 AND group_id=$2 AND status='waitlisted') UPDATE group_enrollments e SET queue_position=ordered.position FROM ordered WHERE e.id=ordered.id`,
          [clinicId, groupId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      const updated = await repositoryContext.pool.query<GroupClassRow>(
        `SELECT g.id,g.clinic_id AS "clinicId",g.name,g.sequence,g.service_id AS "serviceId",g.professional_id AS "professionalId",g.room_id AS "roomId",g.capacity,g.weekly_slots AS "weeklySlots",s.name AS "serviceName",p.full_name AS "professionalName",r.name AS "roomName",g.active,g.created_at AS "createdAt",count(e.id) FILTER (WHERE e.status='active') AS "activeEnrollments",count(e.id) FILTER (WHERE e.status='waitlisted') AS "waitlistCount" FROM group_classes g JOIN services s ON s.id=g.service_id JOIN professionals p ON p.id=g.professional_id JOIN rooms r ON r.id=g.room_id LEFT JOIN group_enrollments e ON e.group_id=g.id WHERE g.clinic_id=$1 AND g.id=$2 GROUP BY g.id,s.name,p.full_name,r.name`,
        [clinicId, groupId],
      );
      return updated.rows[0] ? mapGroupClass(updated.rows[0]) : null;
    },

    async createGroupEnrollment(clinicId: string, input: GroupEnrollmentInput) {
      return repositoryContext.inTransaction((client) =>
        repositoryContext.insertGroupEnrollment(client, clinicId, input),
      );
    },

    async cancelGroupEnrollment(clinicId: string, enrollmentId: string) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<GroupEnrollmentRow>(
          `SELECT ${groupEnrollmentColumns} FROM group_enrollments e JOIN patients p ON p.id=e.patient_id WHERE e.id=$2 AND e.clinic_id=$1 FOR UPDATE OF e`,
          [clinicId, enrollmentId],
        );
        const row = current.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return null;
        }
        await client.query(
          `UPDATE group_enrollments SET status='cancelled',queue_position=NULL,updated_at=now(),ended_at=CASE WHEN status='active' THEN now() ELSE ended_at END WHERE id=$1`,
          [enrollmentId],
        );
        if (row.status === "active")
          await client.query(
            `UPDATE group_enrollments SET status='active',queue_position=NULL,updated_at=now(),enrolled_at=GREATEST(enrolled_at,now()) WHERE id=(SELECT id FROM group_enrollments WHERE group_id=$1 AND status='waitlisted' ORDER BY queue_position,enrolled_at FOR UPDATE SKIP LOCKED LIMIT 1)`,
            [row.groupId],
          );
        await client.query(
          `WITH ranked AS(SELECT id,row_number() OVER(ORDER BY queue_position,enrolled_at) AS position FROM group_enrollments WHERE group_id=$1 AND status='waitlisted') UPDATE group_enrollments e SET queue_position=ranked.position FROM ranked WHERE e.id=ranked.id`,
          [row.groupId],
        );
        const updated = await client.query<GroupEnrollmentRow>(
          `SELECT ${groupEnrollmentColumns} FROM group_enrollments e JOIN patients p ON p.id=e.patient_id WHERE e.id=$1`,
          [enrollmentId],
        );
        await client.query("COMMIT");
        return mapGroupEnrollment(updated.rows[0]!);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listGroupSessions(clinicId: string, from: string, to: string) {
      await repositoryContext.ensureGroupSessionsUntil(
        clinicId,
        clampGroupSessionUntil(new Date(to)),
      );
      const result = await repositoryContext.pool.query<GroupSessionRow>(
        `SELECT ${groupSessionColumns},(SELECT count(*) FROM group_attendance ga WHERE ga.session_id=gs.id) AS "attendanceCount" FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id JOIN professionals p ON p.id=coalesce(gs.professional_id,g.professional_id) JOIN rooms r ON r.id=g.room_id WHERE gs.clinic_id=$1 AND gs.status<>'cancelled' AND gs.starts_at<$3 AND gs.ends_at>$2 AND ${branchClause("g.branch_id", 4)} ORDER BY gs.starts_at`,
        [clinicId, from, to, repositoryContext.branchReadIds()],
      );
      return result.rows.map(mapGroupSession);
    },

    async recordGroupAttendance(
      clinicId: string,
      actorUserId: string,
      sessionId: string,
      patientId: string,
      input: GroupAttendanceInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const allowed = await client.query<{ patientName: string }>(
          `SELECT p.full_name AS "patientName" FROM group_sessions gs JOIN group_enrollments e ON e.group_id=gs.group_id AND e.patient_id=$3 JOIN patients p ON p.id=e.patient_id WHERE gs.id=$2 AND gs.clinic_id=$1 AND gs.status<>'cancelled' AND e.status='active' FOR UPDATE OF gs`,
          [clinicId, sessionId, patientId],
        );
        if (!allowed.rows[0])
          throw new DomainError(
            "GROUP_ATTENDANCE_NOT_ALLOWED",
            "Sessão ou matrícula ativa não encontrada.",
            404,
          );
        const creditResult = await client.query<ReplacementCreditRow>(
          `SELECT rc.id,rc.clinic_id AS "clinicId",rc.patient_id AS "patientId",p.full_name AS "patientName",rc.source_session_id AS "sourceSessionId",rc.status,rc.used_session_id AS "usedSessionId",rc.created_at AS "createdAt",rc.used_at AS "usedAt" FROM replacement_credits rc JOIN patients p ON p.id=rc.patient_id WHERE rc.source_session_id=$1 AND rc.patient_id=$2 FOR UPDATE OF rc`,
          [sessionId, patientId],
        );
        const credit = creditResult.rows[0];
        if (credit?.status === "used" && input.status !== "excused_absence")
          throw new DomainError(
            "REPLACEMENT_ALREADY_USED",
            "A reposição desta falta já foi utilizada.",
            409,
          );
        const attendance = await client.query<GroupAttendanceRow>(
          `INSERT INTO group_attendance(clinic_id,session_id,patient_id,status,notes,recorded_by_user_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(session_id,patient_id) DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes,recorded_by_user_id=EXCLUDED.recorded_by_user_id,recorded_at=now() RETURNING id,clinic_id AS "clinicId",session_id AS "sessionId",patient_id AS "patientId",$7::text AS "patientName",status,notes,recorded_at AS "recordedAt"`,
          [
            clinicId,
            sessionId,
            patientId,
            input.status,
            input.notes || null,
            actorUserId,
            allowed.rows[0].patientName,
          ],
        );
        if (input.status === "excused_absence" && !credit)
          await client.query(
            `INSERT INTO replacement_credits(clinic_id,patient_id,source_session_id) VALUES($1,$2,$3)`,
            [clinicId, patientId, sessionId],
          );
        else if (
          input.status !== "excused_absence" &&
          credit?.status === "available"
        )
          await client.query(
            `UPDATE replacement_credits SET status='cancelled' WHERE id=$1`,
            [credit.id],
          );
        await client.query("COMMIT");
        return mapGroupAttendance(attendance.rows[0]!);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async completeGroupSession(clinicId: string, sessionId: string) {
      const result = await repositoryContext.pool.query<GroupSessionRow>(
        `UPDATE group_sessions gs SET status='completed',updated_at=now() FROM group_classes g,professionals p,rooms r WHERE gs.id=$2 AND gs.clinic_id=$1 AND gs.status<>'cancelled' AND g.id=gs.group_id AND p.id=coalesce(gs.professional_id,g.professional_id) AND r.id=g.room_id RETURNING ${groupSessionColumns},(SELECT count(*) FROM group_attendance ga WHERE ga.session_id=gs.id) AS "attendanceCount"`,
        [clinicId, sessionId],
      );
      return result.rows[0] ? mapGroupSession(result.rows[0]) : null;
    },

    async bookReplacement(
      clinicId: string,
      actorUserId: string,
      input: ReplacementBookingInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const creditResult = await client.query<ReplacementCreditRow>(
          `SELECT rc.id,rc.clinic_id AS "clinicId",rc.patient_id AS "patientId",p.full_name AS "patientName",rc.source_session_id AS "sourceSessionId",rc.status,rc.used_session_id AS "usedSessionId",rc.created_at AS "createdAt",rc.used_at AS "usedAt" FROM replacement_credits rc JOIN patients p ON p.id=rc.patient_id WHERE rc.id=$2 AND rc.clinic_id=$1 FOR UPDATE OF rc`,
          [clinicId, input.creditId],
        );
        const sessionResult = await client.query<{
          groupId: string;
          capacity: number;
          status: GroupSession["status"];
        }>(
          `SELECT gs.group_id AS "groupId",g.capacity,gs.status FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id WHERE gs.id=$2 AND gs.clinic_id=$1 FOR UPDATE OF gs`,
          [clinicId, input.sessionId],
        );
        const credit = creditResult.rows[0],
          session = sessionResult.rows[0];
        if (
          !credit ||
          credit.status !== "available" ||
          !session ||
          session.status !== "scheduled"
        )
          throw new DomainError(
            "REPLACEMENT_NOT_AVAILABLE",
            "Crédito ou sessão de reposição indisponível.",
            409,
          );
        const seats = await client.query<{
          regular: string;
          replacements: string;
          patientIsRegular: boolean;
        }>(
          `SELECT(SELECT count(*) FROM group_enrollments WHERE group_id=$1 AND status='active') AS regular,(SELECT count(*) FROM group_attendance WHERE session_id=$2 AND status='replacement') AS replacements,EXISTS(SELECT 1 FROM group_enrollments WHERE group_id=$1 AND patient_id=$3 AND status='active') AS "patientIsRegular"`,
          [session.groupId, input.sessionId, credit.patientId],
        );
        const occupancy = seats.rows[0]!;
        if (
          !occupancy.patientIsRegular &&
          Number(occupancy.regular) + Number(occupancy.replacements) >=
            session.capacity
        )
          throw new DomainError(
            "GROUP_SESSION_FULL",
            "A sessão está lotada.",
            409,
          );
        let attendance: GroupAttendanceRow;
        try {
          attendance = (
            await client.query<GroupAttendanceRow>(
              `INSERT INTO group_attendance(clinic_id,session_id,patient_id,status,recorded_by_user_id) VALUES($1,$2,$3,'replacement',$4) RETURNING id,clinic_id AS "clinicId",session_id AS "sessionId",patient_id AS "patientId",$5::text AS "patientName",status,notes,recorded_at AS "recordedAt"`,
              [
                clinicId,
                input.sessionId,
                credit.patientId,
                actorUserId,
                credit.patientName,
              ],
            )
          ).rows[0]!;
        } catch (error) {
          if (hasDatabaseCode(error, "23505"))
            throw new DomainError(
              "REPLACEMENT_DUPLICATE_ATTENDANCE",
              "O cliente já possui presença registrada nesta sessão.",
              409,
            );
          throw error;
        }
        const updated = await client.query<ReplacementCreditRow>(
          `UPDATE replacement_credits SET status='used',used_session_id=$2,used_at=now() WHERE id=$1 RETURNING id,clinic_id AS "clinicId",patient_id AS "patientId",$3::text AS "patientName",source_session_id AS "sourceSessionId",status,used_session_id AS "usedSessionId",created_at AS "createdAt",used_at AS "usedAt"`,
          [credit.id, input.sessionId, credit.patientName],
        );
        await client.query("COMMIT");
        return {
          attendance: mapGroupAttendance(attendance),
          credit: mapReplacementCredit(updated.rows[0]!),
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async updateAppointmentStatus(
      clinicId: string,
      appointmentId: string,
      status: AppointmentStatus,
      absenceReason?: string,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<{
          status: AppointmentStatus;
          patientId: string | null;
          serviceId: string;
          professionalId: string;
          roomId: string;
          startsAt: Date;
          endsAt: Date;
        }>(
          `SELECT status, patient_id AS "patientId", service_id AS "serviceId",
                professional_id AS "professionalId", room_id AS "roomId",
                starts_at AS "startsAt", ends_at AS "endsAt"
         FROM appointments
         WHERE id = $2 AND clinic_id = $1
         FOR UPDATE`,
          [clinicId, appointmentId],
        );
        if (!current.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        if (
          current.rows[0].status === "cancelled" &&
          status !== "cancelled" &&
          (await hasGroupSessionConflict(
            client,
            clinicId,
            current.rows[0].professionalId,
            current.rows[0].roomId,
            current.rows[0].startsAt,
            current.rows[0].endsAt,
          ))
        )
          throw new DomainError(
            "APPOINTMENT_CONFLICT",
            "Este atendimento conflita com uma turma no mesmo horário.",
            409,
          );
        if (
          (status === "completed" || status === "no_show") &&
          current.rows[0].status !== status
        )
          assertAppointmentStarted(current.rows[0].startsAt);
        const patientId = current.rows[0].patientId;
        // Atendimento de lead (sem cliente) não consome sessão de plano.
        if (
          patientId &&
          current.rows[0].status !== "completed" &&
          status === "completed"
        ) {
          await repositoryContext.consumeSessionInDatabase(
            client,
            clinicId,
            appointmentId,
            patientId,
            current.rows[0].serviceId,
            current.rows[0].startsAt,
          );
        } else if (
          current.rows[0].status === "completed" &&
          status !== "completed"
        ) {
          await repositoryContext.restoreSessionInDatabase(
            client,
            clinicId,
            appointmentId,
          );
        }
        await client.query(
          `UPDATE appointments SET status = $3,absence_reason=coalesce($4,absence_reason), updated_at = now()
         WHERE id = $2 AND clinic_id = $1`,
          [clinicId, appointmentId, status, absenceReason ?? null],
        );
        const appointment = await repositoryContext.findAppointment(
          clinicId,
          appointmentId,
          client,
        );
        await client.query("COMMIT");
        return appointment;
      } catch (error) {
        await client.query("ROLLBACK");
        if (hasDatabaseCode(error, "23P01")) {
          throw new DomainError(
            "APPOINTMENT_CONFLICT",
            "Este atendimento não pode ser reativado porque o horário já está ocupado.",
            409,
          );
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
