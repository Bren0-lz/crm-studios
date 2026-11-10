import {
  assessmentTemplateFamilyId,
  latestAssessmentTemplates,
  type AssessmentTemplate,
  type AssessmentTemplateInput,
  type ClinicalAssessment,
} from "@crm/contracts";
import { missingBuilderFields } from "../../shared/components/MissingFields";

export const blankAssessmentTemplate: AssessmentTemplateInput = {
  name: "",
  specialty: "Fisioterapia",
  fields: [
    { key: "campo_1", label: "", type: "text", required: false, unit: "" },
  ],
};

/** O que falta para salvar um modelo (lista ligada aos botões de salvar). */
export function missingTemplateFields(form: AssessmentTemplateInput) {
  return [
    ...(form.name.trim().length < 3
      ? ["Nome do modelo (pelo menos 3 caracteres)"]
      : []),
    ...(form.specialty.trim().length < 2
      ? ["Especialidade (pelo menos 2 caracteres)"]
      : []),
    ...missingBuilderFields(form.fields),
  ];
}

/** Cópia editável de um modelo para criar outro a partir dele. */
export function assessmentTemplateCopy(
  template: AssessmentTemplate,
): AssessmentTemplateInput {
  return {
    name: `${template.name} (cópia)`.slice(0, 120),
    specialty: template.specialty,
    fields: structuredClone(template.fields),
  };
}

export interface AssessmentGroup {
  familyId: string;
  name: string;
  items: Array<{
    assessment: ClinicalAssessment;
    template: AssessmentTemplate | undefined;
  }>;
}

/** Avaliações do cliente agrupadas pelo modelo (todas as versões juntas), da mais recente. */
export function groupAssessmentsByTemplate(
  assessments: readonly ClinicalAssessment[],
  templates: readonly AssessmentTemplate[],
) {
  const latest = latestAssessmentTemplates(templates, {
    includeArchived: true,
  });
  const groups = new Map<string, AssessmentGroup>();
  for (const assessment of [...assessments].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )) {
    const template = templates.find(
      (item) => item.id === assessment.templateId,
    );
    const familyId = template
      ? assessmentTemplateFamilyId(template)
      : assessment.templateId;
    const group = groups.get(familyId) ?? {
      familyId,
      name:
        latest.find((item) => assessmentTemplateFamilyId(item) === familyId)
          ?.name ?? assessment.templateName,
      items: [],
    };
    group.items.push({ assessment, template });
    groups.set(familyId, group);
  }
  return [...groups.values()].sort((a, b) =>
    b.items[0]!.assessment.createdAt.localeCompare(
      a.items[0]!.assessment.createdAt,
    ),
  );
}
