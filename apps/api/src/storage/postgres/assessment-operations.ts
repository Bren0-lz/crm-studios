import type { AssessmentTemplateInput } from "@crm/contracts";
import type { PostgresRepositoryContext } from "./context.js";
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
  context: PostgresRepositoryContext,
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
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
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
        const result = await client.query<AssessmentTemplateRow>(
          `INSERT INTO assessment_templates(id,clinic_id,name,specialty,fields,version,status,family_id) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,specialty=EXCLUDED.specialty,fields=EXCLUDED.fields,status=EXCLUDED.status RETURNING ${columns}`,
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
  };
}
