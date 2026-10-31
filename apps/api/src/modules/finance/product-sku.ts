/** Código gerado para o produto cadastrado sem código informado. */
export function generatedProductSku(seed: string) {
  return `PRD-${seed
    .replace(/[^0-9a-f]/gi, "")
    .slice(0, 8)
    .toUpperCase()}`;
}
