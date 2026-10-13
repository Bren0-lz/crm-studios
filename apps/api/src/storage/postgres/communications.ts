import type {
  BroadcastMessageDraft,
  CommunicationPreferenceInput,
  ManualMessageInput,
  OutboundMessage,
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
      const patient = await repositoryContext.pool.query(
        `SELECT 1 FROM patients WHERE clinic_id = $1 AND id = $2`,
        [clinicId, input.patientId],
      );
      if (!patient.rows[0])
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      const result =
        await repositoryContext.pool.query<CommunicationPreferenceRow>(
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
    },

    async queueManualMessage(clinicId: string, input: ManualMessageInput) {
      const patient = await repositoryContext.pool.query<{
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
      );
      const recipient = communicationRecipient(patient.rows[0], input.channel);
      if (!recipient)
        throw new DomainError(
          "COMMUNICATION_RECIPIENT_MISSING",
          "O cliente não possui contato para o canal selecionado.",
        );
      const result = await repositoryContext.pool.query<OutboundMessageRow>(
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
    },

    async queueBroadcastMessages(
      clinicId: string,
      drafts: BroadcastMessageDraft[],
    ) {
      if (drafts.length === 0) return 0;
      const batchId = randomUUID();
      return repositoryContext.inTransaction(async (client) => {
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

    async generateReminders(clinicId: string, referenceDate: string) {
      const candidates = await repositoryContext.pool.query<{
        patientId: string;
        patientName: string;
        phone: string;
        kind: OutboundMessage["kind"];
        sourceId: string;
        body: string;
        preferenceAllowed: boolean;
      }>(
        `SELECT a.patient_id AS "patientId", p.full_name AS "patientName", coalesce(p.whatsapp, p.phone) AS phone,
              'appointment_reminder' AS kind, a.id AS "sourceId",
              'Olá, ' || p.full_name || '. Lembramos do seu atendimento em ' ||
              to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY às HH24:MI') || '.' AS body,
              COALESCE(cp.allowed, true) AS "preferenceAllowed"
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN communication_preferences cp
         ON cp.clinic_id = a.clinic_id AND cp.patient_id = a.patient_id
        AND cp.channel = 'whatsapp'
       WHERE a.clinic_id = $1
         AND a.patient_id IS NOT NULL -- atendimento de lead não tem lembrete
         AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
         AND a.status IN ('scheduled', 'confirmed')
       UNION ALL
       SELECT r.patient_id, p.full_name, coalesce(p.whatsapp, p.phone), 'payment_reminder', r.id,
              'Olá, ' || p.full_name || '. Identificamos uma parcela com vencimento em ' ||
              to_char(r.due_date, 'DD/MM/YYYY') || '. Fale com a clínica se precisar de ajuda.',
              COALESCE(cp.allowed, true)
       FROM receivables r
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN communication_preferences cp
         ON cp.clinic_id = r.clinic_id AND cp.patient_id = r.patient_id
        AND cp.channel = 'whatsapp'
       WHERE r.clinic_id = $1 AND r.status = 'open' AND r.due_date <= $2::date`,
        [clinicId, referenceDate],
      );
      let queued = 0;
      let skippedByPreference = 0;
      let alreadyQueued = 0;
      for (const candidate of candidates.rows) {
        if (!candidate.preferenceAllowed) {
          skippedByPreference += 1;
          continue;
        }
        const key = `${candidate.kind}:${candidate.sourceId}:whatsapp`;
        const inserted = await repositoryContext.pool.query(
          `INSERT INTO outbound_messages
           (clinic_id, patient_id, appointment_id, receivable_id, channel,
            kind, recipient, body, scheduled_for, idempotency_key)
         VALUES ($1,$2,$3,$4,'whatsapp',$5,$6,$7,now(),$8)
         ON CONFLICT (clinic_id, idempotency_key) DO NOTHING
         RETURNING id`,
          [
            clinicId,
            candidate.patientId,
            candidate.kind === "appointment_reminder"
              ? candidate.sourceId
              : null,
            candidate.kind === "payment_reminder" ? candidate.sourceId : null,
            candidate.kind,
            candidate.phone,
            candidate.body,
            key,
          ],
        );
        if (inserted.rowCount) queued += 1;
        else alreadyQueued += 1;
      }
      return { queued, skippedByPreference, alreadyQueued };
    },
  };
}
