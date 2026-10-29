import { describe, expect, it } from "vitest";
import {
  assessmentAnswerGroups,
  assessmentValueLabel,
  latestAssessmentTemplates,
  previousAssessmentAnswers,
} from "./assessments.js";
import { assessmentTemplateInputSchema } from "./model.js";
import { starterAssessmentTemplates } from "./starter-templates.js";
import type { AssessmentTemplate, ClinicalAssessment } from "./types.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

function template(
  id: string,
  patch: Partial<AssessmentTemplate> = {},
): AssessmentTemplate {
  return {
    id,
    clinicId,
    name: "Anamnese",
    specialty: "Fisioterapia",
    status: "published",
    version: 1,
    active: true,
    createdAt: "2026-10-01T12:00:00.000Z",
    fields: [{ key: "queixa", label: "Queixa", type: "text", required: false }],
    ...patch,
  };
}

function assessment(
  id: string,
  templateId: string,
  createdAt: string,
  values: ClinicalAssessment["values"],
): ClinicalAssessment {
  return {
    id,
    clinicId,
    patientId: "99999999-9999-4999-8999-999999999999",
    templateId,
    templateName: "Anamnese",
    authorName: "Ana",
    createdAt,
    values,
  };
}

describe("assessment templates", () => {
  it("ships the starter forms as valid templates with unique keys", () => {
    expect(starterAssessmentTemplates.map((item) => item.name)).toEqual([
      "Anamnese",
      "Avaliação postural",
      "Ficha de inscrição — Dançaterapia e Aula de Ritmos",
    ]);
    for (const starter of starterAssessmentTemplates) {
      expect(assessmentTemplateInputSchema.safeParse(starter).success).toBe(
        true,
      );
      const keys = starter.fields.map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("keeps one template per family: the newest, or the newest published", () => {
    const v1 = template("a1");
    const v2 = template("a2", { familyId: "a1", version: 2 });
    const draft = template("a3", {
      familyId: "a1",
      version: 3,
      status: "draft",
    });
    const archived = template("b1", { name: "Postural", active: false });
    const all = [draft, v1, v2, archived];
    expect(latestAssessmentTemplates(all).map((item) => item.id)).toEqual([
      "a3",
    ]);
    expect(
      latestAssessmentTemplates(all, { publishedOnly: true }).map(
        (item) => item.id,
      ),
    ).toEqual(["a2"]);
    expect(
      latestAssessmentTemplates(all, { includeArchived: true }).map(
        (item) => item.id,
      ),
    ).toEqual(["a3", "b1"]);
  });
});

describe("assessment answers", () => {
  it("returns the last filled answer of each field across the family's versions", () => {
    const templates = [
      template("a1"),
      template("a2", { familyId: "a1", version: 2 }),
      template("b1", { name: "Postural" }),
    ];
    const history = [
      assessment("x1", "a1", "2026-09-01T10:00:00.000Z", {
        queixa: "Dor lombar",
        peso: 70,
      }),
      assessment("x2", "a2", "2026-10-01T10:00:00.000Z", {
        queixa: "Dor no ombro",
        peso: "",
      }),
      assessment("x3", "b1", "2026-10-05T10:00:00.000Z", { queixa: "Outro" }),
    ];
    const previous = previousAssessmentAnswers(history, templates, "a1");
    expect(previous.count).toBe(2);
    expect(previous.last?.id).toBe("x2");
    expect(previous.answers.queixa).toMatchObject({
      value: "Dor no ombro",
      assessmentId: "x2",
    });
    // Resposta em branco na mais recente: vale a última preenchida.
    expect(previous.answers.peso).toMatchObject({
      value: 70,
      assessmentId: "x1",
    });
  });

  it("formats values and groups answers by section, skipping blanks", () => {
    expect(assessmentValueLabel(true)).toBe("Sim");
    expect(assessmentValueLabel(["A", "B"])).toBe("A, B");
    expect(assessmentValueLabel(1.65, { unit: "m" })).toBe("1,65 m");
    expect(
      assessmentAnswerGroups(
        [
          {
            key: "peso",
            label: "Peso",
            type: "number",
            unit: "kg",
            required: false,
          },
          {
            key: "s1",
            label: "Vista anterior",
            type: "section",
            required: false,
          },
          { key: "cabeca", label: "Cabeça", type: "text", required: false },
          { key: "joelhos", label: "Joelhos", type: "text", required: false },
        ],
        { peso: 62, cabeca: "Anteriorizada", joelhos: " ", antigo: "x" },
      ),
    ).toEqual([
      { answers: [{ key: "peso", label: "Peso", value: "62 kg" }] },
      {
        title: "Vista anterior",
        answers: [{ key: "cabeca", label: "Cabeça", value: "Anteriorizada" }],
      },
      {
        title: "Outros campos",
        answers: [{ key: "antigo", label: "antigo", value: "x" }],
      },
    ]);
  });
});
