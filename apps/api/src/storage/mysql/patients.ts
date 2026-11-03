import {
  auditChangesOf,
  type GuidedPatientInput,
  type GuidedPatientResult,
  type PatientImportInput,
  type PatientUpdateInput,
  type PatientPlan,
  type PatientPlanInput,
  type PatientTagInput,
  patientTagKey,
  patientProfile,
  type PatientTagUpdate,
  type ReceivedPayment,
} from "@crm/contracts";
import {
  guidedPlansResult,
  guidedSubscriptions,
} from "../../modules/patients/guided-plans.js";
import {
  buildPatientTimeline,
  patientEditAction,
} from "../../modules/patients/patient-timeline.js";
import {
  DomainError,
  patientTagDuplicateError,
  patientTagInUseError,
} from "../../repository.js";
import type { MysqlRepositoryContext } from "./context.js";
import {
  appointmentColumns,
  appointmentJoins,
  type AppointmentRow,
  hasDatabaseCode,
  mapAppointment,
  mapOutboundMessage,
  mapPatient,
  mapPatientTag,
  outboundMessageColumns,
  type OutboundMessageRow,
  patientColumns,
  type PatientRow,
  patientTagColumns,
  type PatientTagRow,
  json,
  phoneSearchDigits,
} from "./helpers.js";
import { randomUUID } from "node:crypto";
import { replaceJsonKeys, writeAndRead } from "./sql.js";

