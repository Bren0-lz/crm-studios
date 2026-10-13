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
import type { PostgresRepositoryContext } from "./context.js";
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
  repositoryContext: PostgresRepositoryContext,
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
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())
       ON CONFLICT (clinic_id) DO UPDATE SET
         birthday_days_ahead = EXCLUDED.birthday_days_ahead,
         single_no_return_days = EXCLUDED.single_no_return_days,
         plan_expiring_days = EXCLUDED.plan_expiring_days,
         low_balance_sessions = EXCLUDED.low_balance_sessions,
         expired_with_balance_days = EXCLUDED.expired_with_balance_days,
         treatment_paused_days = EXCLUDED.treatment_paused_days,
         repeated_no_show_count = EXCLUDED.repeated_no_show_count,
         repeated_no_show_window_days = EXCLUDED.repeated_no_show_window_days,
         former_client_min_days = EXCLUDED.former_client_min_days,
         former_client_max_days = EXCLUDED.former_client_max_days,
         messages = EXCLUDED.messages,
         updated_at = now()`,
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
           WHERE clinic_id = $1 AND status = 'active'`,
          [clinicId],
        ),
        repositoryContext.pool.query<AppointmentRow>(
          `SELECT ${appointmentColumns}
           FROM appointments a
           ${appointmentJoins}
           WHERE a.clinic_id = $1 AND a.patient_id IS NOT NULL`,
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
      const result = await repositoryContext.pool.query<ContactActivityRow>(
        `INSERT INTO contact_activities (
         clinic_id, patient_id, reason, reference_key, outcome, notes,
         snooze_until, actor_user_id
       )
       SELECT $1, p.id, $3, $4, $5, $6, $7::date, $8
       FROM patients p WHERE p.id = $2 AND p.clinic_id = $1
       RETURNING ${contactActivityColumns}`,
        [
          clinicId,
          input.patientId,
          input.reason,
          input.referenceKey,
          input.outcome,
          input.notes || null,
          input.outcome === "snoozed" ? (input.snoozeUntil ?? null) : null,
          actorUserId,
        ],
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
         WHERE clinic_id = $1 AND status = 'active' AND birth_date IS NOT NULL`,
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
       WHERE clinic_id = $1 AND ($2::uuid IS NULL OR patient_id = $2)
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
      const patient = await repositoryContext.pool.query<{ fullName: string }>(
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
        const appointment = await repositoryContext.pool.query<{
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
      try {
        const result =
          await repositoryContext.pool.query<SatisfactionSurveyRow>(
            `WITH inserted AS (
           INSERT INTO satisfaction_surveys (
             clinic_id, patient_id, appointment_id, score, comment, actor_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *
         )
         SELECT ${satisfactionSurveyColumns}
         FROM inserted s JOIN patients p ON p.id = s.patient_id`,
            [
              clinicId,
              input.patientId,
              input.appointmentId ?? null,
              input.score,
              input.comment || null,
              actorUserId,
            ],
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
         AND ($2::date IS NULL
           OR (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= $2::date)
         AND ($3::date IS NULL
           OR (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= $3::date)
         AND ($4::uuid IS NULL OR s.patient_id = $4)
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
