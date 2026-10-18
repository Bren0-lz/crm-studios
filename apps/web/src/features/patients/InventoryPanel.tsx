import type {
  InventoryWorkspace,
  PatientTab,
  Product,
  ProductInput,
  ProductUpdateInput,
  StockMovementInput,
  ClinicCatalogEntry,
  PatientOption,
} from "@crm/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { Modal } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { EmptyState } from "../../shared/components/EmptyState";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency } from "../../shared/lib/formatting";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { PatientTabModal } from "./PatientTabModal";

export function InventoryPanel({
  patientId,
}: {
  patientId?: string | undefined;
}) {
  const { can } = useAuthorization();
  const [opened, setOpened] = useState(false),
    [data, setData] = useState<InventoryWorkspace | null>(null),
    [error, setError] = useState(""),
    [categories, setCategories] = useState<ClinicCatalogEntry[]>([]),
    [brands, setBrands] = useState<ClinicCatalogEntry[]>([]),
    [patients, setPatients] = useState<PatientOption[]>([]);
  const [editor, setEditor] = useState<Product | "new" | null>(null),
    [stock, setStock] = useState(false),
    [opening, setOpening] = useState(false),
    [selected, setSelected] = useState<PatientTab | null>(null),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ProductInput>({
      name: "",
      sku: "",
      unit: "un",
      costInCents: 0,
      salePriceInCents: 0,
      initialStock: 0,
      minimumStock: 0,
    }),
    [active, setActive] = useState(true),
    [stockForm, setStockForm] = useState<StockMovementInput>({
      productId: "",
      kind: "purchase",
      quantity: 1,
      notes: "",
    }),
    [client, setClient] = useState(patientId ?? ""),
    [notes, setNotes] = useState("");
  async function load() {
    setData(await api.inventoryWorkspace());
  }
  const version = useDataVersion("inventory");
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    Promise.all([
      api.clinicCatalog("product_category"),
      api.clinicCatalog("product_brand"),
      api.patientOptions(),
    ])
      .then(([categoryData, brandData, patientData]) => {
        if (alive) {
          setCategories(categoryData);
          setBrands(brandData);
          setPatients(patientData);
        }
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [opened]);
  // Estoque e comandas: recarrega em silêncio quando uma mutação muda o domínio (QC6).
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    api
      .inventoryWorkspace()
      .then((workspace) => {
        if (alive) setData(workspace);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [opened, version]);
  if (!can("patients.inventory_view")) return null;
  function edit(product: Product | "new") {
    setForm(
      product === "new"
        ? {
            name: "",
            sku: "",
            unit: "un",
            costInCents: 0,
            salePriceInCents: 0,
            initialStock: 0,
            minimumStock: 0,
          }
        : { ...product, initialStock: 0 },
    );
    setActive(product === "new" ? true : product.active);
    setEditor(product);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editor === "new") await api.createProduct(form);
      else if (editor)
        await api.updateProduct(editor.id, {
          ...form,
          active,
        } as ProductUpdateInput);
      await load();
      setEditor(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function move(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createStockMovement(stockForm);
      await load();
      setStock(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openTab(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const tab = await api.openPatientTab({ patientId: client, notes });
      await load();
      setOpening(false);
      setSelected(tab);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <details
        onToggle={(event) => {
          if (event.currentTarget.open) setOpened(true);
        }}
      >
        <summary className="panel-head">Estoque e comandas</summary>
        {opened && (
          <div className="inventory-body">
            {error && <ErrorBanner error={error} />}
            {!data ? (
              !error && <LoadingBlock />
            ) : (
              <>
                <div className="page-actions">
                  {can("patients.products_create") && (
                    <button
                      className="primary-button"
                      onClick={() => edit("new")}
                    >
                      Novo produto
                    </button>
                  )}
                  {can("patients.stock_move") && (
                    <button
                      className="secondary-button"
                      onClick={() => setStock(true)}
                    >
                      Movimentar estoque
                    </button>
                  )}
                  {can("patients.tabs_create") && (
                    <button
                      className="primary-button"
                      onClick={() => setOpening(true)}
                    >
                      Abrir comanda
                    </button>
                  )}
                </div>
                <h3>Produtos</h3>
                {!data.products.length ? (
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
                <h3>Comandas</h3>
                {!data.tabs.filter(
                  (tab) => !patientId || tab.patientId === patientId,
                ).length ? (
                  <EmptyState
                    title="Nenhuma comanda"
                    copy="Abra uma comanda para registrar produtos e serviços do cliente."
                  />
                ) : (
                  data.tabs
                    .filter((tab) => !patientId || tab.patientId === patientId)
                    .map((tab) => (
                      <div className="table-row" key={tab.id}>
                        <strong>{tab.patientName}</strong>
                        <span>
                          {tab.status === "open"
                            ? "Aberta"
                            : tab.status === "closed"
                              ? "Fechada"
                              : "Cancelada"}
                        </span>
                        <span className="numeric-value">
                          {currency.format(tab.totalInCents / 100)}
                        </span>
                        <button
                          className="secondary-button"
                          onClick={() => setSelected(tab)}
                        >
                          Abrir comanda
                        </button>
                      </div>
                    ))
                )}
                <details>
                  <summary>Histórico de estoque</summary>
                  {data.movements.map((item) => (
                    <p key={item.id}>
                      {item.productName} · {item.quantity > 0 ? "+" : ""}
                      {item.quantity} · saldo {item.balanceAfter} · {item.notes}
                    </p>
                  ))}
                </details>
              </>
            )}
            {editor && (
              <Modal
                title={editor === "new" ? "Novo produto" : "Editar produto"}
                subtitle="Preços e classificação. O saldo é alterado pelas movimentações."
                busy={busy}
                onClose={() => setEditor(null)}
              >
                <form className="clinical-form" onSubmit={save}>
                  {error && <ErrorBanner error={error} />}
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
                      onChange={(value) =>
                        setForm({ ...form, costInCents: value })
                      }
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
                          setForm({
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
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => setEditor(null)}
                    >
                      Cancelar
                    </button>
                    <button className="primary-button" disabled={busy}>
                      Salvar produto
                    </button>
                  </div>
                </form>
              </Modal>
            )}
            {stock && (
              <Modal
                title="Movimentar estoque"
                subtitle="Toda entrada, saída e ajuste preserva o histórico."
                busy={busy}
                onClose={() => setStock(false)}
              >
                <form className="clinical-form" onSubmit={move}>
                  {error && <ErrorBanner error={error} />}
                  <label>
                    Produto
                    <select
                      required
                      value={stockForm.productId}
                      onChange={(event) =>
                        setStockForm({
                          ...stockForm,
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
                    Movimento
                    <select
                      value={stockForm.kind}
                      onChange={(event) =>
                        setStockForm({
                          ...stockForm,
                          kind: event.target
                            .value as StockMovementInput["kind"],
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
                      value={stockForm.quantity}
                      onChange={(event) =>
                        setStockForm({
                          ...stockForm,
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
                      value={stockForm.notes}
                      onChange={(event) =>
                        setStockForm({
                          ...stockForm,
                          notes: event.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="modal-actions">
                    <button className="primary-button" disabled={busy}>
                      Registrar movimento
                    </button>
                  </div>
                </form>
              </Modal>
            )}
            {opening && (
              <Modal
                title="Abrir comanda"
                subtitle="Selecione o cliente para agrupar produtos e serviços."
                busy={busy}
                onClose={() => setOpening(false)}
              >
                <form className="clinical-form" onSubmit={openTab}>
                  {error && <ErrorBanner error={error} />}
                  <label>
                    Cliente
                    <PatientPicker
                      patients={patients}
                      value={client}
                      onChange={setClient}
                      required
                    />
                  </label>
                  <label>
                    Observações
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>
                  <div className="modal-actions">
                    <button className="primary-button" disabled={busy}>
                      Abrir comanda
                    </button>
                  </div>
                </form>
              </Modal>
            )}
            {selected && data && (
              <PatientTabModal
                tab={
                  data.tabs.find((item) => item.id === selected.id) ?? selected
                }
                products={data.products}
                onClose={() => setSelected(null)}
                onChanged={load}
              />
            )}
          </div>
        )}
      </details>
    </section>
  );
}
