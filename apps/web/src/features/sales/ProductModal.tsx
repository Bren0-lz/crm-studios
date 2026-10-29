import type {
  ClinicCatalogEntry,
  Product,
  ProductInput,
  ProductSize,
  ProductUpdateInput,
} from "@crm/contracts";
import {
  productSizeLabels,
  productSizeSchema,
  sortProductSizes,
} from "@crm/contracts";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../../api";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { useToast } from "../../shared/feedback/toast-context";

type ProductForm = ProductInput & { sizes: ProductSize[] };

const emptyProduct: ProductForm = {
  name: "",
  sku: "",
  unit: "un",
  costInCents: 0,
  salePriceInCents: null,
  initialStock: 0,
  restockAlertAt: null,
  sizes: [],
};

/**
 * Cadastro e edição do produto. Abre também por cima da venda (produto sem preço), sem
 * fechá-la: quem chama recebe o produto salvo em `onSaved`.
 */
export function ProductModal({
  product,
  focusPrice = false,
  onClose,
  onSaved,
}: {
  product: Product | "new";
  /** Abre com o foco no preço de venda (atalho do aviso de produto sem preço). */
  focusPrice?: boolean;
  onClose: () => void;
  onSaved?: ((product: Product) => void) | undefined;
}) {
  const toast = useToast();
  const isNew = product === "new";
  const salePriceHintId = useId();
  const [categories, setCategories] = useState<ClinicCatalogEntry[]>([]),
    [brands, setBrands] = useState<ClinicCatalogEntry[]>([]),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(""),
    [form, setForm] = useState<ProductForm>(() =>
      product === "new" ? emptyProduct : { ...product, initialStock: 0 },
    ),
    [active, setActive] = useState(product === "new" || product.active),
    [hasSizes, setHasSizes] = useState(
      product !== "new" && product.sizes.length > 0,
    ),
    [restockAlert, setRestockAlert] = useState(
      product !== "new" && product.restockAlertAt !== null,
    ),
    [initialSizeStock, setInitialSizeStock] = useState<
      Partial<Record<ProductSize, number>>
    >({});
  const productDirty = useFormDirty(
    { form, active, hasSizes, restockAlert, initialSizeStock },
    true,
  );
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
    const input: ProductInput = {
      ...form,
      sizes,
      restockAlertAt: restockAlert ? (form.restockAlertAt ?? 1) : null,
      ...(sizes.length
        ? {
            initialStock: 0,
            initialSizeStock: sizes
              .map((size) => ({ size, quantity: initialSizeStock[size] ?? 0 }))
              .filter((entry) => entry.quantity > 0),
          }
        : {}),
    };
    setBusy(true);
    setFormError("");
    try {
      const saved =
        product === "new"
          ? await api.createProduct(input)
          : await api.updateProduct(product.id, {
              ...input,
              active,
            } as ProductUpdateInput);
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
    <Modal
      title={isNew ? "Novo produto" : "Editar produto"}
      subtitle="Preços e classificação. O saldo muda pelos ajustes de estoque."
      {...(focusPrice ? { initialFocus: 'input[name="salePrice"]' } : {})}
      busy={busy}
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
              Pode ficar em branco até o preço ser calculado; sem ele o produto
              não pode ser vendido.
            </small>
          </div>
          {isNew && !hasSizes && (
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
              {!isNew && (
                <p className="field-hint">
                  O saldo de um tamanho desmarcado continua no estoque até ser
                  baixado por um ajuste.
                </p>
              )}
            </fieldset>
          )}
          {isNew && hasSizes && form.sizes.length > 0 && (
            <fieldset className="form-fieldset span-2">
              <legend>Estoque inicial por tamanho</legend>
              <div className="product-size-grid">
                {form.sizes.map((size) => (
                  <label key={size}>
                    {`Estoque inicial ${productSizeLabels[size]}`}
                    <input
                      type="number"
                      min={0}
                      value={initialSizeStock[size] ?? 0}
                      onChange={(event) =>
                        setInitialSizeStock({
                          ...initialSizeStock,
                          [size]: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="field-with-hint span-2">
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
            <p className="field-hint">
              Opcional. Quando o estoque chegar à quantidade escolhida, o
              produto aparece como “Repor estoque” na lista e entra em “Produtos
              para repor” nos Indicadores.
              {hasSizes && " Vale o total somando todos os tamanhos."}
            </p>
          </div>
          {restockAlert && (
            <label>
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
          {!isNew && (
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
  );
}
