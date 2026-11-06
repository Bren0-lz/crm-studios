import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssessmentTemplateFields } from "./AssessmentTemplateFields";

const clinicalCss = readFileSync(
  `${process.cwd()}/src/styles/07-clinical.css`,
  "utf8",
);

describe("editor do modelo de prontuário (AJ2)", () => {
  it("separa campos e botões com o espaçamento da escala", () => {
    render(
      <AssessmentTemplateFields
        form={{
          name: "Avaliação",
          specialty: "Pilates",
          fields: [
            { key: "campo_1", label: "Dor", type: "text", required: false },
          ],
        }}
        onChange={vi.fn()}
      />,
    );
    const preview = screen.getByRole("button", {
      name: "Prévia do formulário",
    });
    const wrapper = preview.parentElement!;
    expect(wrapper).toHaveClass("assessment-template-fields");
    expect(
      screen.getByRole("button", { name: "Adicionar campo" }).parentElement,
    ).toHaveClass("clinical-form-builder");

    const rule =
      /\.assessment-template-fields,\n\.assessment-template-fields > \.clinical-form-builder \{([^}]*)\}/.exec(
        clinicalCss,
      )?.[1] ?? "";
    expect(rule).toContain("display: grid");
    expect(rule).toContain("gap: var(--space-2)");
  });
});
