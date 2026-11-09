import { withPrefix } from "@crm/contracts";
import type {
  ClinicCatalogEntry,
  Product,
  ProductInput,
  ProductSize,
  ProductUpdateInput,
} from "@crm/contracts";
import {
  maxProductSizes,
  productCategorySizes,
  productSizeLabel,
  serviceBusinessLineLabels,
  serviceBusinessLines,
  sortProductSizes,
} from "@crm/contracts";
import { Plus } from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { ProductSizesEditor } from "../../shared/components/ProductSizesEditor";
import {
  maxSizeLength,
  parseSizes,
  sizeKey,
} from "../../shared/lib/product-sizes";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { useToast } from "../../shared/feedback/toast-context";
import {
  NewCatalogEntryModal,
  type ProductCatalogKind,
} from "./NewCatalogEntryModal";

/** Opção do select de categoria/marca que abre o cadastro rápido. */
const NEW_CATALOG_ENTRY = "__new__";

type ProductForm = ProductInput & { sizes: ProductSize[] };

const emptyProduct: ProductForm = {
  name: "",
  unit: "un",
  costInCents: 0,
  salePriceInCents: null,
  initialStock: 0,
  restockAlertAt: null,
  businessLine: null,
  sizes: [],
};

/** Saldo atual de cada tamanho configurado, como o formulário edita. */
function currentSizeStock(product: Product) {
  const stock: Partial<Record<ProductSize, number>> = {};
  for (const entry of product.sizeStock)
    if (entry.size) stock[entry.size] = entry.currentStock;
  return stock;
}

/**
 * Cadastro e edição do produto. Abre também por cima da venda (produto sem preço) e do pedido
 * ao fornecedor, sem fechá-los: quem chama recebe o produto salvo em `onSaved`.
 */
