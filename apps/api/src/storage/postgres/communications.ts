import {
  buildReminderCandidates,
  type ReminderPatient,
  type ReminderEncounter,
  type ReminderInvoice,
  type ReminderSurvey,
} from "../../modules/communications/reminders.js";
import type {
  BroadcastMessageDraft,
  CommunicationPreferenceInput,
  ManualMessageInput,
  ReminderGenerationOptions,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { DomainError } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";
import {
  type CommunicationPreferenceRow,
  type OutboundMessageRow,
  communicationRecipient,
  mapCommunicationPreference,
  mapOutboundMessage,
  outboundMessageColumns,
} from "./helpers.js";

export function createCommunicationsRepository(
  repositoryContext: PostgresRepositoryContext,
) {
  return {
    async completeManualMessage(
      clinicId: string,
      actorUserId: string,
      messageId: string,
      status: "sent" | "cancelled",
    ) {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const result = await client.query<OutboundMessageRow>(
          `SELECT ${outboundMessageColumns} FROM outbound_messages om JOIN patients p ON p.id=om.patient_id AND p.clinic_id=om.clinic_id WHERE om.clinic_id=$1 AND om.id=$2 FOR UPDATE OF om`,
          [clinicId, messageId],
        );
        const message = result.rows[0];
        if (!message)
          throw new DomainError(
            "MESSAGE_NOT_FOUND",
            "Mensagem não encontrada.",
            404,
          );
        if (message.status !== "queued")
          throw new DomainError(
            "MESSAGE_NOT_QUEUED",
            "Somente mensagens na fila podem ser concluídas.",
            409,
          );
        if (status === "sent") {
          const preference = await client.query(
            "SELECT allowed FROM communication_preferences WHERE clinic_id=$1 AND patient_id=$2 AND channel=$3 FOR UPDATE",
            [clinicId, message.patientId, message.channel],
          );
          if (preference.rows[0]?.allowed === false)
            throw new DomainError(
              "COMMUNICATION_OPT_OUT",
              "O cliente não autorizou mensagens neste canal.",
              409,
            );
          if (message.scheduledFor.getTime() > Date.now())
            throw new DomainError(
              "MESSAGE_NOT_DUE",
              "A mensagem está programada para uma data futura.",
              409,
            );
        }
        const actor = await client.query<{ fullName: string }>(
          `SELECT full_name AS "fullName" FROM users WHERE clinic_id=$1 AND id=$2`,
          [clinicId, actorUserId],
        );
        if (!actor.rows[0])
          throw new DomainError(
            "USER_NOT_FOUND",
            "Usuário não encontrado.",
            404,
          );
        const completion = {
          actorId: actorUserId,
          actorName: actor.rows[0].fullName,
          occurredAt: new Date().toISOString(),
          status,
        };
        await client.query(
          "UPDATE outbound_messages SET status=$3,sent_at=CASE WHEN $3='sent' THEN now() ELSE NULL END,manual_completion=$4::jsonb WHERE clinic_id=$1 AND id=$2",
          [clinicId, messageId, status, JSON.stringify(completion)],
        );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "message.manual_completion",
          "message",
          messageId,
          { status },
        );
        return {
          ...mapOutboundMessage(message),
          status,
          ...(status === "sent" ? { sentAt: completion.occurredAt } : {}),
          manualCompletion: completion,
        };
      });
    },
    async getCommunicationCenter(clinicId: string) {
      const [preferences, messages] = await Promise.all([
        repositoryContext.pool.query<CommunicationPreferenceRow>(
          `SELECT id, clinic_id AS "clinicId", patient_id AS "patientId",
                channel, allowed, updated_at AS "updatedAt"
         FROM communication_preferences WHERE clinic_id = $1
         ORDER BY updated_at DESC`,
          [clinicId],
        ),
        repositoryContext.pool.query<OutboundMessageRow>(
          `SELECT ${outboundMessageColumns}
         FROM outbound_messages om
         JOIN patients p ON p.id = om.patient_id
         WHERE om.clinic_id = $1 ORDER BY om.created_at DESC LIMIT 250`,
          [clinicId],
        ),
      ]);
      return {
        deliveryMode: "outbox_only" as const,
        preferences: preferences.rows.map(mapCommunicationPreference),
        messages: messages.rows.map(mapOutboundMessage),
      };
    },

    async setCommunicationPreference(
      clinicId: string,
      input: CommunicationPreferenceInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const patient = await client.query(
          `SELECT 1 FROM patients WHERE clinic_id = $1 AND id = $2`,
          [clinicId, input.patientId],
        );
        if (!patient.rows[0])
          throw new DomainError(
            "PATIENT_NOT_FOUND",
            "Cliente não encontrado.",
            404,
          );
        const result = await client.query<CommunicationPreferenceRow>(
          `INSERT INTO communication_preferences
         (clinic_id, patient_id, channel, allowed)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (clinic_id, patient_id, channel)
       DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now()
       RETURNING id, clinic_id AS "clinicId", patient_id AS "patientId",
                 channel, allowed, updated_at AS "updatedAt"`,
          [clinicId, input.patientId, input.channel, input.allowed],
        );
        return mapCommunicationPreference(result.rows[0]!);
      });
    },

    async queueManualMessage(clinicId: string, input: ManualMessageInput) {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const patient = await client.query<{
          id: string;
          phone: string;
          whatsapp: string | null;
          email: string | null;
        }>(
          `SELECT id, phone, whatsapp, email FROM patients
       WHERE clinic_id = $1 AND id = $2`,
          [clinicId, input.patientId],
        );
        if (!patient.rows[0])
          throw new DomainError(
            "PATIENT_NOT_FOUND",
            "Cliente não encontrado.",
            404,
          );
        await repositoryContext.assertCommunicationAllowed(
          clinicId,
          input.patientId,
          input.channel,
          client,
        );
        const recipient = communicationRecipient(
          patient.rows[0],
          input.channel,
        );
        if (!recipient)
          throw new DomainError(
            "COMMUNICATION_RECIPIENT_MISSING",
            "O cliente não possui contato para o canal selecionado.",
          );
        const result = await client.query<OutboundMessageRow>(
          `WITH inserted AS (
         INSERT INTO outbound_messages
           (clinic_id, patient_id, channel, kind, recipient, body,
            scheduled_for, idempotency_key)
         VALUES ($1,$2,$3,'manual',$4,$5,$6,$7)
         RETURNING *
       )
       SELECT ${outboundMessageColumns}
       FROM inserted om JOIN patients p ON p.id = om.patient_id`,
          [
            clinicId,
            input.patientId,
            input.channel,
            recipient,
            input.body,
            input.scheduledFor ?? new Date().toISOString(),
            `manual:${randomUUID()}`,
          ],
        );
        return mapOutboundMessage(result.rows[0]!);
      });
    },

    async queueBroadcastMessages(
      clinicId: string,
      drafts: BroadcastMessageDraft[],
    ) {
      if (drafts.length === 0) return 0;
      const batchId = randomUUID();
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        for (const draft of drafts)
          await repositoryContext.assertCommunicationAllowed(
            clinicId,
            draft.patientId,
            draft.channel,
            client,
          );
        // O JOIN com patients garante que todo destinatário é da clínica; se
        // algum não for, nada é gravado.
        const inserted = await client.query(
          `INSERT INTO outbound_messages
           (clinic_id, patient_id, channel, kind, recipient, body,
            scheduled_for, idempotency_key)
         SELECT $1, p.id, d.channel, 'manual', d.recipient, d.body, now(),
                'broadcast:' || $2 || ':' || p.id::text
         FROM unnest($3::uuid[], $4::text[], $5::text[], $6::text[])
              AS d(patient_id, channel, recipient, body)
         JOIN patients p ON p.id = d.patient_id AND p.clinic_id = $1`,
          [
            clinicId,
            batchId,
            drafts.map((draft) => draft.patientId),
            drafts.map((draft) => draft.channel),
            drafts.map((draft) => draft.recipient),
            drafts.map((draft) => draft.body),
          ],
        );
        if (inserted.rowCount !== drafts.length)
          throw new DomainError(
            "PATIENT_NOT_FOUND",
            "Cliente não encontrado.",
            404,
          );
        return drafts.length;
      });
    },

    async generateReminders(
      clinicId: string,
      referenceDate: string,
      options: ReminderGenerationOptions = {},
    ) {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const settings = await client.query<{ timezone: string }>(
          "SELECT timezone FROM clinics WHERE id=$1",
          [clinicId],
        );
        const patients = await client.query<ReminderPatient>(
          `SELECT id,full_name AS "fullName",phone,whatsapp,birth_date::text AS "birthDate",status FROM patients WHERE clinic_id=$1`,
          [clinicId],
        );
        const encounters = await client.query<ReminderEncounter>(
          `SELECT id,patient_id AS "patientId",starts_at AS "startsAt",status FROM appointments WHERE clinic_id=$1 AND patient_id IS NOT NULL AND (starts_at AT TIME ZONE $3)::date=$2::date UNION ALL SELECT gs.id,ga.patient_id,gs.starts_at,'completed' FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id WHERE ga.clinic_id=$1 AND (ga.status='present' OR ga.outcome='present') AND gs.status<>'cancelled' AND (gs.starts_at AT TIME ZONE $3)::date=$2::date`,
          [
            clinicId,
            referenceDate,
            settings.rows[0]?.timezone ?? "America/Sao_Paulo",
          ],
        );
        const invoices =
          options.payments === false
            ? []
            : (
                await client.query<ReminderInvoice>(
                  `SELECT id,patient_id AS "patientId",due_date::text AS "dueDate",status FROM receivables WHERE clinic_id=$1 AND status='open' AND due_date<=$2::date`,
                  [clinicId, referenceDate],
                )
              ).rows;
        const surveys = options.satisfaction
          ? (
              await client.query<ReminderSurvey>(
                `SELECT patient_id AS "patientId",created_at AS "createdAt" FROM satisfaction_surveys WHERE clinic_id=$1 AND (created_at AT TIME ZONE $3)::date>=$2::date`,
                [
                  clinicId,
                  referenceDate,
                  settings.rows[0]?.timezone ?? "America/Sao_Paulo",
                ],
              )
            ).rows
          : [];
        const asIso = (value: unknown) =>
          value instanceof Date ? value.toISOString() : String(value);
        const candidates = buildReminderCandidates(
          patients.rows.map((row) => ({
            ...row,
            whatsapp: row.whatsapp ?? undefined,
            birthDate: row.birthDate ?? undefined,
          })),
          encounters.rows.map((row) => ({
            ...row,
            startsAt: asIso(row.startsAt),
          })),
          invoices,
          surveys.map((row) => ({ ...row, createdAt: asIso(row.createdAt) })),
          referenceDate,
          settings.rows[0]?.timezone ?? "America/Sao_Paulo",
          options,
        );
        let queued = 0,
          skippedByPreference = 0,
          alreadyQueued = 0;
        for (const candidate of candidates) {
          if (
            (
              await client.query(
                "SELECT id FROM outbound_messages WHERE clinic_id=$1 AND idempotency_key=ANY($2::text[])",
                [
                  clinicId,
                  [
                    candidate.key,
                    ...(candidate.legacyKey ? [candidate.legacyKey] : []),
                  ],
                ],
              )
            ).rowCount
          ) {
            alreadyQueued++;
            continue;
          }
          const preference = await client.query<{ allowed: boolean }>(
            "SELECT allowed FROM communication_preferences WHERE clinic_id=$1 AND patient_id=$2 AND channel='whatsapp' FOR SHARE",
            [clinicId, candidate.patient.id],
          );
          if (preference.rows[0]?.allowed === false) {
            skippedByPreference++;
            continue;
          }
          const inserted = await client.query(
            `INSERT INTO outbound_messages(clinic_id,patient_id,appointment_id,receivable_id,channel,kind,recipient,body,scheduled_for,idempotency_key) VALUES($1,$2,$3,$4,'whatsapp',$5,$6,$7,now(),$8) ON CONFLICT(clinic_id,idempotency_key) DO NOTHING RETURNING id`,
            [
              clinicId,
              candidate.patient.id,
              candidate.appointmentId ?? null,
              candidate.receivableId ?? null,
              candidate.kind,
              candidate.patient.whatsapp || candidate.patient.phone,
              candidate.body,
              candidate.key,
            ],
          );
          if (inserted.rowCount) queued++;
          else alreadyQueued++;
        }
        return { queued, skippedByPreference, alreadyQueued };
      });
    },
  };
}
