import { describe, expect, it } from "vitest";
import { diffTemplateLines, templateDiffSummary } from "./template-diff";

describe("diffTemplateLines", () => {
  it("marca linhas incluídas e removidas mantendo as iguais", () => {
    const lines = diffTemplateLines(
      "Cláusula 1\nValor: R$ 100\nCláusula 3",
      "Cláusula 1\nValor: R$ 150\nCláusula 3\nCláusula 4",
    );
    expect(lines).toEqual([
      { kind: "same", text: "Cláusula 1" },
      { kind: "removed", text: "Valor: R$ 100" },
      { kind: "added", text: "Valor: R$ 150" },
      { kind: "same", text: "Cláusula 3" },
      { kind: "added", text: "Cláusula 4" },
    ]);
    expect(templateDiffSummary(lines)).toBe(
      "2 linhas incluídas · 1 linha removida",
    );
  });

  it("trata texto vazio e textos iguais", () => {
    expect(diffTemplateLines("", "A\nB")).toEqual([
      { kind: "added", text: "A" },
      { kind: "added", text: "B" },
    ]);
    expect(templateDiffSummary(diffTemplateLines("A\nB", "A\nB\n"))).toBe(
      "Mesmo texto da versão anterior",
    );
  });
});
