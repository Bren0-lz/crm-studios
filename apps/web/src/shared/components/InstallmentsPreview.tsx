import type { InstallmentPreview } from "@crm/contracts";
import type { ReactNode } from "react";
import { currency, formatIsoDate } from "../lib/formatting";

const money = (cents: number) => currency.format(cents / 100);
const signed = (cents: number) =>
  cents < 0 ? `− ${money(-cents)}` : money(cents);

/** "3 × R$ 90,00" quando iguais; senão "3 parcelas · R$ 270,00". */
function previewSummary(rows: readonly InstallmentPreview[], total: number) {
  if (rows.length === 1) return `1 cobrança de ${money(total)}`;
  const first = rows[0]!.amountInCents;
  return rows.every((row) => row.amountInCents === first)
    ? `${rows.length} × ${money(first)}`
    : `${rows.length} parcelas · ${money(total)}`;
}

/**
 * Prévia das parcelas que o cliente vai pagar, aberta sob demanda: valor e vencimento de
 * cada uma e de onde vem o valor (divisão, centavo do arredondamento, descontos).
 */
export function InstallmentsPreview({
  rows,
  label = "Ver parcelas",
  dueLabel,
  note,
  className,
}: {
  rows: readonly InstallmentPreview[];
  label?: string;
  /** Texto da parcela sem vencimento (ex.: "na fatura do cartão"). */
  dueLabel?: string | undefined;
  note?: ReactNode;
  className?: string | undefined;
}) {
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + row.amountInCents, 0);
  const discount = rows.reduce(
    (sum, row) =>
      sum +
      row.parts.reduce(
        (part, item) => part + Math.max(0, -item.amountInCents),
        0,
      ),
    0,
  );
  return (
    <details
      className={`installments-preview${className ? ` ${className}` : ""}`}
    >
      <summary>
        <span>{label}</span>
        <span className="muted-copy">{previewSummary(rows, total)}</span>
      </summary>
      <ol className="installments-preview-list" aria-label="Parcelas previstas">
        {rows.map((row) => (
          <li key={row.installmentNumber}>
            <div className="installments-preview-head">
              <span>
                <strong>
                  {row.installmentCount === 1
                    ? "Cobrança única"
                    : `Parcela ${row.installmentNumber}/${row.installmentCount}`}
                </strong>
                {(row.dueDate || dueLabel) && (
                  <span className="muted-copy">
                    {row.dueDate
                      ? `vence ${formatIsoDate(row.dueDate)}`
                      : dueLabel}
                  </span>
                )}
              </span>
              <strong className="numeric-value">
                {money(row.amountInCents)}
              </strong>
            </div>
            <dl className="installments-preview-parts">
              {row.parts.map((part, index) => (
                <div
                  key={`${part.label}-${index}`}
                  className={part.amountInCents < 0 ? "order-discount" : ""}
                >
                  <dt>{part.label}</dt>
                  <dd className="numeric-value">
                    {signed(part.amountInCents)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
      <dl className="installments-preview-totals">
        {discount > 0 && (
          <div className="order-discount">
            <dt>Descontos nas parcelas</dt>
            <dd className="numeric-value">− {money(discount)}</dd>
          </div>
        )}
        <div className="order-total">
          <dt>Total a pagar</dt>
          <dd className="numeric-value">{money(total)}</dd>
        </div>
      </dl>
      {note && <p className="muted-copy installments-preview-note">{note}</p>}
    </details>
  );
}
