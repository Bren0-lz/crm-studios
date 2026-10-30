import { maxProductSizes, sortProductSizes } from "@crm/contracts";

export const maxSizeLength = 40;

export const sizeKey = (size: string) => size.toLocaleLowerCase("pt-BR");

/** Tamanhos digitados no campo: vários de uma vez separados por vírgula ("P, M, G"). */
export function parseSizes(text: string) {
  return text
    .split(/[,;\n]/)
    .map((size) => size.trim())
    .filter(Boolean);
}

/**
 * Lista final da categoria: os já adicionados mais o que ficou digitado no campo sem clicar em
 * "Adicionar" (quem salva direto não perde o tamanho), sem repetições.
 */
export function sizesWithDraft(sizes: readonly string[], draft: string) {
  return sortProductSizes([
    ...sizes,
    ...parseSizes(draft).map((size) => size.slice(0, maxSizeLength)),
  ]).slice(0, maxProductSizes);
}
