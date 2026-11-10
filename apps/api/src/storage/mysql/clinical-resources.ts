import {
  type ClinicalResource,
  type ClinicalResourceInput,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "../../infrastructure/mysql-client.js";
import { DomainError } from "../../repository.js";
import { validateClinicalResource } from "../../modules/clinical/resources.js";
import type { MysqlRepositoryContext } from "./context.js";

const columns = `cr.id,cr.clinic_id AS "clinicId",cr.kind,cr.patient_id AS "patientId",cr.name,cr.status,cr.family_id AS "familyId",cr.version,cr.data,cr.history,cr.template_snapshot AS "templateSnapshot",cr.origin_starts_at AS "originStartsAt",cr.author_id AS "authorId",u.full_name AS "authorName",cr.created_at AS "createdAt",cr.updated_at AS "updatedAt"`;
type Row = Omit<
  ClinicalResource,
  "createdAt" | "updatedAt" | "originStartsAt"
> & {
  originStartsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
const map = (row: Row): ClinicalResource => {
  const { patientId, templateSnapshot, originStartsAt, ...rest } = row;
  return {
    ...rest,
    ...(originStartsAt ? { originStartsAt: originStartsAt.toISOString() } : {}),
    ...(patientId ? { patientId } : {}),
    ...(templateSnapshot ? { templateSnapshot } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};
export function createClinicalResourcesRepository(
  context: MysqlRepositoryContext,
) {
  async function find(client: PoolClient, clinicId: string, id: string) {
    const result = await client.query<Row>(
      `SELECT ${columns} FROM clinical_resources cr JOIN users u ON u.id=cr.author_id AND u.clinic_id=cr.clinic_id WHERE cr.clinic_id=$1 AND cr.id=$2 FOR UPDATE`,
      [clinicId, id],
    );
    return result.rows[0] ? map(result.rows[0]) : undefined;
  }
  return {
    async listClinicalSources(clinicId: string, patientId?: string) {
      const result = await context.pool.query<{
        id: string;
        type: "appointment" | "group_attendance";
        patientId: string;
        patientName: string;
        professionalId: string;
        professionalName: string;
        startsAt: Date;
      }>(
        `SELECT a.id,'appointment' AS type,coalesce(p.merged_into_patient_id,p.id) AS "patientId",p.full_name AS "patientName",a.professional_id AS "professionalId",pr.full_name AS "professionalName",a.starts_at AS "startsAt" FROM appointments a JOIN patients p ON p.id=a.patient_id AND p.clinic_id=a.clinic_id JOIN professionals pr ON pr.id=a.professional_id AND pr.clinic_id=a.clinic_id WHERE a.clinic_id=$1 AND a.deleted_at IS NULL AND a.status<>'cancelled' AND ($2 IS NULL OR a.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2)))
        UNION ALL SELECT ga.id,'group_attendance' AS type,coalesce(p.merged_into_patient_id,p.id) AS "patientId",p.full_name AS "patientName",coalesce(gs.professional_id,g.professional_id) AS "professionalId",pr.full_name AS "professionalName",gs.starts_at AS "startsAt" FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id JOIN patients p ON p.id=ga.patient_id AND p.clinic_id=ga.clinic_id JOIN professionals pr ON pr.id=coalesce(gs.professional_id,g.professional_id) AND pr.clinic_id=ga.clinic_id WHERE ga.clinic_id=$1 AND gs.status<>'cancelled' AND (ga.status='present' OR ga.outcome='present') AND ($2 IS NULL OR ga.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2))) ORDER BY "startsAt" DESC`,
        [clinicId, patientId ?? null],
      );
      return result.rows.map((row) => ({
        ...row,
        startsAt: row.startsAt.toISOString(),
      }));
    },
    async listClinicalResources(
      clinicId: string,
      actorUserId: string,
      patientId?: string,
      action: "read" | "export" = "read",
      catalogOnly = false,
    ) {
      return context.inTransaction(async (client) => {
        if (patientId) {
          const exists = await client.query(
            "SELECT id FROM patients WHERE clinic_id=$1 AND id=$2",
            [clinicId, patientId],
          );
          if (!exists.rowCount)
            throw new DomainError(
              "PATIENT_NOT_FOUND",
              "Cliente não encontrado.",
              404,
            );
          await context.addClinicalAccessEvent(
            clinicId,
            patientId,
            actorUserId,
            action,
            "workspace",
            undefined,
            client,
          );
        }
        const result = await client.query<Row>(
          `SELECT ${columns} FROM clinical_resources cr JOIN users u ON u.id=cr.author_id AND u.clinic_id=cr.clinic_id WHERE cr.clinic_id=$1 AND (NOT $3 OR cr.patient_id IS NULL) AND ($2 IS NULL OR cr.patient_id IS NULL OR cr.patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND (id=$2 OR merged_into_patient_id=$2))) ORDER BY cr.updated_at DESC`,
          [clinicId, patientId ?? null, catalogOnly],
        );
        if (!patientId && !catalogOnly)
          for (const id of new Set(
            result.rows
              .filter((row) => row.patientId)
              .map((row) => row.patientId!),
          ))
            await context.addClinicalAccessEvent(
              clinicId,
              id,
              actorUserId,
              action,
              "workspace",
              undefined,
              client,
            );
        return result.rows.map(map);
      });
    },
    async saveClinicalResource(
      clinicId: string,
      actorUserId: string,
      input: ClinicalResourceInput,
      id?: string,
    ) {
      return context.inTransaction(async (client) => {
        await client.lock(clinicId);
        const previous = id ? await find(client, clinicId, id) : undefined;
        if (id && !previous)
          throw new DomainError(
            "CLINICAL_RESOURCE_NOT_FOUND",
            "Registro clínico não encontrado.",
            404,
          );
        const actor = await client.query<{ name: string }>(
          "SELECT full_name AS name FROM users WHERE clinic_id=$1 AND id=$2",
          [clinicId, actorUserId],
        );
        if (!actor.rows[0])
          throw new DomainError(
            "USER_NOT_FOUND",
            "Usuário não encontrado.",
            404,
          );
        const templateSnapshot = await validateClinicalResource(
          input,
          {
            samePatient: async (a, b) => {
              const result = await client.query<{ id: string }>(
                "SELECT DISTINCT coalesce(merged_into_patient_id,id) AS id FROM patients WHERE clinic_id=$1 AND id IN ($2,$3)",
                [clinicId, a, b],
              );
              return result.rowCount === 1;
            },
            patient: async (patientId) =>
              Boolean(
                (
                  await client.query(
                    "SELECT id FROM patients WHERE clinic_id=$1 AND id=$2",
                    [clinicId, patientId],
                  )
                ).rowCount,
              ),
            professional: async (professionalId) =>
              Boolean(
                (
                  await client.query(
                    "SELECT id FROM professionals WHERE clinic_id=$1 AND id=$2",
                    [clinicId, professionalId],
                  )
                ).rowCount,
              ),
            resource: (resourceId) => find(client, clinicId, resourceId),
            catalog: async (catalogId, kind) =>
              Boolean(
                (
                  await client.query(
                    "SELECT id FROM clinic_catalogs WHERE clinic_id=$1 AND id=$2 AND kind=$3",
                    [clinicId, catalogId, kind],
                  )
                ).rowCount,
              ),
            source: async (type, sourceId) => {
              const query =
                type === "appointment"
                  ? `SELECT patient_id AS "patientId",professional_id AS "professionalId" FROM appointments WHERE clinic_id=$1 AND id=$2 AND patient_id IS NOT NULL AND status<>'cancelled'`
                  : `SELECT ga.patient_id AS "patientId",coalesce(gs.professional_id,g.professional_id) AS "professionalId" FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id JOIN group_classes g ON g.id=gs.group_id AND g.clinic_id=gs.clinic_id WHERE ga.clinic_id=$1 AND ga.id=$2 AND (ga.status='present' OR ga.outcome='present')`;
              return (
                await client.query<{
                  patientId: string;
                  professionalId: string;
                }>(query, [clinicId, sourceId])
              ).rows[0];
            },
            executions: async (trainingId) =>
              Number(
                (
                  await client.query<{ count: string }>(
                    "SELECT count(*) AS count FROM clinical_resources WHERE clinic_id=$1 AND kind='training_execution' AND JSON_VALUE(data, '$.trainingId')=$2",
                    [clinicId, trainingId],
                  )
                ).rows[0]?.count ?? 0,
              ),
          },
          previous,
        );
        const fork =
            previous?.kind === "evolution_template" &&
            previous.status === "published",
          resourceId = !previous || fork ? randomUUID() : previous.id;
        const nextVersion =
          previous?.kind === "evolution_template"
            ? Number(
                (
                  await client.query<{ version: number }>(
                    "SELECT coalesce(max(version),0)+1 AS version FROM clinical_resources WHERE clinic_id=$1 AND family_id=$2",
                    [clinicId, previous.familyId],
                  )
                ).rows[0]!.version,
              )
            : (previous?.version ?? 0) + 1;
        const version = nextVersion,
          status =
            input.kind === "evolution_template"
              ? input.status
              : input.kind === "evolution" || input.kind === "clinical_document"
                ? "draft"
                : "active" in input && !input.active
                  ? "inactive"
                  : "active";
        const origin =
          input.kind === "evolution" && !previous?.originStartsAt
            ? (
                await client.query<{ startsAt: Date }>(
                  input.sourceType === "appointment"
                    ? 'SELECT starts_at AS "startsAt" FROM appointments WHERE clinic_id=$1 AND id=$2'
                    : 'SELECT gs.starts_at AS "startsAt" FROM group_attendance ga JOIN group_sessions gs ON gs.id=ga.session_id AND gs.clinic_id=ga.clinic_id WHERE ga.clinic_id=$1 AND ga.id=$2',
                  [clinicId, input.sourceId],
                )
              ).rows[0]?.startsAt
            : undefined;
        const originStartsAt =
          previous?.originStartsAt ?? origin?.toISOString();
        const history = previous
          ? [
              ...previous.history,
              {
                ...(previous.templateSnapshot
                  ? {
                      templateSnapshot: structuredClone(
                        previous.templateSnapshot,
                      ),
                    }
                  : {}),
                version: previous.version,
                data: previous.data,
                authorName: previous.authorName,
                occurredAt: previous.updatedAt,
              },
            ]
          : [];
        await client.query(
          `INSERT INTO clinical_resources(id,clinic_id,kind,patient_id,name,status,family_id,version,data,history,template_snapshot,author_id,origin_starts_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON DUPLICATE KEY UPDATE name=VALUES(name),status=VALUES(status),version=VALUES(version),data=VALUES(data),history=VALUES(history),template_snapshot=VALUES(template_snapshot),origin_starts_at=coalesce(origin_starts_at,VALUES(origin_starts_at)),author_id=VALUES(author_id),updated_at=NOW(6)`,
          [
            resourceId,
            clinicId,
            input.kind,
            "patientId" in input ? input.patientId : null,
            input.name,
            status,
            previous?.familyId ?? resourceId,
            version,
            JSON.stringify(input),
            JSON.stringify(history),
            templateSnapshot ? JSON.stringify(templateSnapshot) : null,
            actorUserId,
            originStartsAt ?? null,
          ],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "clinical.resource_saved",
          "clinical_resource",
          resourceId,
          { kind: input.kind, version },
        );
        return (await find(client, clinicId, resourceId))!;
      });
    },
    async finalizeClinicalResource(
      clinicId: string,
      actorUserId: string,
      id: string,
    ) {
      return context.inTransaction(async (client) => {
        const item = await find(client, clinicId, id);
        if (!item || !["evolution", "clinical_document"].includes(item.kind))
          throw new DomainError(
            "CLINICAL_RESOURCE_NOT_FOUND",
            "Evolução ou documento não encontrado.",
            404,
          );
        if (item.status !== "finalized") {
          const data = item.data;
          if (
            data.kind === "evolution" &&
            ![
              data.body,
              data.subjective,
              data.objective,
              data.assessment,
              data.plan,
              Object.keys(data.values).length ? "respostas" : "",
            ].some(Boolean)
          )
            throw new DomainError(
              "CLINICAL_RECORD_EMPTY",
              "Preencha o registro antes de finalizar.",
              400,
            );
          await client.query(
            "UPDATE clinical_resources SET status='finalized',updated_at=NOW(6) WHERE clinic_id=$1 AND id=$2",
            [clinicId, id],
          );
          await context.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "clinical.resource_finalized",
            "clinical_resource",
            id,
            {},
          );
        }
        return (await find(client, clinicId, id))!;
      });
    },
  };
}
