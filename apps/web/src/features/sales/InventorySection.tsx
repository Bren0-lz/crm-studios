import type {
  InventoryWorkspace,
  Product,
  ProductSize,
  StockMovement,
  StockMovementInput,
} from "@crm/contracts";
import { productItemName, productSizeLabel } from "@crm/contracts";
import { ChevronDown, Pencil, Plus, ShoppingCart } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { useToast } from "../../shared/feedback/toast-context";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { currency, shortDate } from "../../shared/lib/formatting";
import {
  restockSizes,
  sizeChoiceValue,
  sizeStockSummary,
  sizeStockText,
  soldOutSizes,
  stockChoices,
} from "./model";
import { ProductModal } from "./ProductModal";

const emptyAdjustment: StockMovementInput = {
  productId: "",
  kind: "purchase",
  quantity: 1,
  notes: "",
};

const movementLabels: Record<StockMovement["kind"], string> = {
  initial_stock: "Estoque inicial",
  purchase: "Compra / entrada",
  adjustment_in: "Ajuste de entrada",
  adjustment_out: "Ajuste de saída",
  loss: "Perda",
  sale: "Venda",
  sale_reversal: "Estorno de venda",
};

function productStatus(product: Product) {
  if (!product.active) return { label: "Inativo", className: "" };
  if (product.currentStock <= 0)
    return { label: "Sem estoque", className: "overdue" };
  if (product.lowStock) return { label: "Repor estoque", className: "paused" };
  return { label: "Ativo", className: "active" };
}

