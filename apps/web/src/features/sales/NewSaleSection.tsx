import type {
  InventoryWorkspace,
  PatientDiscount,
  PatientOption,
  Product,
  ProductSaleInput,
  ProductSize,
} from "@crm/contracts";
import { patientFirstName, productSizeLabel } from "@crm/contracts";
import { CircleAlert, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { EmptyState } from "../../shared/components/EmptyState";
import { InstallmentsPreview } from "../../shared/components/InstallmentsPreview";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { PaymentPartsField } from "../../shared/components/PaymentPartsField";
import {
  type PaymentPartDraft,
  effectiveDrafts,
  paymentDraftsIssue,
  toPaymentParts,
} from "../../shared/lib/payment-parts";
import { usePaymentMethodSettings } from "../../shared/hooks/usePaymentMethodSettings";
import { useToast } from "../../shared/feedback/toast-context";
import { currency, localIsoDate } from "../../shared/lib/formatting";
import {
  guidedOrder,
  patientDiscountLabel,
  PatientDiscountModal,
} from "../patients/index";
import { productSaleInstallments } from "../../shared/lib/product-installments";
import { sellableStock, stockChoices } from "./model";
import { ProductModal } from "./ProductModal";

type SaleLine = {
  key: number;
  productId: string;
  /** Tamanho escolhido ("" = ainda não escolhido ou produto sem tamanhos). */
  size: ProductSize | "";
  quantity: number;
  unitPriceInCents: number;
  /** Desconto só deste produto, nesta venda. */
  discount?: PatientDiscount | undefined;
};

const money = (cents: number) => currency.format(cents / 100);
/** Rótulo do desconto sem o alcance nas cobranças: na venda ele vale uma vez só. */
const discountLabel = (discount: PatientDiscount) =>
  patientDiscountLabel(discount).split(" · ")[0];

let nextLineKey = 1;
const emptyLine = (): SaleLine => ({
  key: nextLineKey++,
  productId: "",
  size: "",
  quantity: 1,
  unitPriceInCents: 0,
});

/** Sub-aba "Nova venda": cliente, produtos e pagamento, registrados de uma vez. */
const defaultParts = (): PaymentPartDraft[] => [
  { paymentMethod: "pix", amountInCents: null, installments: 1 },
];

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
  // Formas de pagamento: uma (o total) ou várias, picando o valor da venda.
  const [parts, setParts] = useState<PaymentPartDraft[]>(defaultParts);
  const paymentSettings = usePaymentMethodSettings();
  const [dueDate, setDueDate] = useState(() => localIsoDate());
  const [notes, setNotes] = useState("");
  /** Desconto sobre a venda toda, rateado entre os produtos pelo valor de cada um. */
  const [saleDiscount, setSaleDiscount] = useState<PatientDiscount>();
  /** Modal de desconto aberto: de um produto (chave da linha) ou da venda toda. */
  const [editingDiscount, setEditingDiscount] = useState<
    { lineKey: number } | "sale" | null
  >(null);
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
  // Mesmo cálculo da sacola do cadastro: o desconto vira preço unitário arredondado para
  // cima, então o total exibido é exatamente o que será cobrado.
  const order = guidedOrder(
    [],
    filled.map((line) => ({
      key: String(line.key),
      name: productOf(line.productId)?.name ?? "",
      detail: "",
      quantity: line.quantity,
      unitPriceInCents: line.unitPriceInCents,
      discount: line.discount,
    })),
    saleDiscount,
  );
  const orderLine = (line: SaleLine) =>
    order.lines.find((item) => item.key === String(line.key));
  const totalInCents = order.totalInCents;
  const discountInCents =
    order.itemDiscountInCents + order.orderDiscountInCents;
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
    ...(totalInCents > 0 && paymentDraftsIssue(parts, totalInCents)
      ? ["formas de pagamento somando o total"]
      : []),
  ];
  const effectiveParts = effectiveDrafts(parts, totalInCents);
  const installments = productSaleInstallments({
    items: filled.map((line) => {
      const product = productOf(line.productId);
      return {
        label: `${product?.name ?? "Produto"}${line.size ? ` · ${productSizeLabel(line.size)}` : ""} · ${line.quantity} ${product?.unit ?? "un."}`,
        grossInCents: line.quantity * line.unitPriceInCents,
      };
    }),
    // Descontos do produto e geral: as parcelas somam o total cobrado.
    discountInCents,
    settlement,
    // Prévia por parcela só com uma forma; no picado, cada forma aparece no campo acima.
    paymentMethod: effectiveParts[0]?.paymentMethod ?? "pix",
    paymentInstallments: effectiveParts[0]?.installments ?? 1,
    dueDate,
  });
  function update(key: number, patch: Partial<SaleLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }
  function reset() {
    setPatientId("");
    setLines([emptyLine()]);
    setSettlement("paid");
    setParts(defaultParts());
    setDueDate(localIsoDate());
    setNotes("");
    setSaleDiscount(undefined);
  }
  /** Observação gravada na venda: o desconto dado vem antes do texto digitado. */
  function saleNotes() {
    if (!discountInCents) return notes;
    const note = `Venda com ${money(discountInCents)} de desconto.`;
    return (notes.trim() ? `${note} ${notes.trim()}` : note).slice(0, 500);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (missing.length) return;
    setBusy(true);
    setError("");
    try {
      const sale = await api.createProductSale({
        patientId,
        notes: saleNotes(),
        items: filled.map((line) => ({
          productId: line.productId,
          ...(line.size ? { size: line.size } : {}),
          quantity: line.quantity,
          unitPriceInCents:
            orderLine(line)?.unitNetInCents ?? line.unitPriceInCents,
        })),
        settlement,
        // Pago agora: as formas recebidas; a receber: as previstas (sugeridas na baixa).
        ...(effectiveParts.length > 1
          ? { payments: toPaymentParts(effectiveParts) }
          : {
              paymentMethod: effectiveParts[0]!.paymentMethod,
              ...(effectiveParts[0]!.installments > 1
                ? { paymentInstallments: effectiveParts[0]!.installments }
                : {}),
            }),
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
              const lineDiscount = orderLine(line)?.itemDiscountInCents ?? 0;
              return (
                <div className="sale-item" key={line.key}>
                  <div className={`sale-line${sized ? " has-size" : ""}`}>
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
                            discount: undefined,
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
                  {product && (
                    <div className="discount-summary sale-line-discount">
                      <p className="muted-copy">
                        {line.discount
                          ? `${discountLabel(line.discount)} · − ${money(lineDiscount)}`
                          : "Sem desconto neste produto."}
                      </p>
                      <button
                        type="button"
                        className="secondary-button button-sm"
                        aria-label={`${line.discount ? "Alterar" : "Configurar"} desconto do produto ${position}`}
                        onClick={() =>
                          setEditingDiscount({ lineKey: line.key })
                        }
                      >
                        {line.discount
                          ? "Alterar desconto"
                          : "Configurar desconto"}
                      </button>
                    </div>
                  )}
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
            {settlement === "receivable" && (
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
            <PaymentPartsField
              className="span-2"
              parts={parts}
              onChange={setParts}
              totalInCents={totalInCents}
              settings={paymentSettings}
              disabled={busy}
              legend={
                settlement === "paid"
                  ? "Formas de pagamento"
                  : "Formas de pagamento previstas"
              }
              hint={
                settlement === "paid"
                  ? "Pagou em mais de uma forma? Adicione as outras e informe o valor de cada uma."
                  : "Ficam sugeridas na baixa da conta a receber."
              }
            />
            {totalInCents > 0 && effectiveParts.length <= 1 && (
              <InstallmentsPreview
                className="span-2"
                rows={installments.rows}
                dueLabel={installments.dueLabel}
              />
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
          <div
            className="sale-discount"
            role="group"
            aria-label="Desconto geral"
          >
            <div className="discount-summary">
              <p className="muted-copy">
                {saleDiscount
                  ? `Desconto geral: ${discountLabel(saleDiscount)}`
                  : "Sem desconto geral."}
              </p>
              <button
                type="button"
                className="secondary-button"
                aria-label={`${saleDiscount ? "Alterar" : "Configurar"} desconto geral`}
                disabled={!filled.length}
                onClick={() => setEditingDiscount("sale")}
              >
                {saleDiscount ? "Alterar desconto" : "Configurar desconto"}
              </button>
            </div>
            {discountInCents > 0 && (
              <dl className="order-totals" aria-label="Resumo dos descontos">
                <div>
                  <dt>Subtotal</dt>
                  <dd className="numeric-value">
                    {money(order.subtotalInCents)}
                  </dd>
                </div>
                {order.itemDiscountInCents > 0 && (
                  <div className="order-discount">
                    <dt>Descontos dos produtos</dt>
                    <dd className="numeric-value">
                      − {money(order.itemDiscountInCents)}
                    </dd>
                  </div>
                )}
                {order.orderDiscountInCents > 0 && (
                  <div className="order-discount">
                    <dt>Desconto geral</dt>
                    <dd className="numeric-value">
                      − {money(order.orderDiscountInCents)}
                    </dd>
                  </div>
                )}
              </dl>
            )}
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
      {editingDiscount && (
        <PatientDiscountModal
          eyebrow="Vendas"
          target={editingDiscount === "sale" ? "sale" : "product"}
          discount={
            editingDiscount === "sale"
              ? saleDiscount
              : lines.find((line) => line.key === editingDiscount.lineKey)
                  ?.discount
          }
          onClose={() => setEditingDiscount(null)}
          onApply={(discount) => {
            if (editingDiscount === "sale")
              setSaleDiscount(discount ?? undefined);
            else
              update(editingDiscount.lineKey, {
                discount: discount ?? undefined,
              });
            setEditingDiscount(null);
          }}
        />
      )}
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
