import type {
  ClinicCatalogEntry,
  InventoryWorkspace,
  Product,
  ProductInput,
  ProductUpdateInput,
  StockMovementInput,
} from "@crm/contracts";
import { Plus } from "lucide-react";
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
import { currency } from "../../shared/lib/formatting";

const emptyProduct: ProductInput = {
  name: "",
  sku: "",
  unit: "un",
  costInCents: 0,
  salePriceInCents: 0,
  initialStock: 0,
  minimumStock: 0,
};
const emptyAdjustment: StockMovementInput = {
  productId: "",
  kind: "purchase",
  quantity: 1,
  notes: "",
};

/** Aba "Estoque" do Financeiro (QM9): produtos, saldo e ajustes de estoque. */
export function InventorySection() {
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
    [form, setForm] = useState<ProductInput>(emptyProduct),
    [active, setActive] = useState(true),
    [adjustment, setAdjustment] = useState<StockMovementInput>(emptyAdjustment);
  const version = useDataVersion("inventory");
  const productDirty = useFormDirty({ form, active }, Boolean(editor));
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
    setFormError("");
    setEditor(product);
  }
  function openAdjustment() {
    setAdjustment(emptyAdjustment);
    setFormError("");
    setAdjusting(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      if (editor === "new") await api.createProduct(form);
      else if (editor)
        await api.updateProduct(editor.id, {
          ...form,
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
            <span className="eyebrow">Estoque</span>
            <h2>Produtos</h2>
          </div>
          {data && (
            <div className="page-actions">
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
        <div className="inventory-body">
          {error && <ErrorBanner error={error} />}
          {!data ? (
            !error && <LoadingBlock />
          ) : !data.products.length ? (
            <EmptyState
              title="Nenhum produto"
              copy="Cadastre os produtos vendidos pela clínica."
            />
          ) : (
            data.products.map((product) => (
              <div className="table-row" key={product.id}>
                <strong>{product.name}</strong>
                <span>
                  {product.currentStock} {product.unit}
                  {product.lowStock ? " · estoque baixo" : ""}
                  {!product.active ? " · inativo" : ""}
                </span>
                <span className="numeric-value">
                  {currency.format(product.salePriceInCents / 100)}
                </span>
                {can("patients.products_update") && (
                  <button
                    className="secondary-button"
                    onClick={() => edit(product)}
                  >
                    Editar
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>
      {data && (
        <section className="panel">
          <details>
            <summary className="panel-head">Histórico de estoque</summary>
            <div className="inventory-body">
              {!data.movements.length ? (
                <EmptyState
                  title="Sem histórico"
                  copy="Entradas, saídas e ajustes de estoque aparecem aqui."
                />
              ) : (
                data.movements.map((item) => (
                  <p key={item.id}>
                    {item.productName} · {item.quantity > 0 ? "+" : ""}
                    {item.quantity} · saldo {item.balanceAfter} · {item.notes}
                  </p>
                ))
              )}
            </div>
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
