import {
  leadConversionData,
  withConversionInput,
} from "../../modules/commercial/conversion.js";
import { leadPatientProfile } from "@crm/contracts/commercial";
import {
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
import type { Pool, PoolClient } from "pg";
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
  branchClause,
} from "./helpers.js";

/** Mesma tabela de acentos da migração 0044 (sem depender da extensão unaccent). */
const unaccented = (expression: string) =>
  `lower(translate(${expression},
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY'))`;

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
  const conditions = ["clinic_id = $1", branchClause("branch_id", 2)];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filter.search)
    conditions.push(
      `strpos(${unaccented(
        "concat_ws(' ', full_name, phone, coalesce(email, ''), array_to_string(tags, ' '))",
      )}, ${param(normalizeLeadSearch(filter.search))}) > 0`,
    );
  if (filter.source) conditions.push(`source = ${param(filter.source)}`);
  if (filter.interest) {
    const interest = param(filter.interest);
    conditions.push(
      `(interest = ${interest} OR coalesce(profile->'interests', '[]'::jsonb) ? ${interest})`,
    );
  }
  if (filter.contactMethod)
    conditions.push(`contact_method = ${param(filter.contactMethod)}`);
  if (filter.lostReason)
    conditions.push(`lost_reason = ${param(filter.lostReason)}`);
  if (filter.stage) conditions.push(`stage = ${param(filter.stage)}`);
  if (filter.responsibleUserId)
    conditions.push(
      `responsible_user_id = ${param(filter.responsibleUserId)}::uuid`,
    );
  if (filter.from || filter.to) {
    const day = `(created_at AT TIME ZONE ${param(timezone)})::date`;
    if (filter.from) conditions.push(`${day} >= ${param(filter.from)}::date`);
    if (filter.to) conditions.push(`${day} <= ${param(filter.to)}::date`);
  }
  const openTasks = `EXISTS (SELECT 1 FROM lead_tasks lt WHERE lt.lead_id = leads.id AND lt.status = 'open'`;
  if (filter.tasks === "open") conditions.push(`${openTasks})`);
  if (filter.tasks === "overdue")
    conditions.push(`${openTasks} AND lt.due_at < now())`);
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
  repositoryContext: PostgresRepositoryContext,
) {
  return {
    async listLeads(clinicId: string) {
      const result = await repositoryContext.pool.query<LeadRow>(
        `SELECT ${leadColumns} FROM leads WHERE clinic_id = $1 AND ${branchClause("branch_id", 2)}
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
           WHERE clinic_id = $1 AND merged_into_patient_id IS NULL
             AND (regexp_replace(phone, '\\D', '', 'g') = ANY($2::text[])
               OR ($3::text IS NOT NULL AND lower(regexp_replace(coalesce(email, ''), '\\s', '', 'g')) = $3)
               OR ($4::text IS NOT NULL AND regexp_replace(coalesce(cpf, ''), '\\D', '', 'g') = $4))
           ORDER BY full_name, id LIMIT 20`,
          params,
        ),
        repositoryContext.pool.query<ContactDuplicateCandidate>(
          `SELECT id, full_name AS "fullName", phone, email, profile->>'cpf' AS cpf FROM leads
           WHERE clinic_id = $1 AND converted_patient_id IS NULL
             AND ($5::uuid IS NULL OR id <> $5::uuid)
             AND (regexp_replace(phone, '\\D', '', 'g') = ANY($2::text[])
               OR ($3::text IS NOT NULL AND lower(regexp_replace(coalesce(email, ''), '\\s', '', 'g')) = $3)
               OR ($4::text IS NOT NULL AND regexp_replace(coalesce(profile->>'cpf', ''), '\\D', '', 'g') = $4))
           ORDER BY full_name, id LIMIT 20`,
          [...params, query.excludeLeadId || null],
        ),
      ]);
      return findLeadDuplicates(query, patients.rows, leads.rows);
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
      const stage = firstOpenLeadStage(
        resolveLeadStages(
          (await listStages(repositoryContext.pool, clinicId)).rows,
        ),
      );
      const result = await repositoryContext.pool.query<{ id: string }>(
        `INSERT INTO leads
         (clinic_id, full_name, phone, email, source, interest, notes,
          responsible_user_id, tags,profile,contact_method,branch_id,stage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)
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
          JSON.stringify(leadPatientProfile(input)),
          input.contactMethod ?? null,
          repositoryContext.branchWriteId(),
          stage,
        ],
      );
      return (await repositoryContext.findLead(
        repositoryContext.pool,
        clinicId,
        result.rows[0]!.id,
      ))!;
    },

    async updateLead(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: LeadInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
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
          `UPDATE leads SET full_name=$3,phone=$4,email=$5,source=$6,interest=$7,notes=$8,responsible_user_id=$9,tags=$10,profile=$11::jsonb,contact_method=$12,updated_at=now() WHERE clinic_id=$1 AND id=$2`,
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
      input?: LeadConversionInput,
    ): Promise<LeadConversion | null> {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
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
             WHERE clinic_id = $1 AND (phone = $2 OR ($3::text IS NOT NULL AND lower(email) = lower($3)) OR ($4::text IS NOT NULL AND cpf=$4))
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
            patientResult = await client.query<PatientRow>(
              `UPDATE patients SET profile=$3::jsonb,cpf=$4,whatsapp=$5,birth_date=$6,emergency_contact_name=$7,emergency_contact_phone=$8,notes=$9,email=$10,tags=$11,updated_at=now() WHERE clinic_id=$1 AND id=$2 RETURNING ${patientColumns}`,
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
              ],
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
                lc.channel, lc.contact_method AS "contactMethod", lc.direction, lc.notes, u.full_name AS "actorName",
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
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO lead_contacts
         (clinic_id, lead_id, actor_user_id, channel, direction, notes, occurred_at, contact_method)
       SELECT $1, l.id, u.id, $4, $5, $6, $7, $8
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
            input.contactMethod || null,
          ],
        );
        if (!inserted.rows[0]) return null;
        await client.query(
          `UPDATE leads SET updated_at = now(),contact_method=coalesce(nullif(contact_method,''),$3) WHERE clinic_id = $1 AND id = $2`,
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
        `SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM lead_tasks lt WHERE lt.lead_id = leads.id
               AND lt.status = 'open' AND lt.due_at < now()))::int AS overdue
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
           COUNT(*)::int AS leads,
           coalesce(SUM(tasks.open), 0)::int AS "openTasks",
           coalesce(SUM(tasks.overdue), 0)::int AS "overdueTasks",
           COUNT(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = leads.id))::int AS "withoutContact"
         FROM leads
         CROSS JOIN LATERAL (
           SELECT COUNT(*) AS open, COUNT(*) FILTER (WHERE lt.due_at < now()) AS overdue
           FROM lead_tasks lt WHERE lt.lead_id = leads.id AND lt.status = 'open'
         ) tasks
         WHERE ${query.where}
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
          "interests.value",
          "leads CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(profile->'interests') = 'array' THEN profile->'interests' ELSE '[]'::jsonb END) AS interests(value)",
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
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`lead_stages:${clinicId}`],
        );
        const plan = planLeadStages(
          resolveLeadStages((await listStages(client, clinicId)).rows),
          input,
        );
        for (const item of plan.mustBeEmpty) {
          const leads = (
            await client.query<{ total: number }>(
              `SELECT COUNT(*)::int AS total FROM (
                 SELECT 1 FROM leads WHERE clinic_id = $1 AND stage = $2 FOR UPDATE
               ) locked`,
              [clinicId, item.stage],
            )
          ).rows[0]!.total;
          if (leads) throw stageNotEmptyError(item, leads);
        }
        await client.query("DELETE FROM lead_stages WHERE clinic_id = $1", [
          clinicId,
        ]);
        await client.query(
          `INSERT INTO lead_stages (clinic_id, stage, label, position)
           SELECT $1, item.stage, item.label, item.position - 1
           FROM unnest($2::text[], $3::text[]) WITH ORDINALITY
             AS item(stage, label, position)`,
          [
            clinicId,
            plan.stages.map((item) => item.stage),
            plan.stages.map((item) => item.label),
          ],
        );
        return resolveLeadStages(plan.stages);
      });
    },
  };
}
