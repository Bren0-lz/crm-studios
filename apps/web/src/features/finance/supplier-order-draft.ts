import type { Product, ProductSize, SupplierOrderInput } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { localIsoDate } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

export type OrderLine = {
  key: number;
  /** Id do produto cadastrado ou "" (ainda não escolhido). */
  productId: string;
  /** Quantidade do produto sem tamanhos. */
  quantity: number;
  /** Quantidade comprada de cada tamanho (produto com tamanhos). */
  sizeQuantities: Partial<Record<ProductSize, number>>;
  unitCostInCents: number | null;
};

let nextLineKey = 1;
const emptyLine = (): OrderLine => ({
  key: nextLineKey++,
  productId: "",
  quantity: 1,
  sizeQuantities: {},
  unitCostInCents: null,
});

/**
 * Rascunho de um pedido ao fornecedor, usado dentro do cadastro do fornecedor: o pedido pode
 * ser registrado sozinho (fornecedor já salvo) ou junto com o cadastro (fornecedor novo).
 * Os produtos só carregam quando o rascunho é aberto (`enabled`).
 */
export function useSupplierOrderDraft(enabled: boolean) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [orderedOn, setOrderedOn] = useState(() => localIsoDate());
  const [number, setNumber] = useState("");
  const [totalInCents, setTotalInCents] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>(() => [emptyLine()]);
  /** Item cujo produto está sendo cadastrado no modal por cima. */
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const dirty = useFormDirty(
    { orderedOn, number, totalInCents, notes, lines },
    enabled,
  );
  const loading = enabled && products === null;
  useEffect(() => {
    if (!loading) return;
    let alive = true;
    api
      .inventoryWorkspace()
      .then((workspace) => {
        if (alive)
          setProducts(workspace.products.filter((item) => item.active));
      })
      .catch((cause: Error) => {
        if (alive) {
          setProducts([]);
          setLoadError(cause.message);
        }
      });
    return () => {
      alive = false;
    };
  }, [loading]);
  const productOf = (id: string) => products?.find((item) => item.id === id);
  const sizesOf = (line: OrderLine) => productOf(line.productId)?.sizes ?? [];
  /** Quantidade total do item: soma dos tamanhos ou a quantidade do produto sem tamanhos. */
  const lineQuantity = (line: OrderLine) =>
    sizesOf(line).length
      ? sizesOf(line).reduce(
          (sum, size) => sum + (line.sizeQuantities[size] ?? 0),
          0,
        )
      : line.quantity;
  function updateLine(key: number, patch: Partial<OrderLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }
  function productCreated(product: Product) {
    setProducts((current) => [...(current ?? []), product]);
    if (creatingFor !== null)
      updateLine(creatingFor, {
        productId: product.id,
        quantity: 1,
        sizeQuantities: {},
        ...(product.costInCents > 0
          ? { unitCostInCents: product.costInCents }
          : {}),
      });
  }
  /** Pedido pronto para a API ou a mensagem do que falta. */
  function build(): { input: SupplierOrderInput } | { error: string } {
    if (!orderedOn) return { error: "Informe a data do pedido." };
    if (totalInCents === null) return { error: "Informe o valor do pedido." };
    if (lines.some((line) => !line.productId))
      return {
        error: "Escolha o produto de cada item ou remova o item vazio.",
      };
    const missingSizes = lines.findIndex(
      (line) => sizesOf(line).length > 0 && lineQuantity(line) === 0,
    );
    if (missingSizes >= 0)
      return {
        error: `Informe a quantidade de ao menos um tamanho no item ${missingSizes + 1}.`,
      };
    return {
      input: {
        orderedOn,
        number,
        totalInCents,
        notes,
        items: lines.flatMap((line) => {
          const cost =
            line.unitCostInCents !== null
              ? { unitCostInCents: line.unitCostInCents }
              : {};
          const sizes = sizesOf(line);
          if (!sizes.length)
            return [
              { productId: line.productId, quantity: line.quantity, ...cost },
            ];
          return sizes
            .filter((size) => (line.sizeQuantities[size] ?? 0) > 0)
            .map((size) => ({
              productId: line.productId,
              size,
              quantity: line.sizeQuantities[size]!,
              ...cost,
            }));
        }),
      },
    };
  }
  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }
  function reset() {
    setOrderedOn(localIsoDate());
    setNumber("");
    setTotalInCents(null);
    setNotes("");
    setLines([emptyLine()]);
  }
  return {
    products,
    loadError,
    orderedOn,
    setOrderedOn,
    number,
    setNumber,
    totalInCents,
    setTotalInCents,
    notes,
    setNotes,
    lines,
    setLines,
    creatingFor,
    setCreatingFor,
    dirty,
    productOf,
    sizesOf,
    lineQuantity,
    updateLine,
    addLine,
    productCreated,
    build,
    reset,
  };
}

export type SupplierOrderDraft = ReturnType<typeof useSupplierOrderDraft>;
