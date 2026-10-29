import type { PatientDiscount } from "@crm/contracts";
import { currency } from "../../shared/lib/formatting";
import type { GuidedOrder } from "./order";
import { PlanDiscountSummary } from "./PlanDiscountSummary";

const money = (cents: number) => currency.format(cents / 100);

/**
 * Sacola do cadastro: tudo o que o cliente está levando, com o valor de cada item, os
 * descontos e o total a cobrar agora. O desconto geral é configurado aqui.
 */
export function GuidedOrderSummary({
  order,
  orderDiscount,
  disabled,
  onEditOrderDiscount,
}: {
  order: GuidedOrder;
  orderDiscount: PatientDiscount | undefined;
  disabled: boolean;
  onEditOrderDiscount: () => void;
}) {
  return (
    <fieldset className="form-fieldset span-2 order-summary">
      <legend>Sacola</legend>
      {order.lines.length === 0 ? (
        <p className="muted-copy">
          Escolha um plano, serviço ou produto para montar a sacola.
        </p>
      ) : (
        <>
          <ul className="order-lines" aria-label="Itens da sacola">
            {order.lines.map((line) => (
              <li key={line.key}>
                <div className="order-line">
                  <span>
                    <strong>{line.name}</strong>
                    <span className="muted-copy">{line.detail}</span>
                  </span>
                  <span className="numeric-value">
                    {money(line.grossInCents)}
                  </span>
                </div>
                {line.itemDiscountInCents > 0 && (
                  <div className="order-line order-discount">
                    <span>
                      {line.kind === "plan"
                        ? "Desconto do plano"
                        : "Desconto do produto"}
                    </span>
                    <span className="numeric-value">
                      − {money(line.itemDiscountInCents)}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <PlanDiscountSummary
            discount={orderDiscount}
            emptyLabel="Sem desconto geral."
            oneTime
            disabled={disabled}
            onEdit={onEditOrderDiscount}
          />
          <dl className="order-totals">
            <div>
              <dt>Subtotal</dt>
              <dd className="numeric-value">{money(order.subtotalInCents)}</dd>
            </div>
            {order.itemDiscountInCents > 0 && (
              <div className="order-discount">
                <dt>Descontos dos itens</dt>
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
            <div className="order-total">
              <dt>Total</dt>
              <dd className="numeric-value">{money(order.totalInCents)}</dd>
            </div>
          </dl>
          <p className="muted-copy">
            Valores das cobranças geradas agora. Renovações seguem o desconto de
            cada plano; o desconto geral vale só nesta compra.
          </p>
        </>
      )}
    </fieldset>
  );
}
