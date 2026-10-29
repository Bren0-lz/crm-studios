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
  productItemName,
  productSizeLabel,
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
import { sizeChoiceValue, soldOutSizes, stockChoices } from "./model";
import {
  NewCatalogEntryModal,
  type ProductCatalogKind,
} from "./NewCatalogEntryModal";

/** Opção do select de categoria/marca que abre o cadastro rápido. */
const NEW_CATALOG_ENTRY = "__new__";

type ProductForm = ProductInput & { sizes: ProductSize[] };

const emptyProduct: ProductForm = {
  name: "",
  sku: "",
  unit: "un",
  costInCents: 0,
  salePriceInCents: 0,
  initialStock: 0,
  restockAlertAt: null,
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

/** Saldo atual de cada tamanho configurado, como o formulário edita. */
function currentSizeStock(product: Product) {
  const stock: Partial<Record<ProductSize, number>> = {};
  for (const entry of product.sizeStock)
    if (entry.size) stock[entry.size] = entry.currentStock;
  return stock;
}

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
  const { can, user } = useAuthorization();
  // Cadastrar categoria e marca é exclusivo do administrador (como em Configurações › Cadastros).
  const canCreateCatalog = user?.role === "admin";
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
    [restockAlert, setRestockAlert] = useState(false),
    [sizeQuantities, setSizeQuantities] = useState<
      Partial<Record<ProductSize, number>>
    >({}),
    [catalogCreator, setCatalogCreator] = useState<ProductCatalogKind | null>(
      null,
    ),
    [adjustment, setAdjustment] = useState<StockMovementInput>(emptyAdjustment),
    [sizeChoice, setSizeChoice] = useState("");
  const version = useDataVersion("inventory");
  const productDirty = useFormDirty(
    { form, active, hasSizes, restockAlert, sizeQuantities },
    Boolean(editor),
  );
  const adjustmentDirty = useFormDirty({ adjustment, sizeChoice }, adjusting);
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
    setRestockAlert(product !== "new" && product.restockAlertAt !== null);
    setSizeQuantities(product === "new" ? {} : currentSizeStock(product));
    setFormError("");
    setEditor(product);
  }
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
  function catalogCreated(entry: ClinicCatalogEntry) {
    if (catalogCreator === "product_category") {
      setCategories((items) => [...items, entry]);
      setForm((current) => ({ ...current, categoryId: entry.id }));
    } else {
      setBrands((items) => [...items, entry]);
      setForm((current) => ({ ...current, brandId: entry.id }));
    }
    setCatalogCreator(null);
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
    const sizes = hasSizes ? form.sizes : [];
    const quantities = sizes.map((size) => ({
      size,
      quantity: sizeQuantities[size] ?? 0,
    }));
    const fields: ProductInput = {
      ...form,
      sizes,
      restockAlertAt: restockAlert ? (form.restockAlertAt ?? 1) : null,
    };
    setBusy(true);
    setFormError("");
    try {
      if (editor === "new")
        await api.createProduct({
          ...fields,
          ...(sizes.length
            ? {
                initialStock: 0,
                initialSizeStock: quantities.filter(
                  (entry) => entry.quantity > 0,
                ),
              }
            : {}),
        });
      else if (editor) {
        // Só os tamanhos cujo saldo mudou: o resto do estoque segue o que estiver gravado.
        const current = currentSizeStock(editor);
        await api.updateProduct(editor.id, {
          ...fields,
          active,
          sizeQuantities: quantities.filter(
            (entry) => entry.quantity !== (current[entry.size] ?? 0),
          ),
        } as ProductUpdateInput);
      }
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
                          <small>
                            {product.sizeStock
                              .map(
                                (entry) =>
                                  `${productSizeLabel(entry.size)}: ${entry.currentStock}`,
                              )
                              .join(" · ")}
                          </small>
                        )}
                        {soldOutSizes(product).length > 0 && (
                          <small className="inventory-sold-out">
                            Esgotado: {soldOutSizes(product).join(", ")}
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
        <Modal
          title={editor === "new" ? "Novo produto" : "Editar produto"}
          subtitle="Preços e classificação. O saldo muda pelos ajustes de estoque."
          busy={busy}
          inactive={Boolean(catalogCreator)}
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
              {editor === "new" && !hasSizes && (
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
                Categoria
                <select
                  value={form.categoryId ?? ""}
                  onChange={(event) =>
                    event.target.value === NEW_CATALOG_ENTRY
                      ? setCatalogCreator("product_category")
                      : setForm({
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
                  {canCreateCatalog && (
                    <option value={NEW_CATALOG_ENTRY}>+ Nova categoria</option>
                  )}
                </select>
              </label>
              <label>
                Marca
                <select
                  value={form.brandId ?? ""}
                  onChange={(event) =>
                    event.target.value === NEW_CATALOG_ENTRY
                      ? setCatalogCreator("product_brand")
                      : setForm({
                          ...form,
                          brandId: event.target.value || null,
                        })
                  }
                >
                  <option value="">Não informada</option>
                  {brands.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                  {canCreateCatalog && (
                    <option value={NEW_CATALOG_ENTRY}>+ Nova marca</option>
                  )}
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
                  {editor !== "new" && (
                    <p className="field-hint">
                      O saldo de um tamanho desmarcado continua no estoque até
                      ser baixado por um ajuste.
                    </p>
                  )}
                </fieldset>
              )}
              {hasSizes && form.sizes.length > 0 && (
                <fieldset className="form-fieldset span-2">
                  <legend>
                    {editor === "new"
                      ? "Estoque inicial por tamanho"
                      : "Quantidade por tamanho"}
                  </legend>
                  <div className="product-size-grid">
                    {form.sizes.map((size) => (
                      <label key={size}>
                        {`${editor === "new" ? "Estoque inicial" : "Quantidade"} ${productSizeLabels[size]}`}
                        <input
                          type="number"
                          min={0}
                          value={sizeQuantities[size] ?? 0}
                          onChange={(event) =>
                            setSizeQuantities({
                              ...sizeQuantities,
                              [size]: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {editor !== "new" && (
                    <p className="field-hint">
                      Mudar uma quantidade registra um ajuste no histórico de
                      estoque.
                    </p>
                  )}
                </fieldset>
              )}
              <fieldset className="form-fieldset restock-fieldset span-2">
                <legend>Aviso de reposição</legend>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={restockAlert}
                    onChange={(event) => {
                      setRestockAlert(event.target.checked);
                      if (event.target.checked && !form.restockAlertAt)
                        setForm({ ...form, restockAlertAt: 1 });
                    }}
                  />
                  Avisar quando for hora de repor
                </label>
                {restockAlert && (
                  <label className="restock-quantity">
                    Avisar quando restarem
                    <input
                      type="number"
                      required
                      min={1}
                      value={form.restockAlertAt ?? ""}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          restockAlertAt: Number(event.target.value) || null,
                        })
                      }
                    />
                  </label>
                )}
                <p className="field-hint">
                  Opcional. Quando o estoque chegar à quantidade escolhida, o
                  produto aparece como “Repor estoque” na lista e entra em
                  “Produtos para repor” nos Indicadores.
                  {hasSizes && " Vale o total somando todos os tamanhos."}
                </p>
              </fieldset>
              {editor !== "new" && (
                <label className="checkbox-field span-2">
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
      {editor && catalogCreator && (
        <NewCatalogEntryModal
          kind={catalogCreator}
          onClose={() => setCatalogCreator(null)}
          onCreated={catalogCreated}
        />
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
