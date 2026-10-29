import type { ProductSize } from "@crm/contracts";
import { DomainError } from "../../repository.js";

/** Chave de estoque gravada: o tamanho, ou "" para o estoque sem tamanho. */
export function stockKey(size: ProductSize | undefined) {
  return size ?? "";
}

/**
 * Confere se o tamanho pode ser movimentado. Venda e entrada usam só a configuração atual
 * (tamanho obrigatório quando o produto tem tamanhos); saída e perda também aceitam uma chave
 * fora dela que ainda tenha saldo, para baixar sobras de tamanho removido ou de antes dos tamanhos.
 */
export function assertStockSize(
  product: { sizes: readonly ProductSize[] },
  size: ProductSize | undefined,
  options: { leftoverStock?: number } = {},
) {
  const configured = product.sizes.length
    ? size !== undefined && product.sizes.includes(size)
    : size === undefined;
  if (configured || (options.leftoverStock ?? 0) > 0) return;
  if (product.sizes.length && size === undefined)
    throw new DomainError(
      "PRODUCT_SIZE_REQUIRED",
      "Escolha o tamanho do produto.",
      400,
    );
  throw new DomainError(
    "PRODUCT_SIZE_INVALID",
    "Tamanho não disponível para este produto.",
    400,
  );
}

export const isStockOut = (kind: string) =>
  kind === "adjustment_out" || kind === "loss";
