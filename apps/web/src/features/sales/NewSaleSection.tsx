import type {
  InventoryWorkspace,
  PatientOption,
  PaymentMethod,
  Product,
  ProductSaleInput,
  ProductSize,
} from "@crm/contracts";
import {
  patientFirstName,
  paymentMethodLabels,
  paymentMethodSchema,
  productSizeLabel,
} from "@crm/contracts";
import { CircleAlert, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { EmptyState } from "../../shared/components/EmptyState";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { PaymentInstallmentsSelect } from "../../shared/components/PaymentInstallmentsSelect";
import { usePaymentMethodSettings } from "../../shared/hooks/usePaymentMethodSettings";
import { useToast } from "../../shared/feedback/toast-context";
import { currency, localIsoDate } from "../../shared/lib/formatting";
import { sellableStock, stockChoices } from "./model";
import { ProductModal } from "./ProductModal";

type SaleLine = {
  key: number;
  productId: string;
  /** Tamanho escolhido ("" = ainda não escolhido ou produto sem tamanhos). */
  size: ProductSize | "";
  quantity: number;
  unitPriceInCents: number;
};

let nextLineKey = 1;
const emptyLine = (): SaleLine => ({
  key: nextLineKey++,
  productId: "",
  size: "",
  quantity: 1,
  unitPriceInCents: 0,
});

/** Sub-aba "Nova venda": cliente, produtos e pagamento, registrados de uma vez. */
export function NewSaleSection({
  workspace,
}: {
  workspace: InventoryWorkspace;
}) {
  const toast = useToast();
  const { can } = useAuthorization();
  const canPrice = can("patients.products_update");
  /** Produto sem preço aberto pelo aviso; o modal fica por cima da venda, sem desfazê-la. */
  const [pricing, setPricing] = useState<Product | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [lines, setLines] = useState<SaleLine[]>(() => [emptyLine()]);
  const [settlement, setSettlement] =
    useState<ProductSaleInput["settlement"]>("paid");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [paymentInstallments, setPaymentInstallments] = useState(1);
  const paymentSettings = usePaymentMethodSettings();
  const [dueDate, setDueDate] = useState(() => localIsoDate());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const missingId = useId();
  useEffect(() => {
    let alive = true;
    api
      .patientOptions()
      .then((items) => {
        if (alive) setPatients(items);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const products = workspace.products.filter((item) => item.active);
  const productOf = (id: string) => products.find((item) => item.id === id);
  /** Saldo vendável da linha: do tamanho escolhido ou, sem tamanhos, do produto. */
  const lineStock = (line: SaleLine) => {
    const product = productOf(line.productId);
    return product ? sellableStock(product, line.size || undefined) : 0;
  };
  const totalSellable = (product: Product) =>
    stockChoices(product)
      .filter((choice) => choice.configured)
      .reduce((sum, choice) => sum + choice.currentStock, 0);
  const sellableKeys = products.reduce(
    (sum, item) => sum + Math.max(1, item.sizes.length),
    0,
  );
  const filled = lines.filter((line) => line.productId);
  const missingSize = filled.some(
    (line) => productOf(line.productId)?.sizes.length && !line.size,
  );
  const totalInCents = filled.reduce(
    (sum, line) => sum + line.quantity * line.unitPriceInCents,
    0,
  );
  // Venda bloqueada enquanto algum produto escolhido não tem preço de venda definido.
  const unpriced = products.filter(
    (product) =>
      product.salePriceInCents === null &&
      filled.some((line) => line.productId === product.id),
  );
  const missing = [
    ...(!patientId ? ["cliente"] : []),
    ...(unpriced.length ? ["preço de venda do produto"] : []),
    ...(!filled.length ? ["ao menos um produto"] : []),
    ...(missingSize ? ["tamanho"] : []),
    ...(!missingSize && filled.some((line) => line.quantity > lineStock(line))
      ? ["quantidade dentro do estoque"]
      : []),
    ...(filled.length && totalInCents <= 0 ? ["valor maior que zero"] : []),
  ];
  function update(key: number, patch: Partial<SaleLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }
  function reset() {
    setPatientId("");
    setLines([emptyLine()]);
    setSettlement("paid");
    setPaymentMethod("pix");
    setPaymentInstallments(1);
    setDueDate(localIsoDate());
    setNotes("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (missing.length) return;
    setBusy(true);
    setError("");
    try {
      const sale = await api.createProductSale({
        patientId,
        notes,
        items: filled.map((line) => ({
          productId: line.productId,
          ...(line.size ? { size: line.size } : {}),
          quantity: line.quantity,
          unitPriceInCents: line.unitPriceInCents,
        })),
        settlement,
        ...(settlement === "paid"
          ? {
              paymentMethod,
              ...(paymentInstallments > 1 ? { paymentInstallments } : {}),
            }
          : {}),
        dueDate,
      });
      toast.success(
        `Venda de ${currency.format(sale.totalInCents / 100)} registrada para ${patientFirstName(sale.patientName)}.`,
      );
      reset();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!products.length)
    return (
      <section className="panel" aria-label="Nova venda">
        <EmptyState
          title="Nenhum produto ativo"
          copy="Cadastre produtos na aba Estoque do Financeiro para registrar vendas."
        />
      </section>
    );
  return (
    <section className="panel" aria-label="Nova venda">
      <div className="panel-head">
        <h2>Nova venda</h2>
      </div>
      <form className="clinical-form sale-form" onSubmit={submit}>
        {error && <p className="form-error">{error}</p>}
        <fieldset className="sale-fieldset" disabled={busy}>
          <PatientPicker
            patients={patients}
            value={patientId}
            onChange={setPatientId}
            required
          />
          <div className="sale-lines" role="group" aria-label="Produtos">
            {lines.map((line, index) => {
              const product = productOf(line.productId);
              const position = index + 1;
              const available = lineStock(line);
              const sized = Boolean(product?.sizes.length);
              return (
                <div
                  className={`sale-line${sized ? " has-size" : ""}`}
                  key={line.key}
                >
                  <label>
                    Produto
                    <select
                      aria-label={`Produto ${position}`}
                      value={line.productId}
                      onChange={(event) => {
                        const chosen = productOf(event.target.value);
                        update(line.key, {
                          productId: event.target.value,
                          size: "",
                          unitPriceInCents: chosen?.salePriceInCents ?? 0,
                        });
                      }}
                    >
                      <option value="">Selecione</option>
                      {products.map((item) => (
                        <option
                          key={item.id}
                          value={item.id}
                          disabled={
                            item.id !== line.productId &&
                            (totalSellable(item) <= 0 ||
                              (!item.sizes.length &&
                                lines.some(
                                  (other) => other.productId === item.id,
                                )))
                          }
                        >
                          {item.name} ·{" "}
                          {totalSellable(item) > 0
                            ? `${totalSellable(item)} ${item.unit}`
                            : "sem estoque"}
                          {item.salePriceInCents === null && " · sem preço"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {product && sized && (
                    <label>
                      Tamanho
                      <select
                        aria-label={`Tamanho ${position}`}
                        value={line.size}
                        onChange={(event) =>
                          update(line.key, {
                            size: event.target.value as ProductSize | "",
                          })
                        }
                      >
                        <option value="">Selecione</option>
                        {product.sizes.map((size) => {
                          const stock = sellableStock(product, size);
                          return (
                            <option
                              key={size}
                              value={size}
                              disabled={
                                size !== line.size &&
                                (stock <= 0 ||
                                  lines.some(
                                    (other) =>
                                      other.productId === product.id &&
                                      other.size === size,
                                  ))
                              }
                            >
                              {`${productSizeLabel(size)} · ${stock > 0 ? `${stock} ${product.unit}` : "sem estoque"}`}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  )}
                  <label>
                    Quantidade
                    <input
                      aria-label={`Quantidade ${position}`}
                      type="number"
                      min={1}
                      max={available}
                      value={line.quantity}
                      onChange={(event) =>
                        update(line.key, {
                          quantity: Math.max(1, Number(event.target.value)),
                        })
                      }
                    />
                  </label>
                  <label>
                    Preço unitário (R$)
                    <MoneyInput
                      aria-label={`Preço unitário ${position}`}
                      valueInCents={line.unitPriceInCents}
                      onChange={(cents) =>
                        update(line.key, { unitPriceInCents: cents ?? 0 })
                      }
                    />
                  </label>
                  <p className="sale-line-total numeric-value">
                    {currency.format(
                      (line.quantity * line.unitPriceInCents) / 100,
                    )}
                    {product &&
                      (!sized || line.size) &&
                      line.quantity > available && (
                        <span className="field-hint">
                          Estoque disponível: {available} {product.unit}
                        </span>
                      )}
                  </p>
                  <button
                    type="button"
                    className="secondary-button"
                    aria-label={`Remover produto ${position}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((other) => other.key !== line.key),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
            {unpriced.map((product) => (
              <div className="sale-price-alert" role="alert" key={product.id}>
                <CircleAlert size={18} aria-hidden="true" />
                <p>
                  <strong>{product.name}</strong> está sem preço de venda e não
                  pode ser vendido.{" "}
                  {canPrice
                    ? "Cadastre o preço para continuar; o que já foi preenchido na venda fica como está."
                    : "Peça a quem pode editar produtos para cadastrar o preço."}
                </p>
                {canPrice && (
                  <button
                    type="button"
                    className="secondary-button button-sm"
                    onClick={() => setPricing(product)}
                  >
                    Cadastrar preço
                  </button>
                )}
              </div>
            ))}
            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={lines.length >= sellableKeys}
                onClick={() => setLines((current) => [...current, emptyLine()])}
              >
                <Plus size={16} /> Adicionar produto
              </button>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Pagamento
              <select
                value={settlement}
                onChange={(event) =>
                  setSettlement(
                    event.target.value as ProductSaleInput["settlement"],
                  )
                }
              >
                <option value="paid">Pago agora</option>
                <option value="receivable">A receber</option>
              </select>
            </label>
            {settlement === "paid" ? (
              <>
                <label>
                  Forma de pagamento
                  <select
                    value={paymentMethod}
                    onChange={(event) =>
                      setPaymentMethod(event.target.value as PaymentMethod)
                    }
                  >
                    {paymentMethodSchema.options.map((value) => (
                      <option key={value} value={value}>
                        {paymentMethodLabels[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <PaymentInstallmentsSelect
                  method={paymentMethod}
                  settings={paymentSettings}
                  value={paymentInstallments}
                  onChange={setPaymentInstallments}
                />
              </>
            ) : (
              <label>
                Vencimento
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>
            )}
            <label className="span-2">
              Observações
              <textarea
                maxLength={500}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <div className="modal-actions sale-actions">
          <p className="sale-total">
            Total <strong>{currency.format(totalInCents / 100)}</strong>
          </p>
          {missing.length > 0 && (
            <p className="field-hint" id={missingId}>
              Falta: {missing.join(", ")}.
            </p>
          )}
          <button
            className="primary-button"
            disabled={busy || missing.length > 0}
            aria-describedby={missing.length ? missingId : undefined}
          >
            {busy ? "Registrando…" : "Registrar venda"}
          </button>
        </div>
      </form>
      {pricing && (
        <ProductModal
          product={pricing}
          focusPrice
          onClose={() => setPricing(null)}
          onSaved={(saved) =>
            setLines((current) =>
              current.map((line) =>
                line.productId === saved.id
                  ? { ...line, unitPriceInCents: saved.salePriceInCents ?? 0 }
                  : line,
              ),
            )
          }
        />
      )}
    </section>
  );
}
