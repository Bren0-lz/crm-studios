import type {
  ClinicCatalogEntry,
  InventoryWorkspace,
  Product,
  ProductInput,
  ProductSize,
  ProductUpdateInput,
  StockMovement,
  StockMovementInput,
} from "@crm/contracts";
import {
  productSizeLabels,
  productSizeSchema,
  sortProductSizes,
} from "@crm/contracts";
import { ChevronDown, Pencil, Plus, ShoppingCart } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { useToast } from "../../shared/feedback/toast-context";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { currency, shortDate } from "../../shared/lib/formatting";

type ProductForm = ProductInput & { sizes: ProductSize[] };

const emptyProduct: ProductForm = {
  name: "",
  sku: "",
  unit: "un",
  costInCents: 0,
  salePriceInCents: 0,
  initialStock: 0,
  minimumStock: 0,
  sizes: [],
};
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
  if (product.lowStock) return { label: "Estoque baixo", className: "paused" };
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
    [categories, setCategories] = useState<ClinicCatalogEntry[]>([]),
    [brands, setBrands] = useState<ClinicCatalogEntry[]>([]),
    [editor, setEditor] = useState<Product | "new" | null>(null),
    [adjusting, setAdjusting] = useState(false),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(""),
    [form, setForm] = useState<ProductForm>(emptyProduct),
    [active, setActive] = useState(true),
    [hasSizes, setHasSizes] = useState(false),
    [adjustment, setAdjustment] = useState<StockMovementInput>(emptyAdjustment);
  const version = useDataVersion("inventory");
  const productDirty = useFormDirty(
    { form, active, hasSizes },
    Boolean(editor),
  );
  const adjustmentDirty = useFormDirty(adjustment, adjusting);
  useEffect(() => {
    let alive = true;
    Promise.all([
      api.clinicCatalog("product_category"),
      api.clinicCatalog("product_brand"),
    ])
      .then(([categoryData, brandData]) => {
        if (alive) {
          setCategories(categoryData);
          setBrands(brandData);
        }
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, []);
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
  function edit(product: Product | "new") {
    setForm(product === "new" ? emptyProduct : { ...product, initialStock: 0 });
    setActive(product === "new" ? true : product.active);
    setHasSizes(product !== "new" && product.sizes.length > 0);
    setFormError("");
    setEditor(product);
  }
  function openAdjustment() {
    setAdjustment(emptyAdjustment);
    setFormError("");
    setAdjusting(true);
  }
  function toggleSize(size: ProductSize, checked: boolean) {
    setForm({
      ...form,
      sizes: sortProductSizes(
        checked
          ? [...form.sizes, size]
          : form.sizes.filter((item) => item !== size),
      ),
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (hasSizes && !form.sizes.length) {
      setFormError("Selecione ao menos um tamanho.");
      return;
    }
    const input = { ...form, sizes: hasSizes ? form.sizes : [] };
    setBusy(true);
    setFormError("");
    try {
      if (editor === "new") await api.createProduct(input);
      else if (editor)
        await api.updateProduct(editor.id, {
          ...input,
          active,
        } as ProductUpdateInput);
      toast.success(
        editor === "new" ? "Produto cadastrado." : "Produto atualizado.",
      );
      setEditor(null);
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function adjust(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      await api.createStockMovement(adjustment);
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
                <button className="primary-button" onClick={() => edit("new")}>
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
            <table className="dre-table inventory-table">
              <caption className="sr-only">Produtos em estoque</caption>
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col">Situação</th>
                  <th scope="col" className="numeric-value">
                    Estoque
                  </th>
                  <th scope="col" className="numeric-value">
                    Mínimo
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
                        {product.sizes.length > 0 && (
                          <small>
                            {`Tamanhos: ${product.sizes.map((size) => productSizeLabels[size]).join(", ")}`}
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
                      {product.minimumStock} {product.unit}
                    </td>
                    <td className="numeric-value">
                      {currency.format(product.costInCents / 100)}
                    </td>
                    <td className="numeric-value">
                      {currency.format(product.salePriceInCents / 100)}
                    </td>
                    <td className="numeric-value">
                      {can("patients.products_update") && (
                        <button
                          type="button"
                          className="secondary-button button-sm"
                          aria-label={`Editar ${product.name}`}
                          onClick={() => edit(product)}
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
                        <th scope="row">{item.productName}</th>
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
        <Modal
          title={editor === "new" ? "Novo produto" : "Editar produto"}
          subtitle="Preços e classificação. O saldo muda pelos ajustes de estoque."
          busy={busy}
          dirty={productDirty}
          onClose={() => setEditor(null)}
        >
          <form className="clinical-form" onSubmit={save}>
            {formError && <p className="form-error">{formError}</p>}
            <div className="form-grid">
              <label>
                Nome
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>
              <label>
                Código do produto
                <input
                  required
                  value={form.sku}
                  onChange={(event) =>
                    setForm({ ...form, sku: event.target.value })
                  }
                />
              </label>
              <label>
                Unidade
                <input
                  required
                  value={form.unit}
                  onChange={(event) =>
                    setForm({ ...form, unit: event.target.value })
                  }
                />
              </label>
              <CurrencyField
                label="Custo"
                value={form.costInCents}
                onChange={(value) => setForm({ ...form, costInCents: value })}
              />
              <CurrencyField
                label="Preço de venda"
                value={form.salePriceInCents}
                onChange={(value) =>
                  setForm({ ...form, salePriceInCents: value })
                }
              />
              {editor === "new" && (
                <label>
                  Estoque inicial
                  <input
                    type="number"
                    min={0}
                    value={form.initialStock}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        initialStock: Number(event.target.value),
                      })
                    }
                  />
                </label>
              )}
              <label>
                Estoque mínimo
                <input
                  type="number"
                  min={0}
                  value={form.minimumStock}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      minimumStock: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Categoria
                <select
                  value={form.categoryId ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      categoryId: event.target.value || null,
                    })
                  }
                >
                  <option value="">Não classificado</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Marca
                <select
                  value={form.brandId ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, brandId: event.target.value || null })
                  }
                >
                  <option value="">Não informada</option>
                  {brands.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-field span-2">
                <input
                  type="checkbox"
                  checked={hasSizes}
                  onChange={(event) => setHasSizes(event.target.checked)}
                />
                Possui distinção por tamanhos
              </label>
              {hasSizes && (
                <fieldset className="form-fieldset span-2">
                  <legend>Tamanhos disponíveis</legend>
                  <div className="product-size-grid">
                    {productSizeSchema.options.map((size) => (
                      <label key={size} className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={form.sizes.includes(size)}
                          onChange={(event) =>
                            toggleSize(size, event.target.checked)
                          }
                        />
                        {productSizeLabels[size]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {editor !== "new" && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) => setActive(event.target.checked)}
                  />
                  Ativo
                </label>
              )}
            </div>
            <div className="modal-actions">
              <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
              <button className="primary-button" disabled={busy}>
                Salvar produto
              </button>
            </div>
          </form>
        </Modal>
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
                onChange={(event) =>
                  setAdjustment({
                    ...adjustment,
                    productId: event.target.value,
                  })
                }
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
