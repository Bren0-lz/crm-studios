import {
  leadConversionData,
  withConversionInput,
} from "../../modules/commercial/conversion.js";
import {
  countEventParticipantPlans,
  planEventParticipants,
  type EventImportPatient,
} from "../../modules/commercial/event-participants.js";
import { leadPatientProfile } from "@crm/contracts/commercial";
import {
  eventLeadSource,
  buildLeadInsightsFromGroups,
  cpfMatchKey,
  normalizeLeadSearch,
  type LeadFilter,
  type LeadFilterOptions,
  type LeadInsightGroup,
  type LeadPage,
  type LeadStagesInput,
  type LeadStagePage,
  emailMatchKey,
  resolveLeadStages,
  firstOpenLeadStage,
  findLeadDuplicates,
  phoneMatchKey,
  type ContactDuplicateCandidate,
  type LeadDuplicateQuery,
} from "@crm/contracts";
import { patientProfile } from "@crm/contracts/patients";
import type {
  LeadActivity,
  LeadContactInput,
  LeadConversion,
  LeadConversionInput,
  LeadInput,
  ExtraFields,
  LeadStage,
  LeadTaskInput,
  LeadTaskStatus,
} from "@crm/contracts";
import {
  planLeadStages,
  stageNotEmptyError,
  stageNotFoundError,
} from "../../modules/commercial/stages.js";
import { DomainError } from "../../repository.js";
import type { Pool, PoolClient } from "../../infrastructure/mysql-client.js";
import type { MysqlRepositoryContext } from "./context.js";
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
  branchClause,
} from "./helpers.js";
import { randomUUID } from "node:crypto";
import { branchOrDefault, insertRows, localDate, writeAndRead } from "./sql.js";

/** Etiquetas (array JSON) como texto separado por espaços. */
const tagsText = (column: string) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(CAST(${column} AS CHAR), '", "', ' '), '","', ' '), '["', ''), '"]', ''), '[]', '')`;

/** Termo para `LIKE` sem curingas do usuário. */
const likeTerm = (value: string) =>
  `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * Versão SQL de `matchesLead` (filtros do funil). Os parâmetros começam em `$1`
 * (clínica) e `$2` (filiais); os demais são acrescentados na ordem dos filtros usados.
 */
function leadFilterSql(
  clinicId: string,
  branchIds: string[] | null,
  filter: LeadFilter,
  timezone = "America/Sao_Paulo",
) {
  const params: unknown[] = [clinicId, branchIds];
  const conditions = [
    "clinic_id = $1",
    "deleted_at IS NULL",
    branchClause("branch_id", 2),
  ];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filter.search)
    conditions.push(
      // A colação do banco ignora maiúsculas e acentos (como `normalizeLeadSearch`).
      `CONCAT_WS(' ', full_name, phone, coalesce(email, ''), ${tagsText("tags")}) LIKE ${param(likeTerm(normalizeLeadSearch(filter.search)))}`,
    );
  if (filter.source) conditions.push(`source = ${param(filter.source)}`);
  if (filter.interest) {
    const interest = param(filter.interest);
    conditions.push(
      `(interest = ${interest} OR JSON_CONTAINS(coalesce(JSON_EXTRACT(profile, '$.interests'), '[]'), JSON_QUOTE(${interest})))`,
    );
  }
  if (filter.contactMethod)
    conditions.push(`contact_method = ${param(filter.contactMethod)}`);
  if (filter.lostReason)
    conditions.push(`lost_reason = ${param(filter.lostReason)}`);
  if (filter.stage) conditions.push(`stage = ${param(filter.stage)}`);
  if (filter.responsibleUserId)
    conditions.push(`responsible_user_id = ${param(filter.responsibleUserId)}`);
  if (filter.from || filter.to) {
    // Dia no fuso fixo da clínica (`timezone` mantido na assinatura para o memória).
    void timezone;
    const day = localDate("created_at");
    if (filter.from) conditions.push(`${day} >= ${param(filter.from)}`);
    if (filter.to) conditions.push(`${day} <= ${param(filter.to)}`);
  }
  const openTasks = `EXISTS (SELECT 1 FROM lead_tasks lt WHERE lt.lead_id = leads.id AND lt.status = 'open'`;
  if (filter.tasks === "open") conditions.push(`${openTasks})`);
  if (filter.tasks === "overdue")
    conditions.push(`${openTasks} AND lt.due_at < NOW(6))`);
  if (filter.tasks === "none") conditions.push(`NOT ${openTasks})`);
  const contacted = `EXISTS (SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = leads.id)`;
  if (filter.contact === "with") conditions.push(contacted);
  if (filter.contact === "without") conditions.push(`NOT ${contacted}`);
  return { where: conditions.join(" AND "), params, param };
}

