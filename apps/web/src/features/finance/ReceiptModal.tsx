import {
  formatTaxId,
  paymentMethodWithInstallments,
  paymentPartsLabel,
  whatsappLink,
  type PaymentReceipt,
} from "@crm/contracts";
import { MessageCircle } from "lucide-react";
import { Logo } from "../../shared/components/Logo";
import { Modal } from "../../shared/components/Modal";
import { currency } from "../../shared/lib/formatting";
import { receiptMessage } from "./model";

const money = (cents: number) => currency.format(cents / 100);

export function ReceiptModal({
  receipt,
  onClose,
}: {
  receipt: PaymentReceipt;
  onClose: () => void;
}) {
  // Picado: todas as formas com o valor de cada uma.
  const method = receipt.paymentParts
    ? paymentPartsLabel(receipt.paymentParts, money)
    : paymentMethodWithInstallments(
        receipt.paymentMethod,
        receipt.paymentInstallments,
      );
  const message = receiptMessage(receipt);
  const whatsapp = receipt.patientPhone
    ? whatsappLink(receipt.patientPhone, message)
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  return (
    <Modal
      title="Recibo de pagamento"
      subtitle={receipt.receiptNumber}
      onClose={onClose}
    >
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
        <div className="modal-actions print-hidden">
          <a
            className="whatsapp-button"
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={16} aria-hidden="true" />
            Enviar por WhatsApp
          </a>
          <button className="primary-button" onClick={() => window.print()}>
            Imprimir recibo
          </button>
        </div>
      </div>
    </Modal>
  );
}
