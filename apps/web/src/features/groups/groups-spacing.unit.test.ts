import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// QV7: as seções de Turmas (indicadores, abas, lista; abas e seções do modal da turma;
// calendário e reposições) ficam separadas pelo gap do contêiner, não grudadas.
const styles = (file: string) =>
  readFileSync(`${process.cwd()}/src/styles/${file}`, "utf8");
const clinical = styles("07-clinical.css");
const settings = styles("08-settings.css");
const workspace = styles("12-client-workspace.css");

function rule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)\\s*${escaped} \\{([^}]*)\\}`))?.[1];
}

function gapOf(css: string, selector: string) {
  return rule(css, selector)
    ?.match(/(?:^|\n)\s*gap:\s*([^;]+);/)?.[1]
    ?.trim();
}

describe("espaço entre seções em Turmas (QV7)", () => {
  it.each([
    ["página: indicadores, abas e lista", clinical, ".groups-layout"],
    [
      "modal: abas e seções",
      clinical,
      ".group-modal-sections,\n.group-modal-form",
    ],
    [
      "frequência: calendário e reposições",
      workspace,
      ".group-operations-body",
    ],
  ])("%s têm gap no contêiner", (_name, css, selector) => {
    const gap = gapOf(css, selector);
    expect(gap).toBeTruthy();
    expect(gap).not.toMatch(/^0(px)?$/);
  });

  it("mantém o gap da página no celular", () => {
    const mobile = settings.slice(
      settings.indexOf("@media (max-width: 700px)"),
    );
    const gap = gapOf(mobile, ".groups-layout");
    expect(gap).toBeTruthy();
    expect(gap).not.toMatch(/^0(px)?$/);
  });
});
