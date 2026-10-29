import type {
  AssessmentField,
  AssessmentTemplate,
  ClinicalAssessment,
  ClinicalAssessmentInput,
} from "./types.js";

type AssessmentValue = ClinicalAssessmentInput["values"][string];

/** Todas as versões de um modelo compartilham a família (a 1ª versão não tem `familyId`). */
export function assessmentTemplateFamilyId(
  template: Pick<AssessmentTemplate, "id" | "familyId">,
) {
  return template.familyId ?? template.id;
}

/**
 * Uma entrada por família de modelo: a versão mais recente (rascunho incluído) ou, com
 * `publishedOnly`, a última publicada. Famílias arquivadas (`active: false`) só entram com
 * `includeArchived`. Ordem alfabética pelo nome.
 */
export function latestAssessmentTemplates(
  templates: readonly AssessmentTemplate[],
  {
    publishedOnly = false,
    includeArchived = false,
  }: { publishedOnly?: boolean; includeArchived?: boolean } = {},
) {
  const latest = new Map<string, AssessmentTemplate>();
  for (const template of templates) {
    if (publishedOnly && template.status === "draft") continue;
    if (!includeArchived && template.active === false) continue;
    const family = assessmentTemplateFamilyId(template);
    const current = latest.get(family);
    if (!current || template.version > current.version)
      latest.set(family, template);
  }
  return [...latest.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
}

export function isBlankAssessmentValue(value: AssessmentValue | undefined) {
  return (
    value === undefined ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Texto de uma resposta como a pessoa lê: "Sim", "Opção A, Opção B", "62 kg". */
export function assessmentValueLabel(
  value: AssessmentValue,
  field?: Pick<AssessmentField, "unit">,
) {
  const text = Array.isArray(value)
    ? value.join(", ")
    : typeof value === "boolean"
      ? value
        ? "Sim"
        : "Não"
      : typeof value === "number"
        ? value.toLocaleString("pt-BR")
        : value;
  return field?.unit && typeof value === "number"
    ? `${text} ${field.unit}`
    : text;
}

export interface PreviousAssessmentAnswer {
  value: AssessmentValue;
  assessmentId: string;
  createdAt: string;
  authorName: string;
}

/**
 * Última resposta preenchida de cada campo nas avaliações anteriores do mesmo modelo
 * (qualquer versão da família), para consulta ao preencher uma nova. Só lê: as avaliações
 * antigas continuam como foram registradas.
 */
export function previousAssessmentAnswers(
  assessments: readonly ClinicalAssessment[],
  templates: readonly AssessmentTemplate[],
  familyId: string,
) {
  const familyTemplateIds = new Set(
    templates
      .filter((template) => assessmentTemplateFamilyId(template) === familyId)
      .map((template) => template.id),
  );
  familyTemplateIds.add(familyId);
  const answers: Record<string, PreviousAssessmentAnswer> = {};
  const history = assessments
    .filter((assessment) => familyTemplateIds.has(assessment.templateId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const assessment of history)
    for (const [key, value] of Object.entries(assessment.values))
      if (!answers[key] && !isBlankAssessmentValue(value))
        answers[key] = {
          value,
          assessmentId: assessment.id,
          createdAt: assessment.createdAt,
          authorName: assessment.authorName,
        };
  return { answers, count: history.length, last: history[0] };
}

export interface AssessmentAnswerGroup {
  title?: string;
  answers: Array<{ key: string; label: string; value: string }>;
}

/**
 * Respostas preenchidas agrupadas pelas seções do modelo usado no registro. Respostas cujo
 * campo não existe mais no modelo aparecem no fim, com a chave como rótulo.
 */
export function assessmentAnswerGroups(
  fields: readonly AssessmentField[],
  values: ClinicalAssessmentInput["values"],
) {
  const groups: AssessmentAnswerGroup[] = [{ answers: [] }];
  for (const field of fields) {
    if (field.type === "section") {
      groups.push({ title: field.label, answers: [] });
      continue;
    }
    const value = values[field.key];
    if (value === undefined || isBlankAssessmentValue(value)) continue;
    groups.at(-1)!.answers.push({
      key: field.key,
      label: field.label,
      value: assessmentValueLabel(value, field),
    });
  }
  const known = new Set(fields.map((field) => field.key));
  const unknown = Object.entries(values).filter(
    ([key, value]) => !known.has(key) && !isBlankAssessmentValue(value),
  );
  if (unknown.length)
    groups.push({
      title: "Outros campos",
      answers: unknown.map(([key, value]) => ({
        key,
        label: key,
        value: assessmentValueLabel(value),
      })),
    });
  return groups.filter((group) => group.answers.length > 0);
}
