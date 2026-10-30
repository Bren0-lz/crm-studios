import {
  paymentMethodLabels,
  paymentMethodSchema,
  productSizeLabels,
  type PaymentMethod,
  type Product,
  type ProductSaleInput,
  type ProductSize,
} from "@crm/contracts";
import { Trash2 } from "lucide-react";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { PaymentInstallmentsSelect } from "../../shared/components/PaymentInstallmentsSelect";
import { usePaymentMethodSettings } from "../../shared/hooks/usePaymentMethodSettings";
import { sellableStock, stockChoices } from "../sales/index";
import type { GuidedProductLine } from "./order";
import { PlanDiscountSummary } from "./PlanDiscountSummary";

/** Saldo vendável de todos os tamanhos configurados do produto. */
function productTotalStock(product: Product) {
  return stockChoices(product)
    .filter((choice) => choice.configured)
    .reduce((sum, choice) => sum + choice.currentStock, 0);
}

/** Um produto da sacola do cadastro: produto, tamanho, quantidade, preço e desconto. */
export function GuidedProductFields({
  line,
  lines,
  products,
  disabled,
  onChange,
  onRemove,
  onEditDiscount,
}: {
  line: GuidedProductLine;
  lines: readonly GuidedProductLine[];
  products: readonly Product[];
  disabled: boolean;
  onChange: (patch: Partial<GuidedProductLine>) => void;
  onRemove: () => void;
  onEditDiscount: () => void;
}) {
  const product = products.find((item) => item.id === line.productId);
  const sized = Boolean(product?.sizes.length);
  const available = product
    ? sellableStock(product, line.size || undefined)
    : 0;
  return (
    <div className="form-grid">
      <label className={sized ? undefined : "span-2"}>
        Produto
        <select
          value={line.productId}
          onChange={(event) => {
            const chosen = products.find(
              (item) => item.id === event.target.value,
            );
            onChange({
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
                (productTotalStock(item) <= 0 ||
                  (!item.sizes.length &&
                    lines.some((other) => other.productId === item.id)))
              }
            >
              {`${item.name} · ${productTotalStock(item) > 0 ? `${productTotalStock(item)} ${item.unit}` : "sem estoque"}`}
            </option>
          ))}
        </select>
      </label>
      {product && sized && (
        <label>
          Tamanho
          <select
            value={line.size}
            onChange={(event) =>
              onChange({ size: event.target.value as ProductSize | "" })
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
                          other.productId === product.id && other.size === size,
                      ))
                  }
                >
                  {`${productSizeLabels[size]} · ${stock > 0 ? `${stock} ${product.unit}` : "sem estoque"}`}
                </option>
              );
            })}
          </select>
        </label>
      )}
      <label>
        Quantidade
        <input
          type="number"
          min={1}
          max={available || undefined}
          value={line.quantity}
          onChange={(event) =>
            onChange({ quantity: Math.max(1, Number(event.target.value)) })
          }
        />
        {product && (!sized || line.size) && line.quantity > available && (
          <span className="field-hint">
            Estoque disponível: {available} {product.unit}
          </span>
        )}
      </label>
      <label>
        Preço unitário (R$)
        <MoneyInput
          valueInCents={line.unitPriceInCents}
          onChange={(cents) => onChange({ unitPriceInCents: cents ?? 0 })}
        />
      </label>
      {product && (
        <div className="span-2">
          <PlanDiscountSummary
            discount={line.discount}
            emptyLabel="Sem desconto neste produto."
            oneTime
            disabled={disabled}
            onEdit={onEditDiscount}
          />
        </div>
      )}
      <div className="guided-plan-actions span-2">
        <button type="button" className="secondary-button" onClick={onRemove}>
          <Trash2 size={16} aria-hidden="true" />
          Remover produto
        </button>
      </div>
    </div>
  );
}

export type GuidedProductPayment = Pick<
  ProductSaleInput,
  "settlement" | "dueDate"
> & { paymentMethod: PaymentMethod; paymentInstallments: number };

/** Pagamento dos produtos da sacola (os planos têm a forma de pagamento de cada um). */
export function GuidedProductPaymentFields({
  value,
  onChange,
}: {
  value: GuidedProductPayment;
  onChange: (patch: Partial<GuidedProductPayment>) => void;
}) {
  const paymentSettings = usePaymentMethodSettings();
  return (
    <div className="form-grid">
      <label>
        Pagamento
        <select
          value={value.settlement}
          onChange={(event) =>
            onChange({
              settlement: event.target
                .value as GuidedProductPayment["settlement"],
            })
          }
        >
          <option value="paid">Pago agora</option>
          <option value="receivable">A receber</option>
        </select>
      </label>
      {value.settlement === "paid" ? (
        <>
          <label>
            Forma de pagamento
            <select
              value={value.paymentMethod}
              onChange={(event) =>
                onChange({
                  paymentMethod: event.target.value as PaymentMethod,
                  paymentInstallments: 1,
                })
              }
            >
              {paymentMethodSchema.options.map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabels[method]}
                </option>
              ))}
            </select>
          </label>
          <PaymentInstallmentsSelect
            method={value.paymentMethod}
            settings={paymentSettings}
            value={value.paymentInstallments}
            onChange={(paymentInstallments) =>
              onChange({ paymentInstallments })
            }
          />
        </>
      ) : (
        <label>
          Vencimento
          <input
            type="date"
            required
            value={value.dueDate}
            onChange={(event) => onChange({ dueDate: event.target.value })}
          />
        </label>
      )}
    </div>
  );
}
