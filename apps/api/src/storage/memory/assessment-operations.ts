import type {
  AssessmentTemplateInput,
  AssessmentTemplate,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { uuid, now } from "./helpers.js";
import { validateTemplateFields } from "../../modules/clinical/clinical-integrity.js";
export function createAssessmentOperationsRepository(
  context: MemoryRepositoryContext,
) {
  return {
    async saveAssessmentTemplate(
      clinicId: string,
      actorUserId: string,
      input: AssessmentTemplateInput,
      id?: string,
    ) {
      validateTemplateFields(input.fields);
      const previous = context.assessmentTemplates.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (id && !previous)
        throw new DomainError(
          "ASSESSMENT_TEMPLATE_NOT_FOUND",
          "Modelo não encontrado.",
          404,
        );
      const fork = previous && previous.status !== "draft",
        resourceId = !previous || fork ? uuid() : previous.id,
        familyId = previous?.familyId ?? previous?.id ?? resourceId;
      const version =
        previous?.status === "draft"
          ? previous.version
          : Math.max(
              0,
              ...context.assessmentTemplates
                .filter(
                  (item) =>
                    item.clinicId === clinicId &&
                    (item.familyId === familyId ||
                      item.id === familyId ||
                      item.name === input.name),
                )
                .map((item) => item.version),
            ) + 1;
      const template: AssessmentTemplate = {
        ...input,
        id: resourceId,
        clinicId,
        familyId,
        version,
        status: input.status ?? "published",
        active: true,
        createdAt: !previous || fork ? now() : previous.createdAt,
      };
      if (previous && !fork) Object.assign(previous, template);
      else context.assessmentTemplates.push(template);
      context.recordAudit(
        clinicId,
        actorUserId,
        "assessment.template_saved",
        "assessment_template",
        { version, status: template.status },
        template.id,
      );
      return structuredClone(template);
    },
  };
}
