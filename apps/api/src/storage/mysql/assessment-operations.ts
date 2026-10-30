import type { AssessmentTemplateInput } from "@crm/contracts";
import type { MysqlRepositoryContext } from "./context.js";
import {
  mapAssessmentTemplate,
  type AssessmentTemplateRow,
} from "./helpers.js";
import { DomainError } from "../../repository.js";
import { randomUUID } from "node:crypto";
import { validateTemplateFields } from "../../modules/clinical/clinical-integrity.js";
const columns =
  'id,clinic_id AS "clinicId",name,specialty,fields,version,status,family_id AS "familyId",active,created_at AS "createdAt"';
export function createAssessmentOperationsRepository(
  context: MysqlRepositoryContext,
) {
  return {
    async saveAssessmentTemplate(
      clinicId: string,
      actorUserId: string,
      input: AssessmentTemplateInput,
      id?: string,
    ) {
      validateTemplateFields(input.fields);
      return context.inTransaction(async (client) => {
        await client.lock(clinicId);
        const previous = id
          ? (
              await client.query<AssessmentTemplateRow>(
                `SELECT ${columns} FROM assessment_templates WHERE clinic_id=$1 AND id=$2 FOR UPDATE`,
                [clinicId, id],
              )
            ).rows[0]
          : undefined;
        if (id && !previous)
          throw new DomainError(
            "ASSESSMENT_TEMPLATE_NOT_FOUND",
            "Modelo não encontrado.",
            404,
          );
        const fork = previous && previous.status !== "draft",
          resourceId = !previous || fork ? randomUUID() : previous.id,
          familyId = previous?.familyId ?? previous?.id ?? resourceId,
          version =
            previous?.status === "draft"
              ? previous.version
              : Number(
                  (
                    await client.query<{ version: number }>(
                      "SELECT coalesce(max(version),0)+1 AS version FROM assessment_templates WHERE clinic_id=$1 AND (family_id=$2 OR id=$2 OR name=$3)",
                      [clinicId, familyId, input.name],
                    )
                  ).rows[0]!.version,
                );
        await client.query(
          previous && !fork
            ? `UPDATE assessment_templates SET name=$3,specialty=$4,fields=$5,status=$7 WHERE id=$1 AND clinic_id=$2`
            : `INSERT INTO assessment_templates(id,clinic_id,name,specialty,fields,version,status,family_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            resourceId,
            clinicId,
            input.name,
            input.specialty,
            JSON.stringify(input.fields),
            version,
            input.status ?? "published",
            familyId,
          ],
        );
        const result = await client.query<AssessmentTemplateRow>(
          `SELECT ${columns} FROM assessment_templates WHERE id=$1`,
          [resourceId],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "assessment.template_saved",
          "assessment_template",
          resourceId,
          { version, status: input.status ?? "published" },
        );
        return mapAssessmentTemplate(result.rows[0]!);
      });
    },

    async listAssessmentTemplates(clinicId: string) {
      const result = await context.pool.query<AssessmentTemplateRow>(
        `SELECT ${columns} FROM assessment_templates WHERE clinic_id=$1 ORDER BY name, version DESC`,
        [clinicId],
      );
      return result.rows.map(mapAssessmentTemplate);
    },

    async setAssessmentTemplateActive(
      clinicId: string,
      actorUserId: string,
      id: string,
      active: boolean,
    ) {
      return context.inTransaction(async (client) => {
        const target = (
          await client.query<{ familyId: string; name: string }>(
            `SELECT coalesce(family_id,id) AS "familyId", name FROM assessment_templates WHERE clinic_id=$1 AND id=$2`,
            [clinicId, id],
          )
        ).rows[0];
        if (!target) return null;
        await client.query(
          `UPDATE assessment_templates SET active=$3 WHERE clinic_id=$1 AND coalesce(family_id,id)=$2`,
          [clinicId, target.familyId, active],
        );
        const updated = await client.query<AssessmentTemplateRow>(
          `SELECT ${columns} FROM assessment_templates WHERE clinic_id=$1 AND coalesce(family_id,id)=$2`,
          [clinicId, target.familyId],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          active
            ? "assessment.template_restored"
            : "assessment.template_archived",
          "assessment_template",
          target.familyId,
          { name: target.name },
        );
        const latest = updated.rows.reduce((current, row) =>
          row.version > current.version ? row : current,
        );
        return mapAssessmentTemplate(latest);
      });
    },
  };
}
