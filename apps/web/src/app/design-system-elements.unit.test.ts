import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesDir = `${process.cwd()}/src/styles`;
const read = (file: string) => readFileSync(`${stylesDir}/${file}`, "utf8");
const base = read("01-base.css");
const allCss = readdirSync(stylesDir)
  .filter((file) => file.endsWith(".css"))
  .map((file) => ({ file, css: read(file) }));

/** Corpo da regra cujo seletor é exatamente `selector` em 01-base.css. */
function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(base);
  expect(match, `regra "${selector}" em 01-base.css`).not.toBeNull();
  return match![1]!;
}

describe("elementos nativos com o design system (QV3)", () => {
  it("fieldset e legend sem a moldura e o recuo do navegador", () => {
    const fieldset = rule(":where(fieldset)");
    expect(fieldset).toContain("border: 0;");
    expect(fieldset).toContain("padding: 0;");
    expect(fieldset).toContain("margin: 0;");
    expect(fieldset).toContain("min-width: 0;");
    const legend = rule(":where(legend)");
    expect(legend).toContain("padding: 0;");
    expect(legend).toContain("font-size: var(--text-sm);");
  });

  it("summary sem o triângulo padrão, com chevron que gira ao abrir e foco visível", () => {
    const summary = rule(":where(summary)");
    expect(summary).toContain("list-style: none;");
    expect(summary).toContain("cursor: pointer;");
    expect(rule(":where(summary)::-webkit-details-marker")).toContain(
      "display: none;",
    );
    const chevron = rule(":where(summary)::after");
    expect(chevron).toContain('content: "";');
    expect(chevron).toContain("border-right: 2px solid var(--muted);");
    expect(chevron).toContain("border-bottom: 2px solid var(--muted);");
    expect(chevron).toContain("transform: translateY(-25%) rotate(45deg);");
    expect(rule(":where(details[open] > summary)::after")).toContain(
      "transform: translateY(25%) rotate(-135deg);",
    );
    expect(rule(":where(summary):focus-visible")).toMatch(
      /outline: 2px solid var\(--green-2\);/,
    );
  });

  it("summary com indicador próprio não fica com dois sinais", () => {
    const modals = read("06-modals.css");
    expect(modals).not.toMatch(/\.plan-schedule-details[^{]*::after \{/);
    expect(read("12-client-workspace.css")).toMatch(
      /\.inventory-history > summary::after \{\s*content: none;\s*\}/,
    );
  });

  it("tabela do design system: cabeçalho, linhas e numéricos à direita", () => {
    expect(rule(":where(table)")).toContain("border-collapse: collapse;");
    expect(rule(":where(th)")).toContain("text-align: left;");
    expect(rule(".dre-table th,\n.dre-table td")).toContain(
      "border-bottom: 1px solid var(--line);",
    );
    expect(rule(".dre-table thead")).toContain("background: var(--cream);");
    const head = rule(".dre-table thead th");
    expect(head).toContain("font-size: var(--text-xs);");
    expect(head).toContain("text-transform: uppercase;");
    expect(rule(".dre-table .numeric-value")).toContain("text-align: right;");
    // Nenhuma regra da tabela usa variável inexistente (a antiga --border sumia com as linhas).
    for (const { file, css } of allCss) {
      for (const [, body] of css.matchAll(/\.dre-table[^{]*\{([^}]*)\}/g)) {
        expect(body, file).not.toContain("var(--border)");
      }
    }
  });

  it("links com a cor da marca, sublinhado, hover e foco visível", () => {
    const link = rule(":where(a)");
    expect(link).toContain("color: var(--green-2);");
    expect(link).toContain("text-decoration-line: underline;");
    expect(rule(":where(a):hover")).toContain("color: var(--green);");
    expect(rule(":where(a):focus-visible")).toContain(
      "outline: 2px solid var(--green-2);",
    );
  });

  it("as regras de elemento não ganham de classes das telas (especificidade zero)", () => {
    for (const element of ["fieldset", "legend", "summary", "table", "th", "a"]) {
      expect(base).not.toMatch(new RegExp(`(?:^|\\n)${element} \\{`));
    }
  });
});
