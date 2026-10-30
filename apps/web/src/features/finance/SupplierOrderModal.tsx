import {
  productSizeLabel,
  type Product,
  type ProductSize,
  type Supplier,
  type SupplierOrderInput,
} from "@crm/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { useToast } from "../../shared/feedback/toast-context";
import { currency, localIsoDate } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { ProductModal } from "../sales/index";

/** Valor do seletor de produto que abre o cadastro de um produto novo por cima do pedido. */
const NEW_PRODUCT = "new";

type OrderLine = {
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
 * Novo pedido ao fornecedor: valor do pedido e itens recebidos. Produto novo é cadastrado num
 * modal por cima deste; produto com tamanhos recebe a quantidade de cada tamanho. Todos os itens
 * entram no estoque como compra.
 */
export function SupplierOrderModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [orderedOn, setOrderedOn] = useState(() => localIsoDate());
  const [number, setNumber] = useState("");
  const [totalInCents, setTotalInCents] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>(() => [emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Item cujo produto está sendo cadastrado no modal por cima. */
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const hintId = useId();
  const dirty = useFormDirty({ orderedOn, number, totalInCents, notes, lines });
  useEffect(() => {
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
          setError(cause.message);
        }
      });
    return () => {
      alive = false;
    };
  }, []);
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
  const itemsCostInCents = lines.reduce(
    (sum, line) => sum + lineQuantity(line) * (line.unitCostInCents ?? 0),
    0,
  );
  function update(key: number, patch: Partial<OrderLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }
  function productCreated(product: Product) {
    setProducts((current) => [...(current ?? []), product]);
    if (creatingFor !== null)
      update(creatingFor, {
        productId: product.id,
        quantity: 1,
        sizeQuantities: {},
        ...(product.costInCents > 0
          ? { unitCostInCents: product.costInCents }
          : {}),
      });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (totalInCents === null) {
      setError("Informe o valor do pedido.");
      return;
    }
    if (lines.some((line) => !line.productId)) {
      setError("Escolha o produto de cada item ou remova o item vazio.");
      return;
    }
    const missingSizes = lines.findIndex(
      (line) => sizesOf(line).length > 0 && lineQuantity(line) === 0,
    );
    if (missingSizes >= 0) {
      setError(
        `Informe a quantidade de ao menos um tamanho no item ${missingSizes + 1}.`,
      );
      return;
    }
    const input: SupplierOrderInput = {
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
    };
    setBusy(true);
    setError("");
    try {
      await api.createSupplierOrder(supplier.id, input);
      toast.success("Pedido registrado e itens lançados no estoque.");
      onSaved();
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title="Novo pedido"
        subtitle={`Pedido feito a ${supplier.name}. Os itens entram no estoque como compra.`}
        wide
        busy={busy}
        inactive={creatingFor !== null}
        dirty={dirty}
        onClose={onClose}
      >
        <form className="clinical-form" onSubmit={submit}>
          {error && <p className="form-error">{error}</p>}
          <fieldset className="form-fields form-grid" disabled={busy}>
            <label>
              Data do pedido
              <input
                type="date"
                required
                value={orderedOn}
                onChange={(event) => setOrderedOn(event.target.value)}
              />
            </label>
            <label>
              Nº do pedido
              <input
                maxLength={60}
                placeholder="Opcional"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
            </label>
            <div className="field-with-hint">
              <label>
                Valor do pedido (R$)
                <MoneyInput
                  required
                  aria-describedby={hintId}
                  valueInCents={totalInCents}
                  onChange={setTotalInCents}
                />
              </label>
              <small className="field-hint" id={hintId}>
                {itemsCostInCents > 0
                  ? `Soma dos itens: ${currency.format(itemsCostInCents / 100)}`
                  : "Total pago ao fornecedor, com frete e descontos."}
              </small>
            </div>

            <fieldset className="form-fieldset span-2">
              <legend>Itens do pedido</legend>
              <div
                className="supplier-order-lines"
                role="group"
                aria-label="Itens"
              >
                {lines.map((line, index) => {
                  const position = index + 1;
                  const sizes = sizesOf(line);
                  return (
                    <div className="supplier-order-item" key={line.key}>
                      <div className="supplier-order-line">
                        <label>
                          Produto
                          <select
                            aria-label={`Produto ${position}`}
                            required
                            value={line.productId}
                            onChange={(event) =>
                              event.target.value === NEW_PRODUCT
                                ? setCreatingFor(line.key)
                                : update(line.key, {
                                    productId: event.target.value,
                                    quantity: 1,
                                    sizeQuantities: {},
                                  })
                            }
                          >
                            <option value="">
                              {products ? "Selecione" : "Carregando…"}
                            </option>
                            <option value={NEW_PRODUCT}>
                              + Novo produto (cadastrar)
                            </option>
                            {products?.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {sizes.length === 0 && (
                          <label>
                            Quantidade
                            <input
                              aria-label={`Quantidade ${position}`}
                              type="number"
                              required
                              min={1}
                              value={line.quantity}
                              onChange={(event) =>
                                update(line.key, {
                                  quantity: Math.max(
                                    1,
                                    Math.trunc(Number(event.target.value) || 1),
                                  ),
                                })
                              }
                            />
                          </label>
                        )}
                        <label>
                          Custo unitário (R$)
                          <MoneyInput
                            aria-label={`Custo unitário ${position}`}
                            placeholder="Opcional"
                            valueInCents={line.unitCostInCents}
                            onChange={(cents) =>
                              update(line.key, { unitCostInCents: cents })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="secondary-button"
                          aria-label={`Remover item ${position}`}
                          disabled={lines.length === 1}
                          onClick={() =>
                            setLines((current) =>
                              current.filter((other) => other.key !== line.key),
                            )
                          }
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                      {sizes.length > 0 && (
                        <fieldset className="form-fieldset">
                          <legend>Quantidade por tamanho</legend>
                          <div className="product-size-grid">
                            {sizes.map((size) => (
                              <label key={size}>
                                {productSizeLabel(size)}
                                <input
                                  aria-label={`Quantidade ${productSizeLabel(size)} do item ${position}`}
                                  type="number"
                                  min={0}
                                  value={line.sizeQuantities[size] ?? 0}
                                  onChange={(event) =>
                                    update(line.key, {
                                      sizeQuantities: {
                                        ...line.sizeQuantities,
                                        [size]: Math.max(
                                          0,
                                          Math.trunc(
                                            Number(event.target.value) || 0,
                                          ),
                                        ),
                                      },
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                          <p className="field-hint">
                            {`Total: ${lineQuantity(line)} ${productOf(line.productId)?.unit ?? "un"}. Deixe em 0 os tamanhos que não vieram.`}
                          </p>
                        </fieldset>
                      )}
                    </div>
                  );
                })}
                <div>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={lines.length >= 100}
                    onClick={() =>
                      setLines((current) => [...current, emptyLine()])
                    }
                  >
                    <Plus size={16} aria-hidden="true" /> Adicionar item
                  </button>
                </div>
                <p className="field-hint">
                  Produto que ainda não existe: escolha “Novo produto
                  (cadastrar)” para cadastrá-lo sem sair do pedido, com os
                  tamanhos que ele tiver. Sem preço de venda ele não pode ser
                  vendido.
                </p>
              </div>
            </fieldset>

            <label className="span-2">
              Observações
              <textarea
                maxLength={1000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </fieldset>
          <div className="modal-actions">
            <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
            <button className="primary-button" disabled={busy || !products}>
              {busy ? "Registrando…" : "Registrar pedido"}
            </button>
          </div>
        </form>
      </Modal>
      {creatingFor !== null && (
        <ProductModal
          product="new"
          fromSupplierOrder
          onClose={() => setCreatingFor(null)}
          onSaved={productCreated}
        />
      )}
    </>
  );
}
