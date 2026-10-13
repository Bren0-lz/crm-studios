import type {
  LeadActivity,
  LeadContactInput,
  LeadConversion,
  LeadInput,
  LeadStage,
  LeadTaskInput,
  LeadTaskStatus,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { DomainError } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";
import {
  ensurePatientTags,
  leadColumns,
  type LeadContactRow,
  type LeadRow,
  type LeadTaskRow,
  mapLead,
  mapLeadContact,
  mapLeadTask,
  mapPatient,
  patientColumns,
  type PatientRow,
} from "./helpers.js";

export function createCommercialRepository(
  repositoryContext: PostgresRepositoryContext,
) {
  return {
    async listLeads(clinicId: string) {
      const result = await repositoryContext.pool.query<LeadRow>(
        `SELECT ${leadColumns} FROM leads WHERE clinic_id = $1 ORDER BY updated_at DESC`,
        [clinicId],
      );
      return result.rows.map(mapLead);
    },

    async createLead(clinicId: string, input: LeadInput) {
      if (input.responsibleUserId) {
        const responsible = await repositoryContext.pool.query(
          `SELECT 1 FROM users WHERE clinic_id = $1 AND id = $2 AND active`,
          [clinicId, input.responsibleUserId],
        );
        if (!responsible.rows[0])
          throw new DomainError(
            "RESPONSIBLE_USER_NOT_FOUND",
            "Responsável não encontrado.",
            404,
          );
      }
      const result = await repositoryContext.pool.query<{ id: string }>(
        `INSERT INTO leads
         (clinic_id, full_name, phone, email, source, interest, notes,
          responsible_user_id, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
        [
          clinicId,
          input.fullName,
          input.phone,
          input.email || null,
          input.source,
          input.interest,
          input.notes || null,
          input.responsibleUserId || null,
          input.tags,
        ],
      );
      return (await repositoryContext.findLead(
        repositoryContext.pool,
        clinicId,
        result.rows[0]!.id,
      ))!;
    },

    async moveLead(
      clinicId: string,
      actorUserId: string,
      leadId: string,
      stage: LeadStage,
      lostReason?: string,
    ) {
      if (stage === "won") {
        throw new DomainError(
          "LEAD_CONVERSION_REQUIRED",
          "Use a conversão para marcar o lead como ganho.",
        );
      }
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<{
          stage: LeadStage;
          convertedPatientId: string | null;
        }>(
          `SELECT stage, converted_patient_id AS "convertedPatientId"
         FROM leads WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
          [clinicId, leadId],
        );
        if (!current.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        if (current.rows[0].convertedPatientId) {
          throw new DomainError(
            "LEAD_ALREADY_CONVERTED",
            "Este lead já foi convertido em cliente.",
            409,
          );
        }
        await client.query(
          `UPDATE leads SET stage = $3, lost_reason = $4, updated_at = now()
         WHERE clinic_id = $1 AND id = $2`,
          [clinicId, leadId, stage, stage === "lost" ? lostReason : null],
        );
        await client.query(
          `INSERT INTO lead_stage_history
           (clinic_id, lead_id, actor_user_id, from_stage, to_stage, reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            clinicId,
            leadId,
            actorUserId,
            current.rows[0].stage,
            stage,
            lostReason || null,
          ],
        );
        const lead = await repositoryContext.findLead(client, clinicId, leadId);
        await client.query("COMMIT");
        return lead;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async convertLead(
      clinicId: string,
      actorUserId: string,
      leadId: string,
    ): Promise<LeadConversion | null> {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const leadResult = await client.query<LeadRow>(
          `SELECT ${leadColumns} FROM leads
         WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
          [clinicId, leadId],
        );
        if (!leadResult.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        const original = mapLead(leadResult.rows[0]);
        let patientResult = original.convertedPatientId
          ? await client.query<PatientRow>(
              `SELECT ${patientColumns} FROM patients
             WHERE clinic_id = $1 AND id = $2`,
              [clinicId, original.convertedPatientId],
            )
          : await client.query<PatientRow>(
              `SELECT ${patientColumns} FROM patients
             WHERE clinic_id = $1 AND (phone = $2 OR ($3::text IS NOT NULL AND lower(email) = lower($3)))
             ORDER BY created_at LIMIT 1`,
              [clinicId, original.phone, original.email || null],
            );
        if (original.convertedPatientId && !patientResult.rows[0]) {
          throw new DomainError(
            "LEAD_PATIENT_NOT_FOUND",
            "O cliente vinculado a este lead não foi encontrado.",
            409,
          );
        }
        const reusedExisting = Boolean(patientResult.rows[0]);
        if (!patientResult.rows[0]) {
          await ensurePatientTags(client, clinicId, ["Convertido do CRM"]);
          const patientId = randomUUID();
          patientResult = await client.query<PatientRow>(
            `INSERT INTO patients
             (id, clinic_id, record_number, full_name, phone, email, notes, tags)
           VALUES ($1,$2,$3,$4,$5,$6,$7,ARRAY['Convertido do CRM'])
           RETURNING ${patientColumns}`,
            [
              patientId,
              clinicId,
              `PAC-${patientId.slice(0, 8).toUpperCase()}`,
              original.fullName,
              original.phone,
              original.email || null,
              original.notes || null,
            ],
          );
        }
        const patient = mapPatient(patientResult.rows[0]!);
        await client.query(
          `UPDATE appointments SET patient_id = $3, lead_id = NULL, updated_at = now()
         WHERE clinic_id = $1 AND lead_id = $2`,
          [clinicId, leadId, patient.id],
        );
        if (!original.convertedPatientId) {
          await client.query(
            `UPDATE leads SET stage = 'won', converted_patient_id = $3,
                  lost_reason = NULL, updated_at = now()
           WHERE clinic_id = $1 AND id = $2`,
            [clinicId, leadId, patient.id],
          );
          await client.query(
            `INSERT INTO lead_stage_history
             (clinic_id, lead_id, actor_user_id, from_stage, to_stage, reason)
           VALUES ($1,$2,$3,$4,'won','Conversão em cliente')`,
            [clinicId, leadId, actorUserId, original.stage],
          );
        }
        const lead = await repositoryContext.findLead(client, clinicId, leadId);
        await client.query("COMMIT");
        return { lead: lead!, patient, reusedExisting };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getLeadActivity(
      clinicId: string,
      leadId: string,
    ): Promise<LeadActivity | null> {
      const lead = await repositoryContext.pool.query(
        `SELECT 1 FROM leads WHERE clinic_id = $1 AND id = $2`,
        [clinicId, leadId],
      );
      if (!lead.rows[0]) return null;
      const [contacts, tasks] = await Promise.all([
        repositoryContext.pool.query<LeadContactRow>(
          `SELECT lc.id, lc.clinic_id AS "clinicId", lc.lead_id AS "leadId",
                lc.channel, lc.direction, lc.notes, u.full_name AS "actorName",
                lc.occurred_at AS "occurredAt", lc.created_at AS "createdAt"
         FROM lead_contacts lc JOIN users u ON u.id = lc.actor_user_id
         WHERE lc.clinic_id = $1 AND lc.lead_id = $2
         ORDER BY lc.occurred_at DESC`,
          [clinicId, leadId],
        ),
        repositoryContext.pool.query<LeadTaskRow>(
          `SELECT lt.id, lt.clinic_id AS "clinicId", lt.lead_id AS "leadId",
                lt.title, lt.notes, lt.due_at AS "dueAt",
                lt.assigned_user_id AS "assignedUserId",
                u.full_name AS "assignedUserName", lt.status,
                lt.completed_at AS "completedAt", lt.created_at AS "createdAt",
                lt.updated_at AS "updatedAt"
         FROM lead_tasks lt LEFT JOIN users u ON u.id = lt.assigned_user_id
         WHERE lt.clinic_id = $1 AND lt.lead_id = $2
         ORDER BY CASE WHEN lt.status = 'open' THEN 0 ELSE 1 END, lt.due_at`,
          [clinicId, leadId],
        ),
      ]);
      return {
        contacts: contacts.rows.map(mapLeadContact),
        tasks: tasks.rows.map(mapLeadTask),
      };
    },

    async createLeadContact(
      clinicId: string,
      actorUserId: string,
      leadId: string,
      input: LeadContactInput,
    ) {
      const inserted = await repositoryContext.pool.query<{ id: string }>(
        `INSERT INTO lead_contacts
         (clinic_id, lead_id, actor_user_id, channel, direction, notes, occurred_at)
       SELECT $1, l.id, u.id, $4, $5, $6, $7
       FROM leads l JOIN users u ON u.clinic_id = l.clinic_id AND u.id = $3
       WHERE l.clinic_id = $1 AND l.id = $2
       RETURNING id`,
        [
          clinicId,
          leadId,
          actorUserId,
          input.channel,
          input.direction,
          input.notes,
          input.occurredAt ?? new Date().toISOString(),
        ],
      );
      if (!inserted.rows[0]) return null;
      await repositoryContext.pool.query(
        `UPDATE leads SET updated_at = now() WHERE clinic_id = $1 AND id = $2`,
        [clinicId, leadId],
      );
      return repositoryContext.findLeadContact(clinicId, inserted.rows[0].id);
    },

    async createLeadTask(
      clinicId: string,
      actorUserId: string,
      leadId: string,
      input: LeadTaskInput,
    ) {
      const assignedUserId = input.assignedUserId || actorUserId;
      const inserted = await repositoryContext.pool.query<{ id: string }>(
        `INSERT INTO lead_tasks
         (clinic_id, lead_id, title, notes, due_at, assigned_user_id,
          created_by_user_id)
       SELECT $1, l.id, $4, $5, $6, assigned.id, creator.id
       FROM leads l
       JOIN users creator
         ON creator.clinic_id = l.clinic_id AND creator.id = $3
       JOIN users assigned
         ON assigned.clinic_id = l.clinic_id AND assigned.id = $7 AND assigned.active
       WHERE l.clinic_id = $1 AND l.id = $2
       RETURNING id`,
        [
          clinicId,
          leadId,
          actorUserId,
          input.title,
          input.notes || null,
          input.dueAt,
          assignedUserId,
        ],
      );
      if (!inserted.rows[0]) {
        const lead = await repositoryContext.pool.query(
          `SELECT 1 FROM leads WHERE clinic_id = $1 AND id = $2`,
          [clinicId, leadId],
        );
        if (!lead.rows[0]) return null;
        throw new DomainError(
          "ASSIGNED_USER_NOT_FOUND",
          "Usuário responsável pela tarefa não encontrado.",
          404,
        );
      }
      await repositoryContext.pool.query(
        `UPDATE leads SET updated_at = now() WHERE clinic_id = $1 AND id = $2`,
        [clinicId, leadId],
      );
      return repositoryContext.findLeadTask(clinicId, inserted.rows[0].id);
    },

    async updateLeadTaskStatus(
      clinicId: string,
      taskId: string,
      status: LeadTaskStatus,
    ) {
      const result = await repositoryContext.pool.query(
        `UPDATE lead_tasks SET status = $3,
              completed_at = CASE WHEN $3 = 'completed' THEN now() ELSE NULL END,
              updated_at = now()
       WHERE clinic_id = $1 AND id = $2 RETURNING id`,
        [clinicId, taskId, status],
      );
      return result.rows[0]
        ? repositoryContext.findLeadTask(clinicId, taskId)
        : null;
    },
  };
}
