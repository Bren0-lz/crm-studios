import type { PaymentReceipt } from "@crm/contracts";
import { Logo } from "../../shared/components/Logo";
import { Modal } from "../../shared/components/Modal";
import { currency } from "../../shared/lib/formatting";

export function ReceiptModal({
  receipt,
  onClose,
}: {
  receipt: PaymentReceipt;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Recibo de pagamento"
      subtitle={receipt.receiptNumber}
      onClose={onClose}
    >
      <div className="receipt-content">
        <Logo />
        <p>
          Recebemos de <strong>{receipt.patientName}</strong> o valor de{" "}
          <strong>{currency.format(receipt.amountInCents / 100)}</strong>,
          referente a {receipt.description}.
        </p>
        <dl>
          <div>
            <dt>Pagamento</dt>
            <dd>{receipt.paymentMethod}</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>{new Date(receipt.paidAt).toLocaleString("pt-BR")}</dd>
          </div>
        </dl>
        <div className="modal-actions">
          <button className="primary-button" onClick={() => window.print()}>
            Imprimir recibo
          </button>
        </div>
      </div>
    </Modal>
  );
}