/** Aba "Estoque" de Vendas de produtos (QM9): produtos, saldo e ajustes de estoque. */
export function InventorySection({
  onSell,
}: {
  /** Abre a sub-aba "Nova venda"; ausente quando falta permissão para vender. */
  onSell?: (() => void) | undefined;
}) {
  const { can } = useAuthorization();
  const toast = useToast();
  const [data, setData] = useState<InventoryWorkspace | null>(null),
    [error, setError] = useState(""),
    [editor, setEditor] = useState<Product | "new" | null>(null),
    [adjusting, setAdjusting] = useState(false),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(""),
    [adjustment, setAdjustment] = useState<StockMovementInput>(emptyAdjustment),
    [sizeChoice, setSizeChoice] = useState("");
  const version = useDataVersion("inventory");
  const adjustmentDirty = useFormDirty({ adjustment, sizeChoice }, adjusting);
  // Recarrega em silêncio quando uma mutação muda o estoque (QC6).
  useEffect(() => {
    let alive = true;
    api
      .inventoryWorkspace()
      .then((workspace) => {
        if (alive) {
          setData(workspace);
          setError("");
        }
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [version]);
  const adjustedProduct = data?.products.find(
    (item) => item.id === adjustment.productId,
  );
  const adjustedChoices = adjustedProduct ? stockChoices(adjustedProduct) : [];
  // Produto com tamanhos sempre pede o tamanho; sem tamanhos, só quando há sobra de tamanho antigo.
  const asksSize =
    Boolean(adjustedProduct?.sizes.length) || adjustedChoices.length > 1;
  const adjustmentOut =
    adjustment.kind === "adjustment_out" || adjustment.kind === "loss";
  function openAdjustment() {
    setSizeChoice("");
    setAdjustment(emptyAdjustment);
    setFormError("");
    setAdjusting(true);
  }
  async function adjust(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      await api.createStockMovement({
        ...adjustment,
        ...(sizeChoice && sizeChoice !== "none"
          ? { size: sizeChoice as ProductSize }
          : {}),
      });
      toast.success("Estoque ajustado.");
      setAdjusting(false);
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel finance-panel" aria-label="Estoque">
        <div className="panel-head">
          <div>
            <h2>Produtos</h2>
          </div>
          {data && (
            <div className="page-actions">
              {onSell && (
                <button className="secondary-button" onClick={onSell}>
                  <ShoppingCart size={18} /> Registrar venda
                </button>
              )}
              {can("patients.stock_move") && (
                <button className="secondary-button" onClick={openAdjustment}>
                  Ajustar estoque
                </button>
              )}
              {can("patients.products_create") && (
                <button
                  className="primary-button"
                  onClick={() => setEditor("new")}
                >
                  <Plus size={18} /> Novo produto
                </button>
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="inventory-body">
            <ErrorBanner error={error} />
          </div>
        )}
        {!data ? (
          !error && (
            <div className="inventory-body">
              <LoadingBlock />
            </div>
          )
        ) : !data.products.length ? (
          <div className="inventory-body">
            <EmptyState
              title="Nenhum produto"
              copy="Cadastre os produtos vendidos pela clínica."
            />
          </div>
        ) : (
          <div className="table-scroll">
            <table className="dre-table inventory-table inventory-products-table">
              <caption className="sr-only">Produtos em estoque</caption>
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col">Situação</th>
                  <th scope="col" className="numeric-value">
                    Estoque
                  </th>
                  <th scope="col" className="numeric-value">
                    Custo
                  </th>
                  <th scope="col" className="numeric-value">
                    Preço de venda
                  </th>
                  <th scope="col" className="numeric-value">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((product) => (
                  <tr key={product.id}>
                    <th scope="row">
                      <span className="inventory-product">
                        <strong>{product.name}</strong>
                        <small>{product.sku}</small>
                        {product.sizeStock.length > 0 && (
                          <ul
                            className="inventory-size-stock"
                            aria-label={`Estoque por tamanho: ${sizeStockText(product)}`}
                          >
                            {sizeStockSummary(product).map((entry) => (
                              <li
                                key={entry.key}
                                className={`inventory-size-chip ${entry.state.replace("_", "-")}`}
                              >
                                <span>{entry.label}</span>
                                <strong>{entry.stock}</strong>
                              </li>
                            ))}
                          </ul>
                        )}
                        {soldOutSizes(product).length > 0 && (
                          <small className="inventory-sold-out">
                            Esgotado: {soldOutSizes(product).join(", ")}
                          </small>
                        )}
                        {restockSizes(product).length > 0 && (
                          <small className="inventory-restock-sizes">
                            Repor: {restockSizes(product).join(", ")}
                          </small>
                        )}
                      </span>
                    </th>
                    <td>
                      <span
                        className={`status-pill ${productStatus(product).className}`}
                      >
                        {productStatus(product).label}
                      </span>
                    </td>
                    <td className="numeric-value">
                      {product.currentStock} {product.unit}
                    </td>
                    <td className="numeric-value">
                      {currency.format(product.costInCents / 100)}
                    </td>
                    <td className="numeric-value">
                      {product.salePriceInCents === null ? (
                        <span className="status-pill paused">Sem preço</span>
                      ) : (
                        currency.format(product.salePriceInCents / 100)
                      )}
                    </td>
                    <td className="numeric-value">
                      {can("patients.products_update") && (
                        <button
                          type="button"
                          className="secondary-button button-sm"
                          aria-label={`Editar ${product.name}`}
                          onClick={() => setEditor(product)}
                        >
                          <Pencil size={15} aria-hidden="true" />
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {data && (
        <section className="panel inventory-history-panel">
          <details className="inventory-history">
            <summary className="panel-head">
              <div>
                <h2>Histórico de estoque</h2>
                <p className="panel-context">
                  {data.movements.length === 1
                    ? "1 movimentação"
                    : `${data.movements.length} movimentações`}
                </p>
              </div>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            {!data.movements.length ? (
              <div className="inventory-body">
                <EmptyState
                  title="Sem histórico"
                  copy="Entradas, saídas e ajustes de estoque aparecem aqui."
                />
              </div>
            ) : (
              <div className="table-scroll">
                <table className="dre-table inventory-table">
                  <caption className="sr-only">
                    Movimentações de estoque
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Produto</th>
                      <th scope="col">Tipo</th>
                      <th scope="col" className="numeric-value">
                        Quantidade
                      </th>
                      <th scope="col" className="numeric-value">
                        Saldo
                      </th>
                      <th scope="col">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.movements.map((item) => (
                      <tr key={item.id}>
                        <td className="inventory-muted">
                          {shortDate.format(new Date(item.createdAt))}
                        </td>
                        <th scope="row">{productItemName(item)}</th>
                        <td>{movementLabels[item.kind]}</td>
                        <td
                          className={`numeric-value ${item.quantity > 0 ? "inventory-in" : "inventory-out"}`}
                        >
                          {item.quantity > 0 ? "+" : ""}
                          {item.quantity}
                        </td>
                        <td className="numeric-value">{item.balanceAfter}</td>
                        <td className="inventory-notes">{item.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>
        </section>
      )}
      {editor && (
        <ProductModal product={editor} onClose={() => setEditor(null)} />
      )}
      {adjusting && (
        <Modal
          title="Ajustar estoque"
          subtitle="Toda entrada, saída e ajuste fica no histórico de estoque."
          busy={busy}
          dirty={adjustmentDirty}
          onClose={() => setAdjusting(false)}
        >
          <form className="clinical-form" onSubmit={adjust}>
            {formError && <p className="form-error">{formError}</p>}
            <label>
              Produto
              <select
                required
                value={adjustment.productId}
                onChange={(event) => {
                  setSizeChoice("");
                  setAdjustment({
                    ...adjustment,
                    productId: event.target.value,
                  });
                }}
              >
                <option value="">Selecione</option>
                {data?.products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select
                value={adjustment.kind}
                onChange={(event) =>
                  setAdjustment({
                    ...adjustment,
                    kind: event.target.value as StockMovementInput["kind"],
                  })
                }
              >
                <option value="purchase">Compra / entrada</option>
                <option value="adjustment_in">Ajuste de entrada</option>
                <option value="adjustment_out">Ajuste de saída</option>
                <option value="loss">Perda</option>
              </select>
            </label>
            {asksSize && (
              <label>
                Tamanho
                <select
                  required
                  value={sizeChoice}
                  onChange={(event) => setSizeChoice(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {adjustedChoices.map((choice) => (
                    <option
                      key={sizeChoiceValue(choice.size)}
                      value={sizeChoiceValue(choice.size)}
                      disabled={!choice.configured && !adjustmentOut}
                    >
                      {`${productSizeLabel(choice.size)} · ${choice.currentStock} ${adjustedProduct?.unit ?? ""}${choice.configured ? "" : " (fora dos tamanhos)"}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Quantidade
              <input
                type="number"
                required
                min={1}
                value={adjustment.quantity}
                onChange={(event) =>
                  setAdjustment({
                    ...adjustment,
                    quantity: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Motivo
              <textarea
                required
                minLength={3}
                value={adjustment.notes}
                onChange={(event) =>
                  setAdjustment({ ...adjustment, notes: event.target.value })
                }
              />
            </label>
            <div className="modal-actions">
              <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
              <button className="primary-button" disabled={busy}>
                Salvar ajuste
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
