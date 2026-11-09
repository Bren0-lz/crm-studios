import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesDir = `${process.cwd()}/src/styles`;
const read = (file: string) => readFileSync(`${stylesDir}/${file}`, "utf8");

/** Corpo da regra cujo seletor é exatamente `selector` no CSS dado. */
function rule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)\\s*${escaped} \\{([^}]*)\\}`).exec(css);
  expect(match, `regra "${selector}"`).not.toBeNull();
  return match![1]!;
}

/** Conteúdo do bloco `@media (max-width: 700px)` que contém `selector`. */
function mobileBlockWith(css: string, selector: string) {
  const blocks = css.split("@media (max-width: 700px) {").slice(1);
  const block = blocks.find((part) => part.includes(`${selector} {`));
  expect(block, `"${selector}" no @media (max-width: 700px)`).toBeDefined();
  return block!;
}

/*
 * QV4: a comanda virou os detalhes da venda (SaleDetailsModal), que reaproveita a lista
 * `.patient-tab-items` e a grade de 3 colunas `.sale-payment dl`.
 */
describe("detalhes da venda (antiga comanda): layout sem estouro (QV4)", () => {
  const clients = read("04-dashboard-clients.css");
  const sales = read("16-sales.css");
  const responsive = read("11-responsive.css");

  it("nome longo do item quebra em vez de estourar a lista", () => {
    expect(rule(clients, ".patient-tab-item-main")).toContain("min-width: 0;");
    expect(rule(clients, ".patient-tab-item-main strong")).toContain(
      "overflow-wrap: anywhere;",
    );
    expect(rule(clients, ".patient-tab-item-main span")).toContain(
      "overflow-wrap: anywhere;",
    );
  });

  it("valor do item à direita, inclusive no celular", () => {
    expect(rule(clients, ".patient-tab-amount")).toContain("text-align: right;");
    const mobile = mobileBlockWith(responsive, ".patient-tab-items li");
    expect(rule(mobile, ".patient-tab-items li > .patient-tab-amount")).toContain(
      "align-self: flex-end;",
    );
  });

  it("grade de pagamento: trilhas que encolhem e texto que quebra", () => {
    expect(rule(sales, ".sale-payment dl")).toMatch(
      /grid-template-columns: repeat\(\s*auto-fit,/,
    );
    expect(rule(sales, ".sale-payment dl > div")).toContain("min-width: 0;");
    expect(rule(sales, ".sale-payment dd")).toContain(
      "overflow-wrap: anywhere;",
    );
  });

  it("botões do rodapé com espaçamento entre eles", () => {
    const modals = read("06-modals.css");
    expect(rule(modals, ".modal-actions")).toContain("gap: var(--space-3);");
  });
});
