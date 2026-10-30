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

/** Valor do seletor de produto que cadastra um produto novo a partir do pedido. */
const NEW_PRODUCT = "new";

type OrderLine = {
  key: number;
  /** Id do produto cadastrado, `NEW_PRODUCT` ou "" (ainda não escolhido). */
  productId: string;
  productName: string;
  size: ProductSize | "";
  quantity: number;
  unitCostInCents: number | null;
};

let nextLineKey = 1;
const emptyLine = (): OrderLine => ({
  key: nextLineKey++,
  productId: "",
  productName: "",
  size: "",
  quantity: 1,
  unitCostInCents: null,
});

/**
 * Novo pedido ao fornecedor: valor do pedido e itens recebidos. Item novo vira produto sem
 * preço de venda; todos os itens entram no estoque como compra.
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
  const itemsCostInCents = lines.reduce(
    (sum, line) => sum + line.quantity * (line.unitCostInCents ?? 0),
    0,
  );
  function update(key: number, patch: Partial<OrderLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
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
    const input: SupplierOrderInput = {
      orderedOn,
      number,
      totalInCents,
      notes,
      items: lines.map((line) => ({
        ...(line.productId === NEW_PRODUCT
          ? { productName: line.productName }
          : { productId: line.productId }),
        ...(line.size ? { size: line.size } : {}),
        quantity: line.quantity,
        ...(line.unitCostInCents !== null
          ? { unitCostInCents: line.unitCostInCents }
          : {}),
      })),
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
    <Modal
      title="Novo pedido"
      subtitle={`Pedido feito a ${supplier.name}. Os itens entram no estoque como compra.`}
      wide
      busy={busy}
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
                const product = productOf(line.productId);
                return (
                  <div className="supplier-order-line" key={line.key}>
                    <label>
                      Produto
                      <select
                        aria-label={`Produto ${position}`}
                        required
                        value={line.productId}
                        onChange={(event) =>
                          update(line.key, {
                            productId: event.target.value,
                            size: "",
                          })
                        }
                      >
                        <option value="">
                          {products ? "Selecione" : "Carregando…"}
                        </option>
                        <option value={NEW_PRODUCT}>
                          Novo produto (cadastrar)
                        </option>
                        {products?.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {line.productId === NEW_PRODUCT && (
                      <label>
                        Nome do produto
                        <input
                          aria-label={`Nome do produto ${position}`}
                          required
                          minLength={2}
                          maxLength={160}
                          value={line.productName}
                          onChange={(event) =>
                            update(line.key, {
                              productName: event.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                    {product && product.sizes.length > 0 && (
                      <label>
                        Tamanho
                        <select
                          aria-label={`Tamanho ${position}`}
                          required
                          value={line.size}
                          onChange={(event) =>
                            update(line.key, {
                              size: event.target.value as ProductSize | "",
                            })
                          }
                        >
                          <option value="">Selecione</option>
                          {product.sizes.map((size) => (
                            <option key={size} value={size}>
                              {productSizeLabel(size)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
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
                Produto novo entra no cadastro sem preço de venda: defina o
                preço em Vendas › Estoque antes de vendê-lo.
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
  );
}