/** Funil salvo da clínica, na ordem (sem linhas = etapas padrão). */
const listStages = (db: Pool | PoolClient, clinicId: string) =>
  db.query<{ stage: string; label: string }>(
    "SELECT stage, label FROM lead_stages WHERE clinic_id = $1 ORDER BY position",
    [clinicId],
  );

export function createCommercialRepository(
  repositoryContext: MysqlRepositoryContext,
) {
  async function createLead(
    clinicId: string,
    input: LeadInput & { extraFields?: ExtraFields },
    db: Pool | PoolClient = repositoryContext.pool,
  ) {
    if (input.responsibleUserId) {
      const responsible = await db.query(
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
    // Participante de evento: origem "Evento: <nome>" e a filial do evento (se tiver).
    const event = input.eventId
      ? (
          await db.query<{
            name: string;
            branchId: string | null;
          }>(
            `SELECT name, branch_id AS "branchId" FROM events
               WHERE clinic_id = $1 AND id = $2
                 AND (branch_id IS NULL OR ${branchClause("branch_id", 3)})`,
            [clinicId, input.eventId, repositoryContext.branchReadIds()],
          )
        ).rows[0]
      : undefined;
    if (input.eventId && !event)
      throw new DomainError("EVENT_NOT_FOUND", "Evento não encontrado.", 404);
    const stage = firstOpenLeadStage(
      resolveLeadStages((await listStages(db, clinicId)).rows),
    );
    const result = await writeAndRead<{ id: string }>(
      db,
      `INSERT INTO leads
         (clinic_id, full_name, phone, email, source, interest, notes,
          responsible_user_id, tags,profile,contact_method,branch_id,stage, id, event_id, extra_fields) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,${branchOrDefault("$12", "$1")},$13, $14, $15, $16)`,
      [
        clinicId,
        input.fullName,
        input.phone,
        input.email || null,
        event ? eventLeadSource(event.name) : input.source,
        input.interest,
        input.notes || null,
        input.responsibleUserId || null,
        input.tags,
        JSON.stringify(leadPatientProfile(input)),
        input.contactMethod ?? null,
        event?.branchId ?? repositoryContext.branchWriteId(),
        stage,
        randomUUID(),
        input.eventId ?? null,
        JSON.stringify(input.extraFields ?? {}),
      ],
      `SELECT id FROM leads WHERE id = $14`,
    );
    return (await repositoryContext.findLead(
      db,
      clinicId,
      result.rows[0]!.id,
    ))!;
  }

  return {
    async listLeads(clinicId: string) {
      const result = await repositoryContext.pool.query<LeadRow>(
        `SELECT ${leadColumns} FROM leads WHERE clinic_id = $1 AND deleted_at IS NULL AND ${branchClause("branch_id", 2)}
         ORDER BY updated_at DESC`,
        [clinicId, repositoryContext.branchReadIds()],
      );
      return result.rows.map(mapLead);
    },

    async findLeadDuplicates(clinicId: string, query: LeadDuplicateQuery) {
      const phone = phoneMatchKey(query.phone),
        email = emailMatchKey(query.email),
        cpf = cpfMatchKey(query.cpf);
      if (!phone && !email && !cpf) return [];
      // O filtro em SQL só pré-seleciona; o helper puro decide os campos coincidentes.
      const params = [
        clinicId,
        phone ? [phone, `55${phone}`] : [],
        email || null,
        cpf || null,
      ];
      const [patients, leads] = await Promise.all([
        repositoryContext.pool.query<ContactDuplicateCandidate>(
          `SELECT id, full_name AS "fullName", phone, email, cpf FROM patients
           WHERE clinic_id = $1 AND merged_into_patient_id IS NULL AND deleted_at IS NULL
             AND (JSON_CONTAINS($2, JSON_QUOTE(REGEXP_REPLACE(phone, '[^0-9]', '')))
               OR ($3 IS NOT NULL AND LOWER(REGEXP_REPLACE(coalesce(email, ''), '[[:space:]]', '')) = $3)
               OR ($4 IS NOT NULL AND REGEXP_REPLACE(coalesce(cpf, ''), '[^0-9]', '') = $4))
           ORDER BY full_name, id LIMIT 20`,
          params,
        ),
        repositoryContext.pool.query<ContactDuplicateCandidate>(
          `SELECT id, full_name AS "fullName", phone, email, JSON_VALUE(profile, '$.cpf') AS cpf FROM leads
           WHERE clinic_id = $1 AND converted_patient_id IS NULL AND deleted_at IS NULL
             AND ($5 IS NULL OR id <> $5)
             AND (JSON_CONTAINS($2, JSON_QUOTE(REGEXP_REPLACE(phone, '[^0-9]', '')))
               OR ($3 IS NOT NULL AND LOWER(REGEXP_REPLACE(coalesce(email, ''), '[[:space:]]', '')) = $3)
               OR ($4 IS NOT NULL AND REGEXP_REPLACE(coalesce(JSON_VALUE(profile, '$.cpf'), ''), '[^0-9]', '') = $4))
           ORDER BY full_name, id LIMIT 20`,
          [...params, query.excludeLeadId || null],
        ),
      ]);
      return findLeadDuplicates(query, patients.rows, leads.rows);
    },

    createLead,
    async importEventParticipants(
      clinicId: string,
      eventId: string,
      inputs: (LeadInput & { extraFields?: ExtraFields })[],
    ) {
      return repositoryContext.inTransaction(async (client) => {
        await client.lock(clinicId);
        const [patients, participants] = await Promise.all([
          client.query<EventImportPatient>(
            `SELECT id, coalesce(merged_into_patient_id, id) AS "canonicalId",
                    full_name AS "fullName", phone, email, cpf
             FROM patients WHERE clinic_id = $1 ORDER BY created_at, id`,
            [clinicId],
          ),
          client.query<ContactDuplicateCandidate>(
            `SELECT id, full_name AS "fullName", phone, email,
                    JSON_VALUE(profile, '$.cpf') AS cpf
             FROM leads WHERE clinic_id = $1 AND event_id = $2`,
            [clinicId, eventId],
          ),
        ]);
        const plans = planEventParticipants(
          inputs,
          patients.rows,
          participants.rows,
        );
        for (const plan of plans) {
          if (plan.kind === "skip") continue;
          const lead = await createLead(
            clinicId,
            { ...plan.input, eventId },
            client,
          );
          if (plan.kind !== "link") continue;
          // Cliente já cadastrado: o participante entra ligado a ele, como um lead convertido.
          await client.query(
            `UPDATE leads SET converted_patient_id = $3, stage = 'won', updated_at = NOW(6)
             WHERE clinic_id = $1 AND id = $2`,
            [clinicId, lead.id, plan.patientId],
          );
          if (plan.input.extraFields)
            await client.query(
              `UPDATE patients SET extra_fields = JSON_MERGE_PATCH(extra_fields, $3), updated_at = NOW(6)
               WHERE clinic_id = $1 AND id = $2`,
              [
                clinicId,
                plan.patientId,
                JSON.stringify(plan.input.extraFields),
              ],
            );
        }
        return countEventParticipantPlans(plans);
      });
    },

    async updateLead(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: LeadInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        await client.lock(clinicId);
        const existing = await repositoryContext.findLead(client, clinicId, id);
        if (!existing) return null;
        if (existing.convertedPatientId)
          throw new DomainError(
            "LEAD_ALREADY_CONVERTED",
            "Atualize o cadastro convertido pelo contexto do cliente.",
            409,
          );
        if (
          input.responsibleUserId &&
          !(
            await client.query(
              "SELECT id FROM users WHERE clinic_id=$1 AND id=$2 AND (active OR id=$3)",
              [
                clinicId,
                input.responsibleUserId,
                existing.responsibleUserId || null,
              ],
            )
          ).rowCount
        )
          throw new DomainError(
            "RESPONSIBLE_USER_NOT_FOUND",
            "Responsável não encontrado.",
            404,
          );
        await client.query(
          `UPDATE leads SET full_name=$3,phone=$4,email=$5,source=$6,interest=$7,notes=$8,responsible_user_id=$9,tags=$10,profile=$11,contact_method=$12,updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2`,
          [
            clinicId,
            id,
            input.fullName,
            input.phone,
            input.email || null,
            input.source,
            input.interest,
            input.notes || null,
            input.responsibleUserId || null,
            input.tags,
            JSON.stringify(leadPatientProfile(input)),
            input.contactMethod || null,
          ],
        );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "lead.updated",
          "lead",
          id,
          {},
        );
        return repositoryContext.findLead(client, clinicId, id);
      });
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
        if (
          !resolveLeadStages((await listStages(client, clinicId)).rows).some(
            (item) => item.stage === stage,
          )
        )
          throw stageNotFoundError();
        await client.query(
          `UPDATE leads SET stage = $3, lost_reason = $4, updated_at = NOW(6)
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
      input?: LeadConversionInput,
    ): Promise<LeadConversion | null> {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        await client.lock(clinicId);
        const leadResult = await client.query<LeadRow>(
          `SELECT ${leadColumns} FROM leads
         WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
          [clinicId, leadId],
        );
        if (!leadResult.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        const original = withConversionInput(
          mapLead(leadResult.rows[0]),
          input,
        );
        let patientResult = original.convertedPatientId
          ? await client.query<PatientRow>(
              `SELECT ${patientColumns} FROM patients
             WHERE clinic_id = $1 AND id = $2`,
              [clinicId, original.convertedPatientId],
            )
          : await client.query<PatientRow>(
              `SELECT ${patientColumns} FROM patients
             WHERE clinic_id = $1 AND (phone = $2 OR ($3 IS NOT NULL AND lower(email) = lower($3)) OR ($4 IS NOT NULL AND cpf=$4))
             ORDER BY created_at LIMIT 1`,
              [
                clinicId,
                original.phone,
                original.email || null,
                original.cpf || null,
              ],
            );
        if (original.convertedPatientId && !patientResult.rows[0]) {
          throw new DomainError(
            "LEAD_PATIENT_NOT_FOUND",
            "O cliente vinculado a este lead não foi encontrado.",
            409,
          );
        }
        if (patientResult.rows[0]) {
          const matched = mapPatient(patientResult.rows[0]);
          if (matched.mergedIntoPatientId)
            patientResult = await client.query<PatientRow>(
              `SELECT ${patientColumns} FROM patients WHERE clinic_id=$1 AND id=$2 FOR UPDATE`,
              [clinicId, matched.mergedIntoPatientId],
            );
        }
        const reusedExisting = Boolean(patientResult.rows[0]);
        let patient = patientResult.rows[0]
          ? mapPatient(patientResult.rows[0])
          : undefined;
        if (!original.convertedPatientId) {
          const data = leadConversionData(original, patient);
          await ensurePatientTags(client, clinicId, data.tags);
          if (!patient)
            patient = await repositoryContext.insertPatient(
              client,
              clinicId,
              data,
            );
          else {
            patientResult = await writeAndRead<PatientRow>(
              client,
              `UPDATE patients SET profile=$3,cpf=$4,whatsapp=$5,birth_date=$6,emergency_contact_name=$7,emergency_contact_phone=$8,notes=$9,email=$10,tags=$11,extra_fields=JSON_MERGE_PATCH(extra_fields,$12),updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2`,
              [
                clinicId,
                patient.id,
                JSON.stringify(patientProfile(data)),
                data.cpf || null,
                data.whatsapp || null,
                data.birthDate || null,
                data.emergencyContactName || null,
                data.emergencyContactPhone || null,
                data.notes || null,
                data.email || null,
                data.tags,
                JSON.stringify(data.extraFields ?? {}),
              ],
              `SELECT ${patientColumns} FROM patients WHERE clinic_id=$1 AND id=$2`,
            );
            patient = mapPatient(patientResult.rows[0]!);
          }
        }
        if (!patient)
          throw new DomainError(
            "LEAD_PATIENT_NOT_FOUND",
            "Cliente da conversão não encontrado.",
            409,
          );
        await client.query(
          `UPDATE appointments SET patient_id = $3, lead_id = NULL, updated_at = NOW(6)
         WHERE clinic_id = $1 AND lead_id = $2`,
          [clinicId, leadId, patient.id],
        );
        if (!original.convertedPatientId) {
          await client.query(
            `UPDATE leads SET stage = 'won', converted_patient_id = $3,
                  lost_reason = NULL, updated_at = NOW(6)
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
                lc.channel, lc.contact_method AS "contactMethod", lc.direction, lc.notes, lc.reached, u.full_name AS "actorName",
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
      return repositoryContext.inTransaction(async (client) => {
        const inserted = await writeAndRead<{ id: string }>(
          client,
          `INSERT INTO lead_contacts
         (id, clinic_id, lead_id, actor_user_id, channel, direction, notes, occurred_at, contact_method, reached)
       SELECT $9, $1, l.id, u.id, $4, $5, $6, $7, $8, $10
       FROM leads l JOIN users u ON u.clinic_id = l.clinic_id AND u.id = $3
       WHERE l.clinic_id = $1 AND l.id = $2`,
          [
            clinicId,
            leadId,
            actorUserId,
            input.channel,
            input.direction,
            input.notes,
            input.occurredAt ?? new Date().toISOString(),
            input.contactMethod || null,
            randomUUID(),
            input.reached === false ? 0 : 1,
          ],
          "SELECT id FROM lead_contacts WHERE id = $9",
        );
        if (!inserted.rows[0]) return null;
        await client.query(
          `UPDATE leads SET updated_at = NOW(6),contact_method=coalesce(nullif(contact_method,''),$3) WHERE clinic_id = $1 AND id = $2`,
          [clinicId, leadId, input.contactMethod || null],
        );
        return repositoryContext.findLeadContact(
          clinicId,
          inserted.rows[0].id,
          client,
        );
      });
    },

    async createLeadTask(
      clinicId: string,
      actorUserId: string,
      leadId: string,
      input: LeadTaskInput,
    ) {
      const assignedUserId = input.assignedUserId || actorUserId;
      const inserted = await writeAndRead<{ id: string }>(
        repositoryContext.pool,
        `INSERT INTO lead_tasks
         (id, clinic_id, lead_id, title, notes, due_at, assigned_user_id,
          created_by_user_id)
       SELECT $8, $1, l.id, $4, $5, $6, assigned.id, creator.id
       FROM leads l
       JOIN users creator
         ON creator.clinic_id = l.clinic_id AND creator.id = $3
       JOIN users assigned
         ON assigned.clinic_id = l.clinic_id AND assigned.id = $7 AND assigned.active
       WHERE l.clinic_id = $1 AND l.id = $2`,
        [
          clinicId,
          leadId,
          actorUserId,
          input.title,
          input.notes || null,
          input.dueAt,
          assignedUserId,
          randomUUID(),
        ],
        "SELECT id FROM lead_tasks WHERE id = $8",
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
        `UPDATE leads SET updated_at = NOW(6) WHERE clinic_id = $1 AND id = $2`,
        [clinicId, leadId],
      );
      return repositoryContext.findLeadTask(clinicId, inserted.rows[0].id);
    },

    async updateLeadTaskStatus(
      clinicId: string,
      taskId: string,
      status: LeadTaskStatus,
    ) {
      const result = await writeAndRead(
        repositoryContext.pool,
        `UPDATE lead_tasks SET status = $3,
              completed_at = CASE WHEN $3 = 'completed' THEN NOW(6) ELSE NULL END,
              updated_at = NOW(6)
       WHERE clinic_id = $1 AND id = $2`,
        [clinicId, taskId, status],
        `SELECT id FROM lead_tasks WHERE clinic_id = $1 AND id = $2`,
      );
      return result.rows[0]
        ? repositoryContext.findLeadTask(clinicId, taskId)
        : null;
    },

    async listLeadStagePage(
      clinicId: string,
      stage: LeadStage,
      filter: LeadFilter,
      page: LeadPage,
      timezone?: string,
    ): Promise<LeadStagePage> {
      // Filtro de etapa diferente da coluna: a coluna fica vazia sem ir ao banco.
      if (filter.stage && filter.stage !== stage)
        return { stage, total: 0, overdue: 0, leads: [] };
      const query = leadFilterSql(
        clinicId,
        repositoryContext.branchReadIds(),
        { ...filter, stage },
        timezone,
      );
      const count = await repositoryContext.pool.query<{
        total: number;
        overdue: number;
      }>(
        `SELECT COUNT(*) AS total,
           COUNT(CASE WHEN EXISTS (
             SELECT 1 FROM lead_tasks lt WHERE lt.lead_id = leads.id
               AND lt.status = 'open' AND lt.due_at < NOW(6)) THEN 1 END) AS overdue
         FROM leads WHERE ${query.where}`,
        query.params,
      );
      const total = count.rows[0]?.total ?? 0,
        overdue = count.rows[0]?.overdue ?? 0;
      if (!total || page.offset >= total)
        return { stage, total, overdue, leads: [] };
      // Ordem coberta pelo índice leads_pipeline_idx; as subqueries de `leadColumns`
      // (tarefas, contato, responsável) só rodam nas linhas da página.
      const limit = query.param(page.limit),
        offset = query.param(page.offset);
      const result = await repositoryContext.pool.query<LeadRow>(
        `SELECT ${leadColumns} FROM leads WHERE ${query.where}
         ORDER BY updated_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`,
        query.params,
      );
      return { stage, total, overdue, leads: result.rows.map(mapLead) };
    },

    async summarizeLeads(
      clinicId: string,
      filter: LeadFilter,
      timezone?: string,
    ) {
      const query = leadFilterSql(
        clinicId,
        repositoryContext.branchReadIds(),
        filter,
        timezone,
      );
      const result = await repositoryContext.pool.query<LeadInsightGroup>(
        `SELECT stage, coalesce(source, '') AS source,
           coalesce(contact_method, '') AS "contactMethod",
           coalesce(lost_reason, '') AS "lostReason",
           COUNT(*) AS leads,
           CAST(coalesce(SUM(open_tasks), 0) AS SIGNED) AS "openTasks",
           CAST(coalesce(SUM(overdue_tasks), 0) AS SIGNED) AS "overdueTasks",
           COUNT(CASE WHEN without_contact THEN 1 END) AS "withoutContact"
         FROM (
           SELECT leads.stage, leads.source, leads.contact_method, leads.lost_reason,
             (SELECT COUNT(*) FROM lead_tasks lt
               WHERE lt.lead_id = leads.id AND lt.status = 'open') AS open_tasks,
             (SELECT COUNT(*) FROM lead_tasks lt
               WHERE lt.lead_id = leads.id AND lt.status = 'open' AND lt.due_at < NOW(6)) AS overdue_tasks,
             NOT EXISTS (SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = leads.id) AS without_contact
           FROM leads WHERE ${query.where}
         ) grouped
         GROUP BY 1, 2, 3, 4`,
        query.params,
      );
      return buildLeadInsightsFromGroups(result.rows);
    },

    async listLeadFilterOptions(clinicId: string): Promise<LeadFilterOptions> {
      const params = [clinicId, repositoryContext.branchReadIds()];
      const scope = `clinic_id = $1 AND ${branchClause("branch_id", 2)}`;
      const distinct = async (expression: string, from = "leads") =>
        (
          await repositoryContext.pool.query<{ value: string }>(
            `SELECT DISTINCT ${expression} AS value FROM ${from}
             WHERE ${scope} AND coalesce(${expression}, '') <> ''
             ORDER BY 1`,
            params,
          )
        ).rows
          .map((row) => row.value)
          .sort((a, b) => a.localeCompare(b, "pt-BR"));
      const [
        sources,
        interests,
        profileInterests,
        contactMethods,
        lostReasons,
        responsibles,
      ] = await Promise.all([
        distinct("source"),
        distinct("interest"),
        distinct(
          "interests.item",
          "leads CROSS JOIN JSON_TABLE(CASE WHEN JSON_TYPE(JSON_EXTRACT(profile, '$.interests')) = 'ARRAY' THEN JSON_EXTRACT(profile, '$.interests') ELSE '[]' END, '$[*]' COLUMNS (item VARCHAR(255) PATH '$')) AS interests",
        ),
        distinct("contact_method"),
        distinct("lost_reason"),
        repositoryContext.pool.query<{ id: string; name: string }>(
          `SELECT DISTINCT u.id, u.full_name AS name FROM leads
             JOIN users u ON u.id = leads.responsible_user_id
             WHERE leads.clinic_id = $1 AND ${branchClause("leads.branch_id", 2)}`,
          params,
        ),
      ]);
      return {
        sources,
        interests: [...new Set([...interests, ...profileInterests])].sort(
          (a, b) => a.localeCompare(b, "pt-BR"),
        ),
        contactMethods,
        lostReasons,
        responsibles: responsibles.rows.sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR"),
        ),
      };
    },

    async listLeadStages(clinicId: string) {
      return resolveLeadStages(
        (await listStages(repositoryContext.pool, clinicId)).rows,
      );
    },

    async saveLeadStages(clinicId: string, input: LeadStagesInput) {
      return repositoryContext.inTransaction(async (client) => {
        // Uma edição do funil por vez na clínica; trava os leads das etapas afetadas.
        await client.lock(`lead_stages:${clinicId}`);
        const plan = planLeadStages(
          resolveLeadStages((await listStages(client, clinicId)).rows),
          input,
        );
        for (const item of plan.mustBeEmpty) {
          const leads = (
            await client.query(
              "SELECT id FROM leads WHERE clinic_id = $1 AND stage = $2 FOR UPDATE",
              [clinicId, item.stage],
            )
          ).rowCount;
          if (leads) throw stageNotEmptyError(item, leads);
        }
        await client.query("DELETE FROM lead_stages WHERE clinic_id = $1", [
          clinicId,
        ]);
        await insertRows(
          client,
          "lead_stages",
          plan.stages.map((item, position) => ({
            clinic_id: clinicId,
            stage: item.stage,
            label: item.label,
            position,
          })),
        );
        return resolveLeadStages(plan.stages);
      });
    },
  };
}
