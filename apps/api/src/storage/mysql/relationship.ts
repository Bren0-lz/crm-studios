import {
  type AppModule,
  type ContactActivityInput,
  type RelationshipSettings,
  type SatisfactionSurveyInput,
  defaultRelationshipSettings,
  saoPauloToday,
} from "@crm/contracts";
import {
  buildBirthdayEntries,
  buildContactSuggestions,
  npsDetractorWindowStart,
} from "../../modules/relationship/contact-suggestions.js";
import { DomainError } from "../../repository.js";
import { randomUUID } from "node:crypto";
import type { MysqlRepositoryContext } from "./context.js";
import { localDate, writeAndRead } from "./sql.js";
import {
  type AppointmentRow,
  type ContactActivityRow,
  type PatientRow,
  type PatientTabRow,
  type ReceivableRow,
  type SatisfactionSurveyRow,
  appointmentColumns,
  appointmentJoins,
  contactActivityColumns,
  hasDatabaseCode,
  mapAppointment,
  mapContactActivity,
  mapPatient,
  mapPatientTab,
  mapReceivable,
  mapSatisfactionSurvey,
  patientColumns,
  receivableColumns,
  satisfactionSurveyColumns,
} from "./helpers.js";

export function createRelationshipRepository(
  repositoryContext: MysqlRepositoryContext,
) {
  return {
    async getRelationshipSettings(clinicId: string) {
      const result = await repositoryContext.pool.query<
        Omit<RelationshipSettings, "messages"> & {
          messages: Partial<RelationshipSettings["messages"]>;
        }
      >(
        `SELECT birthday_days_ahead AS "birthdayDaysAhead",
              single_no_return_days AS "singleNoReturnDays",
              plan_expiring_days AS "planExpiringDays",
              low_balance_sessions AS "lowBalanceSessions",
              expired_with_balance_days AS "expiredWithBalanceDays",
              treatment_paused_days AS "treatmentPausedDays",
              repeated_no_show_count AS "repeatedNoShowCount",
              repeated_no_show_window_days AS "repeatedNoShowWindowDays",
              former_client_min_days AS "formerClientMinDays",
              former_client_max_days AS "formerClientMaxDays",
              messages
       FROM relationship_settings WHERE clinic_id = $1`,
        [clinicId],
      );
      const row = result.rows[0];
      if (!row) return structuredClone(defaultRelationshipSettings);
      return {
        ...row,
        messages: { ...defaultRelationshipSettings.messages, ...row.messages },
      };
    },

    async updateRelationshipSettings(
      clinicId: string,
      input: RelationshipSettings,
    ) {
      await repositoryContext.pool.query(
        `INSERT INTO relationship_settings (
         clinic_id, birthday_days_ahead, single_no_return_days,
         plan_expiring_days, low_balance_sessions, expired_with_balance_days,
         treatment_paused_days, repeated_no_show_count,
         repeated_no_show_window_days, former_client_min_days,
         former_client_max_days, messages, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(6))
       ON DUPLICATE KEY UPDATE
         birthday_days_ahead = VALUES(birthday_days_ahead),
         single_no_return_days = VALUES(single_no_return_days),
         plan_expiring_days = VALUES(plan_expiring_days),
         low_balance_sessions = VALUES(low_balance_sessions),
         expired_with_balance_days = VALUES(expired_with_balance_days),
         treatment_paused_days = VALUES(treatment_paused_days),
         repeated_no_show_count = VALUES(repeated_no_show_count),
         repeated_no_show_window_days = VALUES(repeated_no_show_window_days),
         former_client_min_days = VALUES(former_client_min_days),
         former_client_max_days = VALUES(former_client_max_days),
         messages = VALUES(messages),
         updated_at = NOW(6)`,
        [
          clinicId,
          input.birthdayDaysAhead,
          input.singleNoReturnDays,
          input.planExpiringDays,
          input.lowBalanceSessions,
          input.expiredWithBalanceDays,
          input.treatmentPausedDays,
          input.repeatedNoShowCount,
          input.repeatedNoShowWindowDays,
          input.formerClientMinDays,
          input.formerClientMaxDays,
          JSON.stringify(input.messages),
        ],
      );
      return repositoryContext.operations.getRelationshipSettings(clinicId);
    },

    async listContactSuggestions(
      clinicId: string,
      modules: readonly AppModule[],
    ) {
      const today = saoPauloToday();
      const [
        settings,
        plans,
        activities,
        patients,
        appointments,
        receivables,
        tabs,
        surveys,
      ] = await Promise.all([
        repositoryContext.operations.getRelationshipSettings(clinicId),
        repositoryContext.operations.listPatientPlans(clinicId),
        repositoryContext.operations.listContactActivities(clinicId),
        repositoryContext.pool.query<PatientRow>(
          `SELECT ${patientColumns} FROM patients
           WHERE clinic_id = $1 AND status = 'active' AND deleted_at IS NULL`,
          [clinicId],
        ),
        repositoryContext.pool.query<AppointmentRow>(
          `SELECT ${appointmentColumns}
           FROM appointments a
           ${appointmentJoins}
           WHERE a.clinic_id = $1 AND a.deleted_at IS NULL AND a.patient_id IS NOT NULL`,
          [clinicId],
        ),
        repositoryContext.pool.query<ReceivableRow>(
          `SELECT ${receivableColumns}
           FROM receivables r JOIN patients p ON p.id = r.patient_id
           WHERE r.clinic_id = $1 AND r.status = 'open'`,
          [clinicId],
        ),
        repositoryContext.pool.query<PatientTabRow>(
          `SELECT t.id,t.clinic_id AS "clinicId",t.patient_id AS "patientId",p.full_name AS "patientName",t.notes,t.status,t.payment_status AS "paymentStatus",t.total_in_cents AS "totalInCents",t.receivable_id AS "receivableId",t.opened_at AS "openedAt",t.closed_at AS "closedAt",t.cancelled_at AS "cancelledAt" FROM patient_tabs t JOIN patients p ON p.id=t.patient_id WHERE t.clinic_id=$1 AND t.status='closed'`,
          [clinicId],
        ),
        repositoryContext.operations.listSatisfactionSurveys(clinicId, {
          from: npsDetractorWindowStart(today),
        }),
      ]);
      return buildContactSuggestions(
        {
          patients: patients.rows.map(mapPatient),
          plans,
          appointments: appointments.rows.map(mapAppointment),
          receivables: receivables.rows.map(mapReceivable),
          // Os itens da comanda não influenciam as sugestões.
          tabs: tabs.rows.map((row) => mapPatientTab(row, [])),
          activities,
          surveys,
        },
        settings,
        today,
        modules,
      );
    },

    async createContactActivity(
      clinicId: string,
      actorUserId: string,
      input: ContactActivityInput,
    ) {
      const result = await writeAndRead<ContactActivityRow>(
        repositoryContext.pool,
        `INSERT INTO contact_activities (
         id, clinic_id, patient_id, reason, reference_key, outcome, notes,
         snooze_until, actor_user_id
       )
       SELECT $9, $1, p.id, $3, $4, $5, $6, $7, $8
       FROM patients p WHERE p.id = $2 AND p.clinic_id = $1`,
        [
          clinicId,
          input.patientId,
          input.reason,
          input.referenceKey,
          input.outcome,
          input.notes || null,
          input.outcome === "snoozed" ? (input.snoozeUntil ?? null) : null,
          actorUserId,
          randomUUID(),
        ],
        `SELECT ${contactActivityColumns} FROM contact_activities WHERE id = $9`,
      );
      const row = result.rows[0];
      if (!row)
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      return mapContactActivity(row);
    },

    async listBirthdays(clinicId: string, month: string) {
      const [patients, activities] = await Promise.all([
        repositoryContext.pool.query<PatientRow>(
          `SELECT ${patientColumns} FROM patients
         WHERE clinic_id = $1 AND status = 'active' AND deleted_at IS NULL AND birth_date IS NOT NULL`,
          [clinicId],
        ),
        repositoryContext.pool.query<ContactActivityRow>(
          `SELECT ${contactActivityColumns}
         FROM contact_activities
         WHERE clinic_id = $1 AND reason = 'birthday' AND outcome = 'contacted'
           AND reference_key LIKE $2`,
          [clinicId, `%:${month.slice(0, 4)}`],
        ),
      ]);
      return buildBirthdayEntries(
        patients.rows.map(mapPatient),
        activities.rows.map(mapContactActivity),
        month,
      );
    },

    async listContactActivities(clinicId: string, patientId?: string) {
      const result = await repositoryContext.pool.query<ContactActivityRow>(
        `SELECT ${contactActivityColumns}
       FROM contact_activities
       WHERE clinic_id = $1 AND ($2 IS NULL OR patient_id = $2)
       ORDER BY created_at DESC, id DESC`,
        [clinicId, patientId ?? null],
      );
      return result.rows.map(mapContactActivity);
    },

    async createSatisfactionSurvey(
      clinicId: string,
      actorUserId: string,
      input: SatisfactionSurveyInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const patient = await client.query<{ fullName: string }>(
          `SELECT full_name AS "fullName" FROM patients
       WHERE id = $1 AND clinic_id = $2`,
          [input.patientId, clinicId],
        );
        if (!patient.rows[0])
          throw new DomainError(
            "PATIENT_NOT_FOUND",
            "Cliente não encontrado.",
            404,
          );
        if (input.appointmentId) {
          const appointment = await client.query<{
            patientId: string | null;
            status: string;
          }>(
            `SELECT patient_id AS "patientId", status FROM appointments
         WHERE id = $1 AND clinic_id = $2`,
            [input.appointmentId, clinicId],
          );
          const found = appointment.rows[0];
          if (!found)
            throw new DomainError(
              "APPOINTMENT_NOT_FOUND",
              "Atendimento não encontrado.",
              404,
            );
          if (!found.patientId)
            throw new DomainError(
              "LEAD_APPOINTMENT_NOT_ALLOWED",
              "Atendimento de lead não tem pesquisa de satisfação. Converta o lead em cliente primeiro.",
              409,
            );
          if (found.patientId !== input.patientId)
            throw new DomainError(
              "SATISFACTION_APPOINTMENT_MISMATCH",
              "O atendimento não pertence a este cliente.",
            );
          if (found.status !== "completed")
            throw new DomainError(
              "SATISFACTION_APPOINTMENT_NOT_COMPLETED",
              "Só é possível avaliar atendimentos concluídos.",
            );
        }
        if (
          input.sourceMessageId &&
          !(
            await client.query(
              "SELECT id FROM outbound_messages WHERE clinic_id=$1 AND id=$2 AND patient_id=$3 AND kind='satisfaction_followup' LOCK IN SHARE MODE",
              [clinicId, input.sourceMessageId, input.patientId],
            )
          ).rowCount
        )
          throw new DomainError(
            "SATISFACTION_MESSAGE_MISMATCH",
            "A solicitação de NPS não pertence a este cliente.",
            404,
          );
        try {
          const result = await writeAndRead<SatisfactionSurveyRow>(
            client,
            `INSERT INTO satisfaction_surveys (
             clinic_id, patient_id, appointment_id, score, comment, actor_user_id,source_message_id,id
           ) VALUES ($1, $2, $3, $4, $5, $6,$7,$8)`,
            [
              clinicId,
              input.patientId,
              input.appointmentId ?? null,
              input.score,
              input.comment || null,
              actorUserId,
              input.sourceMessageId ?? null,
              randomUUID(),
            ],
            `SELECT ${satisfactionSurveyColumns}
         FROM satisfaction_surveys s JOIN patients p ON p.id = s.patient_id AND p.clinic_id=s.clinic_id
         WHERE s.id = $8`,
          );
          return mapSatisfactionSurvey(result.rows[0]!);
        } catch (error) {
          if (hasDatabaseCode(error, "23505"))
            throw new DomainError(
              "SATISFACTION_DUPLICATE",
              "Este atendimento já possui pesquisa de satisfação.",
              409,
            );
          throw error;
        }
      });
    },

    async listSatisfactionSurveys(
      clinicId: string,
      filter: {
        from?: string | undefined;
        to?: string | undefined;
        patientId?: string | undefined;
      } = {},
    ) {
      const result = await repositoryContext.pool.query<SatisfactionSurveyRow>(
        `SELECT ${satisfactionSurveyColumns}
       FROM satisfaction_surveys s
       JOIN patients p ON p.id = s.patient_id
       WHERE s.clinic_id = $1
         AND ($2 IS NULL
           OR ${localDate("s.created_at")} >= $2)
         AND ($3 IS NULL
           OR ${localDate("s.created_at")} <= $3)
         AND ($4 IS NULL OR s.patient_id = $4)
       ORDER BY s.created_at DESC, s.id DESC`,
        [
          clinicId,
          filter.from ?? null,
          filter.to ?? null,
          filter.patientId ?? null,
        ],
      );
      return result.rows.map(mapSatisfactionSurvey);
    },
  };
}