export function ProductModal({
  product,
  focusPrice = false,
  fromSupplierOrder = false,
  onClose,
  onSaved,
}: {
  product: Product | "new";
  /** Abre com o foco no preço de venda (atalho do aviso de produto sem preço). */
  focusPrice?: boolean;
  /** Cadastro feito no pedido ao fornecedor: o estoque entra pelo pedido, sem estoque inicial. */
  fromSupplierOrder?: boolean;
  onClose: () => void;
  onSaved?: ((product: Product) => void) | undefined;
}) {
  const { user } = useAuthorization();
  // Cadastrar categoria e marca é exclusivo do administrador (como em Configurações › Cadastros).
  const canCreateCatalog = user?.role === "admin";
  const toast = useToast();
  const isNew = product === "new";
  const withInitialStock = isNew && !fromSupplierOrder;
  const salePriceHintId = useId();
  const [categories, setCategories] = useState<ClinicCatalogEntry[]>([]),
    [brands, setBrands] = useState<ClinicCatalogEntry[]>([]),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(""),
    [form, setForm] = useState<ProductForm>(() =>
      product === "new" ? emptyProduct : { ...product, initialStock: 0 },
    ),
    [active, setActive] = useState(product === "new" || product.active),
    [restockAlert, setRestockAlert] = useState(
      product !== "new" && product.restockAlertAt !== null,
    ),
    [sizeQuantities, setSizeQuantities] = useState<
      Partial<Record<ProductSize, number>>
    >(() => (product === "new" ? {} : currentSizeStock(product))),
    [catalogCreator, setCatalogCreator] = useState<ProductCatalogKind | null>(
      null,
    ),
    [ownSizesEnabled, setOwnSizesEnabled] = useState(false),
    [sizeDraft, setSizeDraft] = useState(""),
    // Tamanhos que só este produto tem, acrescentados à lista da categoria (ou aos antigos).
    [extraSizes, setExtraSizes] = useState<ProductSize[]>([]),
    [sizeMessage, setSizeMessage] = useState("");
  const sizeHintId = useId();
  const productDirty = useFormDirty(
    { form, active, restockAlert, sizeQuantities, ownSizesEnabled, sizeDraft },
    true,
  );
  // Os tamanhos vêm da categoria; um produto antigo mantém os seus para poder desmarcá-los, e
  // o produto pode acrescentar os que só ele tem.
  const categorySizes = productCategorySizes(categories, form.categoryId);
  const sizeOptions = sortProductSizes([
    ...categorySizes,
    ...(product === "new" ? [] : product.sizes),
    ...extraSizes,
  ]);
  // Só o produto sem categoria (e sem tamanhos antigos) define os seus: numa categoria sem
  // tamanhos os itens não se distinguem por tamanho, então a opção nem aparece.
  const ownSizes = sizeOptions.length === 0 && !form.categoryId;
  const hasSizes = ownSizes
    ? ownSizesEnabled && form.sizes.length > 0
    : sizeOptions.length > 0;
  const categoryName = categories.find(
    (item) => item.id === form.categoryId,
  )?.name;
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
        if (alive) setFormError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  function catalogCreated(entry: ClinicCatalogEntry) {
    if (catalogCreator === "product_category") {
      setCategories((items) => [...items, entry]);
      setForm((current) => ({
        ...current,
        categoryId: entry.id,
        sizes: entry.sizes,
      }));
    } else {
      setBrands((items) => [...items, entry]);
      setForm((current) => ({ ...current, brandId: entry.id }));
    }
    setCatalogCreator(null);
  }
  /** Trocar a categoria marca todos os tamanhos dela (o usuário desmarca os que faltam). */
  function changeCategory(categoryId: string | null) {
    const sizes = productCategorySizes(categories, categoryId);
    // Ao tirar a categoria, mantém os tamanhos que o usuário já definiu para o produto.
    setForm({
      ...form,
      categoryId,
      sizes: categoryId || !ownSizes ? sizes : form.sizes,
    });
  }
  function toggleSize(size: ProductSize, checked: boolean) {
    setForm({
      ...form,
      sizes: sizeOptions.filter((item) =>
        item === size ? checked : form.sizes.includes(item),
      ),
    });
  }
  /** Acrescenta ao produto os tamanhos digitados (já marcados); os repetidos só são marcados. */
  function addSizes() {
    const typed = parseSizes(sizeDraft);
    if (!typed.length) {
      setSizeMessage("Digite um tamanho para adicionar.");
      return;
    }
    if (typed.some((size) => size.length > maxSizeLength)) {
      setSizeMessage(`Cada tamanho pode ter até ${maxSizeLength} caracteres.`);
      return;
    }
    // Um tamanho já listado (inclusive código antigo, como "baby_look_m") é reaproveitado.
    const existing = (size: string) =>
      sizeOptions.find(
        (item) =>
          sizeKey(item) === sizeKey(size) ||
          sizeKey(productSizeLabel(item)) === sizeKey(size),
      );
    const chosen = typed.map((size) => existing(size) ?? size);
    const nextSizes = sortProductSizes([...form.sizes, ...chosen]);
    if (nextSizes.length > maxProductSizes) {
      setSizeMessage(`O produto pode ter até ${maxProductSizes} tamanhos.`);
      return;
    }
    const nextOptions = sortProductSizes([...sizeOptions, ...chosen]);
    setExtraSizes(sortProductSizes([...extraSizes, ...chosen]));
    setForm({
      ...form,
      sizes: nextOptions.filter((item) =>
        nextSizes.some((size) => sizeKey(size) === sizeKey(item)),
      ),
    });
    setSizeDraft("");
    setSizeMessage("");
  }
  function sizeDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adiciona o tamanho em vez de enviar o formulário.
    if (event.key !== "Enter") return;
    event.preventDefault();
    addSizes();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (categorySizes.length && !form.sizes.length) {
      setFormError("Marque ao menos um tamanho.");
      return;
    }
    if (!ownSizes && sizeDraft.trim()) {
      setFormError(
        "Clique em “Adicionar tamanho” para incluir o tamanho digitado ou apague o campo.",
      );
      return;
    }
    if (ownSizes && ownSizesEnabled && !form.sizes.length) {
      setFormError("Adicione ao menos um tamanho ou desmarque a opção.");
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
      let saved: Product;
      if (product === "new")
        saved = await api.createProduct({
          ...fields,
          ...(fromSupplierOrder ? { initialStock: 0 } : {}),
          ...(sizes.length
            ? {
                initialStock: 0,
                initialSizeStock: fromSupplierOrder
                  ? []
                  : quantities.filter((entry) => entry.quantity > 0),
              }
            : {}),
        });
      else {
        // Só os tamanhos cujo saldo mudou: o resto do estoque segue o que estiver gravado.
        const current = currentSizeStock(product);
        saved = await api.updateProduct(product.id, {
          ...fields,
          active,
          sizeQuantities: quantities.filter(
            (entry) => entry.quantity !== (current[entry.size] ?? 0),
          ),
        } as ProductUpdateInput);
      }
      toast.success(isNew ? "Produto cadastrado." : "Produto atualizado.");
      onSaved?.(saved);
      onClose();
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title={isNew ? "Novo produto" : "Editar produto"}
        subtitle={
          fromSupplierOrder
            ? "Dados do produto. A quantidade comprada entra no estoque pelo pedido."
            : "Preços e classificação. O saldo muda pelos ajustes de estoque."
        }
        {...(focusPrice ? { initialFocus: 'input[name="salePrice"]' } : {})}
        busy={busy}
        inactive={Boolean(catalogCreator)}
        dirty={productDirty}
        onClose={onClose}
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
            <div className="field-with-hint">
              <label>
                Preço de venda (R$)
                <MoneyInput
                  name="salePrice"
                  aria-describedby={salePriceHintId}
                  valueInCents={form.salePriceInCents}
                  onChange={(cents) =>
                    setForm({ ...form, salePriceInCents: cents })
                  }
                />
              </label>
              <small className="field-hint" id={salePriceHintId}>
                Pode ficar em branco até o preço ser calculado; sem ele o
                produto não pode ser vendido.
              </small>
            </div>
            {withInitialStock && !hasSizes && (
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
                    : changeCategory(event.target.value || null)
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
            <label>
              Linha no painel
              <select
                value={form.businessLine ?? ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    businessLine: (event.target.value ||
                      null) as ProductForm["businessLine"],
                  })
                }
              >
                <option value="">Sem classificação</option>
                {serviceBusinessLines.map((line) => (
                  <option key={line} value={line}>
                    {serviceBusinessLineLabels[line]}
                  </option>
                ))}
              </select>
            </label>
            <p className="field-hint span-2">
              Só vale para o painel de vendas, que separa as vendas do produto
              por linha (sem classificação aparece como Outros). Não muda nada
              no CRM.
            </p>
            {ownSizes && (
              <div className="span-2 size-editor">
                <ProductSizesEditor
                  scope="product"
                  enabled={ownSizesEnabled}
                  sizes={form.sizes}
                  draft={sizeDraft}
                  onEnabledChange={setOwnSizesEnabled}
                  onSizesChange={(sizes) => setForm({ ...form, sizes })}
                  onDraftChange={setSizeDraft}
                />
              </div>
            )}
            {sizeOptions.length > 0 && (
              <fieldset className="form-fieldset span-2">
                <legend>Tamanhos deste produto</legend>
                <p className="field-hint">
                  {categorySizes.length
                    ? `Tamanhos definidos na ${withPrefix("categoria", categoryName ?? "")}. Desmarque os que este produto não tem.`
                    : "Tamanhos de antes da categoria ter os seus. Desmarque todos para deixar o produto sem tamanhos."}
                </p>
                <div className="product-size-grid">
                  {sizeOptions.map((size) => (
                    <label key={size} className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={form.sizes.includes(size)}
                        onChange={(event) =>
                          toggleSize(size, event.target.checked)
                        }
                      />
                      {productSizeLabel(size)}
                    </label>
                  ))}
                </div>
                <div className="size-editor-add">
                  <label>
                    Novo tamanho
                    <input
                      value={sizeDraft}
                      maxLength={200}
                      placeholder="Ex.: GG, 42"
                      aria-describedby={sizeHintId}
                      onChange={(event) => {
                        setSizeDraft(event.target.value);
                        setSizeMessage("");
                      }}
                      onKeyDown={sizeDraftKeyDown}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={addSizes}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Adicionar tamanho
                  </button>
                </div>
                <p className="field-hint" id={sizeHintId}>
                  Falta algum? Adicione aqui os tamanhos que só este produto
                  tem. Separe por vírgula para incluir vários de uma vez.
                </p>
                {sizeMessage && (
                  <p className="field-error" role="alert">
                    {sizeMessage}
                  </p>
                )}
                {!isNew && (
                  <p className="field-hint">
                    O saldo de um tamanho desmarcado continua no estoque até ser
                    baixado por um ajuste.
                  </p>
                )}
              </fieldset>
            )}
            {hasSizes && form.sizes.length > 0 && !fromSupplierOrder && (
              <fieldset className="form-fieldset span-2">
                <legend>
                  {isNew
                    ? "Estoque inicial por tamanho"
                    : "Quantidade por tamanho"}
                </legend>
                <div className="product-size-grid">
                  {form.sizes.map((size) => (
                    <label key={size}>
                      {`${isNew ? "Estoque inicial" : "Quantidade"} ${productSizeLabel(size)}`}
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
                {!isNew && (
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
                {hasSizes &&
                  " Vale para cada tamanho: basta um deles chegar à quantidade."}
              </p>
            </fieldset>
            {!isNew && (
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
      {catalogCreator && (
        <NewCatalogEntryModal
          kind={catalogCreator}
          onClose={() => setCatalogCreator(null)}
          onCreated={catalogCreated}
        />
      )}
    </>
  );
}
