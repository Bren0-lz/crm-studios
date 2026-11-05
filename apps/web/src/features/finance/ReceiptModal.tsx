import {
  whatsappLink,
  type PaymentReceipt,
  type ReceiptSignatureShare,
} from "@crm/contracts";
import { MessageCircle } from "lucide-react";
import { Modal } from "../../shared/components/Modal";
import { receiptMessage } from "./model";
import { ReceiptContent } from "./ReceiptContent";
import { ReceiptSignatureWhatsapp } from "./ReceiptSignatureWhatsapp";

export function ReceiptModal({
  receipt,
  share,
  onClose,
}: {
  receipt: PaymentReceipt;
  /** Recibo para assinatura da baixa: o WhatsApp leva o link em vez do texto do recibo. */
  share?: ReceiptSignatureShare | null;
  onClose: () => void;
}) {
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
      <ReceiptContent receipt={receipt}>
        <div className="modal-actions print-hidden">
          {share ? (
            <ReceiptSignatureWhatsapp share={share} />
          ) : (
            <a
              className="whatsapp-button"
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} aria-hidden="true" />
              Enviar por WhatsApp
            </a>
          )}
          <button className="primary-button" onClick={() => window.print()}>
            Imprimir recibo
          </button>
        </div>
      </ReceiptContent>
    </Modal>
  );
}