export function createPatientsRepository(
  repositoryContext: MysqlRepositoryContext,
) {
  return {
    async getPatientTimeline(clinicId: string, patientId: string) {
      const patient = await repositoryContext.pool.query(
        `SELECT 1 FROM patients WHERE clinic_id = $1 AND id = $2`,
        [clinicId, patientId],
      );
      if (!patient.rows[0]) return null;
      const [
        appointments,
        plans,
        payments,
        contacts,
        messages,
        surveys,
        edits,
      ] = await Promise.all([
        repositoryContext.pool.query<AppointmentRow>(
          `SELECT ${appointmentColumns} FROM appointments a ${appointmentJoins}
           WHERE a.clinic_id = $1 AND a.patient_id = $2`,
          [clinicId, patientId],
        ),
        repositoryContext.operations.listPatientPlans(clinicId, patientId),
        repositoryContext.pool.query<{
          id: string;
          receivableId: string;
          kind: "payment" | "payment_reversal";
          patientId: string;
          patientName: string;
          planId: string | null;
          tabId: string | null;
          description: string;
          amountInCents: number;
          occurredAt: Date;
          paymentMethod: ReceivedPayment["paymentMethod"] | null;
        }>(
          `SELECT fe.id, fe.receivable_id AS "receivableId", fe.kind,
                  r.patient_id AS "patientId", p.full_name AS "patientName",
                  r.plan_id AS "planId", t.id AS "tabId", r.description,
                  fe.amount_in_cents AS "amountInCents", fe.created_at AS "occurredAt",
                  JSON_VALUE(fe.metadata, '$.paymentMethod') AS "paymentMethod"
           FROM financial_events fe
           JOIN receivables r ON r.id=fe.receivable_id
           JOIN patients p ON p.id=r.patient_id
           LEFT JOIN patient_tabs t ON t.receivable_id=r.id
           WHERE fe.clinic_id=$1 AND r.patient_id=$2
             AND fe.kind IN ('payment','payment_reversal')`,
          [clinicId, patientId],
        ),
        repositoryContext.operations.listContactActivities(clinicId, patientId),
        repositoryContext.pool.query<OutboundMessageRow>(
          `SELECT ${outboundMessageColumns}
           FROM outbound_messages om
           JOIN patients p ON p.id = om.patient_id
           WHERE om.clinic_id = $1 AND om.patient_id = $2`,
          [clinicId, patientId],
        ),
        repositoryContext.operations.listSatisfactionSurveys(clinicId, {
          patientId,
        }),
        repositoryContext.pool.query<{
          id: string;
          occurredAt: Date;
          actorName: string | null;
          metadata: unknown;
        }>(
          `SELECT ae.id, ae.created_at AS "occurredAt", u.full_name AS "actorName", ae.metadata
           FROM audit_events ae
           LEFT JOIN users u ON u.id = ae.actor_user_id
           WHERE ae.clinic_id = $1 AND ae.action = $2 AND ae.entity_id = $3`,
          [clinicId, patientEditAction, patientId],
        ),
      ]);
      return buildPatientTimeline(patientId, {
        appointments: appointments.rows.map(mapAppointment),
        plans,
        payments: payments.rows.map((item): ReceivedPayment => ({
          id: item.id,
          receivableId: item.receivableId,
          kind: item.kind === "payment" ? "payment" : "reversal",
          ...(item.planId || item.tabId
            ? { sourceId: item.planId ?? item.tabId! }
            : {}),
          occurredAt: item.occurredAt.toISOString(),
          patientId: item.patientId,
          patientName: item.patientName,
          description: item.description,
          amountInCents: item.amountInCents,
          ...(item.paymentMethod ? { paymentMethod: item.paymentMethod } : {}),
        })),
        contacts,
        messages: messages.rows.map(mapOutboundMessage),
        surveys,
        edits: edits.rows.map((row) => {
          const metadata = json<Record<string, unknown>>(row.metadata) ?? {};
          return {
            id: row.id,
            occurredAt: row.occurredAt.toISOString(),
            actorName: row.actorName ?? undefined,
            changes: auditChangesOf(metadata),
            reason:
              typeof metadata.reason === "string" ? metadata.reason : undefined,
          };
        }),
      });
    },

    async listPatients(clinicId: string, search = "") {
      const term = search.trim();
      const result = await repositoryContext.pool.query<PatientRow>(
        `
        SELECT ${patientColumns}
        FROM patients
        WHERE clinic_id = $1 AND merged_into_patient_id IS NULL
          AND (
            $2 = '' OR full_name LIKE '%' || $2 || '%' OR coalesce(cpf, '') LIKE '%' || $2 || '%'
            -- A colação utf8mb4_unicode_ci ignora maiúsculas e acentos: "andre" acha "André".
            OR full_name LIKE '%' || $5 || '%'
            OR CONVERT(coalesce(JSON_VALUE(profile, '$.nickname'), '') USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE '%' || $5 || '%'
            OR coalesce(email, '') LIKE '%' || $2 || '%' OR phone LIKE '%' || $2 || '%'
            OR ($3 <> '' AND (phone LIKE '%' || $3 || '%' OR coalesce(whatsapp, '') LIKE '%' || $3 || '%'))
            OR ($4 <> '' AND REGEXP_REPLACE(coalesce(cpf, ''), '[^0-9]', '') LIKE '%' || $4 || '%')
            OR record_number LIKE '%' || $2 || '%'
          )
        ORDER BY full_name
      `,
        [
          clinicId,
          term,
          phoneSearchDigits(term),
          /^[\d\s.-]+$/.test(term) ? term.replace(/\D/g, "") : "",
          // Termo sem acentos (NFD sem marcas) para comparar com o nome traduzido.
          term.normalize("NFD").replace(/[̀-ͯ]/g, ""),
        ],
      );
      return result.rows.map(mapPatient);
    },

    async createPatient(clinicId: string, input: PatientImportInput) {
      return repositoryContext.insertPatient(
        repositoryContext.pool,
        clinicId,
        input,
      );
    },

    async createPatientWithNextStep(
      clinicId: string,
      actorUserId: string,
      input: GuidedPatientInput,
    ): Promise<GuidedPatientResult> {
      return repositoryContext.inTransaction(async (client) => {
        const subscriptions = guidedSubscriptions(input);
        for (const item of subscriptions) {
          if (!item.groupId) continue;
          const group = await client.query<{ serviceId: string }>(
            `SELECT service_id AS "serviceId" FROM group_classes
           WHERE clinic_id = $1 AND id = $2 AND active`,
            [clinicId, item.groupId],
          );
          if (!group.rows[0])
            throw new DomainError(
              "GROUP_OR_PATIENT_NOT_FOUND",
              "Turma ou cliente ativo não encontrado.",
              404,
            );
          if (
            !item.plan.services.some(
              (entry) => entry.serviceId === group.rows[0]!.serviceId,
            )
          )
            throw new DomainError(
              "GROUP_SERVICE_MISMATCH",
              "A turma escolhida não é do serviço do plano.",
              400,
            );
        }
        const patient = await repositoryContext.insertPatient(
          client,
          clinicId,
          input.patient,
        );
        if (input.next === "none") return { patient };
        if (input.next === "demonstration") {
          const related = await client.query<{ durationMinutes: number }>(
            `
            SELECT s.duration_minutes AS "durationMinutes"
            FROM professionals pr, rooms r, services s
            WHERE pr.id = $2 AND pr.clinic_id = $1 AND pr.active = true
              AND r.id = $3 AND r.clinic_id = $1 AND r.active = true
              AND s.id = $4 AND s.clinic_id = $1 AND s.active = true
          `,
            [
              clinicId,
              input.appointment.professionalId,
              input.appointment.roomId,
              input.appointment.serviceId,
            ],
          );
          if (!related.rows[0])
            throw new DomainError(
              "RELATED_RECORD_NOT_FOUND",
              "Cliente, profissional, sala ou serviço não encontrado.",
              404,
            );
          const appointment = await repositoryContext.insertAppointment(
            clinicId,
            { ...input.appointment, visitType: "trial" },
            related.rows[0].durationMinutes,
            { patientId: patient.id, leadId: null },
            client,
          );
          return { patient, appointment };
        }
        const insertPlan = async (
          plan: PatientPlanInput,
        ): Promise<PatientPlan> => {
          const planId = await repositoryContext.insertPatientPlan(
            client,
            clinicId,
            actorUserId,
            plan,
            "Crédito inicial do plano",
          );
          return (await repositoryContext.findPatientPlan(
            client,
            clinicId,
            planId,
          ))!;
        };
        if (input.next === "single")
          return {
            patient,
            plan: await insertPlan({
              ...input.plan,
              patientId: patient.id,
              kind: "single",
            }),
          };
        const created: NonNullable<GuidedPatientResult["additionalPlans"]> = [];
        for (const item of subscriptions) {
          const plan = await insertPlan({
            ...item.plan,
            patientId: patient.id,
          });
          created.push(
            item.groupId
              ? {
                  plan,
                  enrollment: await repositoryContext.insertGroupEnrollment(
                    client,
                    clinicId,
                    { groupId: item.groupId, patientId: patient.id },
                  ),
                }
              : { plan },
          );
        }
        return guidedPlansResult(patient, created, input);
      });
    },

    async importPatients(clinicId: string, inputs: PatientImportInput[]) {
      if (inputs.length === 0) return { created: 0, skipped: 0 };
      return repositoryContext.inTransaction(async (client) => {
        // Serializa importações da mesma clínica para a checagem de duplicados valer até o COMMIT.
        await client.query("SELECT id FROM clinics WHERE id = $1 FOR UPDATE", [
          clinicId,
        ]);
        const existing = await client.query<{
          cpf: string | null;
          phone: string;
        }>(
          `SELECT REGEXP_REPLACE(coalesce(cpf, ''), '[^0-9]', '') AS cpf,
                REGEXP_REPLACE(phone, '[^0-9]', '') AS phone
         FROM patients WHERE clinic_id = $1`,
          [clinicId],
        );
        const cpfs = new Set<string>();
        const phones = new Set<string>();
        for (const row of existing.rows) {
          if (row.cpf) cpfs.add(row.cpf);
          phones.add(row.phone);
        }
        const digits = (value: string | undefined) =>
          (value ?? "").replace(/\D/g, "");
        let created = 0;
        let skipped = 0;
        for (const input of inputs) {
          const cpf = digits(input.cpf);
          const phone = digits(input.phone);
          if ((cpf && cpfs.has(cpf)) || phones.has(phone)) {
            skipped += 1;
            continue;
          }
          if (cpf) cpfs.add(cpf);
          phones.add(phone);
          await repositoryContext.insertPatient(client, clinicId, input);
          created += 1;
        }
        return { created, skipped };
      });
    },

    async updatePatient(
      clinicId: string,
      patientId: string,
      input: PatientUpdateInput,
    ) {
      const profile = patientProfile(input);
      try {
        const result = await writeAndRead<PatientRow>(
          repositoryContext.pool,
          `UPDATE patients SET full_name = $3, cpf = $4, email = $5,
                phone = $6, whatsapp = $7, birth_date = $8, emergency_contact_name = $9,
                emergency_contact_phone = $10, notes = $11, tags = $12,
                profile = ${replaceJsonKeys("profile", "$13", profile)}, updated_at = NOW(6)
         WHERE clinic_id = $1 AND id = $2`,
          [
            clinicId,
            patientId,
            input.fullName,
            input.cpf || null,
            input.email || null,
            input.phone,
            input.whatsapp || null,
            input.birthDate || null,
            input.emergencyContactName || null,
            input.emergencyContactPhone || null,
            input.notes || null,
            input.tags,
            JSON.stringify(profile),
          ],
          `SELECT ${patientColumns} FROM patients WHERE clinic_id = $1 AND id = $2`,
        );
        return result.rows[0] ? mapPatient(result.rows[0]) : null;
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "PATIENT_DUPLICATE",
            "Já existe um cliente com este CPF.",
            409,
          );
        throw error;
      }
    },

    async listPatientTags(clinicId: string) {
      const result = await repositoryContext.pool.query<PatientTagRow>(
        `SELECT ${patientTagColumns} FROM patient_tags pt WHERE pt.clinic_id = $1`,
        [clinicId],
      );
      return result.rows
        .map(mapPatientTag)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },

    async listOverduePatientIds(clinicId: string, today: string) {
      // Mesma regra de `isOverdueReceivable` (contracts): em aberto e vencida antes de hoje.
      const result = await repositoryContext.pool.query<{ patientId: string }>(
        `SELECT DISTINCT patient_id AS "patientId" FROM receivables
         WHERE clinic_id = $1 AND status = 'open' AND due_date < $2
           AND patient_id IS NOT NULL`,
        [clinicId, today],
      );
      return result.rows.map((row) => row.patientId);
    },

    async createPatientTag(
      clinicId: string,
      actorUserId: string,
      input: PatientTagInput,
    ) {
      try {
        return await repositoryContext.inTransaction(async (client) => {
          const inserted = await writeAndRead<{ id: string }>(
            client,
            `INSERT INTO patient_tags (clinic_id, name, name_key, color, category, id) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              clinicId,
              input.name,
              patientTagKey(input.name),
              input.color,
              input.category ?? null,
              randomUUID(),
            ],
            `SELECT id FROM patient_tags WHERE id = $6`,
          );
          const tag = (await repositoryContext.getPatientTag(
            client,
            clinicId,
            inserted.rows[0]!.id,
          ))!;
          await repositoryContext.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "patient_tag.created",
            "patient_tag",
            tag.id,
            {
              name: tag.name,
              color: tag.color,
            },
          );
          return tag;
        });
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw patientTagDuplicateError(input.name);
        throw error;
      }
    },

    async updatePatientTag(
      clinicId: string,
      actorUserId: string,
      tagId: string,
      input: PatientTagUpdate,
    ) {
      try {
        return await repositoryContext.inTransaction(async (client) => {
          const current = await client.query<{ name: string }>(
            `SELECT name FROM patient_tags WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
            [clinicId, tagId],
          );
          if (!current.rows[0]) return null;
          const previousName = current.rows[0].name;
          const name = input.name ?? previousName;
          await client.query(
            `UPDATE patient_tags
           SET name = $3, name_key = $4, color = coalesce($5, color),
               category = CASE WHEN $6 THEN $7 ELSE category END,
               updated_at = NOW(6)
           WHERE clinic_id = $1 AND id = $2`,
            [
              clinicId,
              tagId,
              name,
              patientTagKey(name),
              input.color ?? null,
              input.category !== undefined,
              input.category ?? null,
            ],
          );
          let patientsUpdated = 0;
          if (name !== previousName) {
            const renamed = await client.query<{ id: string; tags: string[] }>(
              `SELECT id, tags FROM patients
             WHERE clinic_id = $1 AND JSON_CONTAINS(tags, JSON_QUOTE($2)) FOR UPDATE`,
              [clinicId, previousName],
            );
            for (const patient of renamed.rows)
              await client.query(
                "UPDATE patients SET tags = $2 WHERE id = $1",
                [
                  patient.id,
                  json<string[]>(patient.tags).map((tag) =>
                    tag === previousName ? name : tag,
                  ),
                ],
              );
            patientsUpdated = renamed.rowCount;
          }
          const tag = (await repositoryContext.getPatientTag(
            client,
            clinicId,
            tagId,
          ))!;
          await repositoryContext.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "patient_tag.updated",
            "patient_tag",
            tag.id,
            {
              name: tag.name,
              color: tag.color,
              ...(name !== previousName
                ? { previousName, patientsUpdated }
                : {}),
            },
          );
          return tag;
        });
      } catch (error) {
        if (hasDatabaseCode(error, "23505"))
          throw patientTagDuplicateError(input.name ?? "");
        throw error;
      }
    },

    async deletePatientTag(
      clinicId: string,
      actorUserId: string,
      tagId: string,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const current = await client.query<{ id: string }>(
          `SELECT id FROM patient_tags WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
          [clinicId, tagId],
        );
        if (!current.rows[0]) return false;
        const tag = (await repositoryContext.getPatientTag(
          client,
          clinicId,
          tagId,
        ))!;
        if (tag.patientCount > 0)
          throw patientTagInUseError(tag.name, tag.patientCount);
        await client.query(
          `DELETE FROM patient_tags WHERE clinic_id = $1 AND id = $2`,
          [clinicId, tagId],
        );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "patient_tag.deleted",
          "patient_tag",
          tag.id,
          {
            name: tag.name,
          },
        );
        return true;
      });
    },
  };
}
