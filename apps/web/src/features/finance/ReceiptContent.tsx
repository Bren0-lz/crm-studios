import {
  formatTaxId,
  paymentMethodWithInstallments,
  paymentPartsLabel,
  type PaymentReceipt,
} from "@crm/contracts";
import type { ReactNode } from "react";
import { Logo } from "../../shared/components/Logo";
import { currency } from "../../shared/lib/formatting";

const money = (cents: number) => currency.format(cents / 100);

/**
 * Conteúdo do recibo (clínica, valor, forma, data), em modo leitura. Usado no modal da
 * equipe e no link público em que o cliente assina; `children` vem por último (ações).
 */
export function ReceiptContent({
  receipt,
  children,
}: {
  receipt: Omit<PaymentReceipt, "patientPhone">;
  children?: ReactNode;
}) {
  // Picado: todas as formas com o valor de cada uma.
  const method = receipt.paymentParts
    ? paymentPartsLabel(receipt.paymentParts, money)
    : paymentMethodWithInstallments(
        receipt.paymentMethod,
        receipt.paymentInstallments,
      );
  return (
    <div className="receipt-content">
      <Logo />
      <div className="receipt-clinic">
        <strong>{receipt.clinicLegalName || receipt.clinicName}</strong>
        {receipt.clinicTaxId && (
          <span>CNPJ/CPF {formatTaxId(receipt.clinicTaxId)}</span>
        )}
        {receipt.clinicAddress && <span>{receipt.clinicAddress}</span>}
      </div>
      <p>
        Recebemos de <strong>{receipt.patientName}</strong> o valor de{" "}
        <strong>{money(receipt.amountInCents)}</strong>, referente a{" "}
        {receipt.description}.
      </p>
      <dl>
        <div>
          <dt>Pagamento</dt>
          <dd>{method}</dd>
        </div>
        {receipt.installmentCount && receipt.installmentCount > 1 ? (
          <div>
            <dt>Parcela</dt>
            <dd>
              {receipt.installmentNumber} de {receipt.installmentCount}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Data</dt>
          <dd>{new Date(receipt.paidAt).toLocaleString("pt-BR")}</dd>
        </div>
        {receipt.customerDiscountInCents ? (
          <div>
            <dt>Desconto do cliente</dt>
            <dd>
              {money(receipt.customerDiscountInCents)} (valor cheio{" "}
              {money(
                receipt.amountInCents +
                  receipt.customerDiscountInCents +
                  (receipt.discountInCents ?? 0) -
                  (receipt.interestInCents ?? 0),
              )}
              )
            </dd>
          </div>
        ) : null}
        {receipt.discountInCents ? (
          <div>
            <dt>Desconto</dt>
            <dd>{money(receipt.discountInCents)}</dd>
          </div>
        ) : null}
        {receipt.interestInCents ? (
          <div>
            <dt>Juros</dt>
            <dd>{money(receipt.interestInCents)}</dd>
          </div>
        ) : null}
      </dl>
      {children}
    </div>
  );
}
