import {
  whatsappLink,
  type PaymentReceipt,
  type ReceiptSignatureShare,
  type ReceiptSignatureSummary,
} from "@crm/contracts";
import { MessageCircle, Printer } from "lucide-react";
import { Modal } from "../../shared/components/Modal";
import {
  receiptMessage,
  receiptMomentLabel,
  receiptSignatureLabels,
  receiptSignatureSteps,
} from "./model";
import { ReceiptContent } from "./ReceiptContent";
import { ReceiptSignatureWhatsapp } from "./ReceiptSignatureWhatsapp";

export function ReceiptModal({
  receipt,
  share,
  tracking,
  onSent,
  onClose,
}: {
  receipt: PaymentReceipt;
  /** Recibo para assinatura da baixa: o WhatsApp leva o link em vez do texto do recibo. */
  share?: ReceiptSignatureShare | null;
  /** Recibo para assinatura em vigor: situação e datas de envio, visualização e assinatura. */
  tracking?: ReceiptSignatureSummary | undefined;
  /** Envio do recibo registrado: a página recarrega para o `tracking` refletir o envio. */
  onSent?: () => void;
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
        {tracking && (
          <section
            className="receipt-tracking print-hidden"
            aria-label="Assinatura do recibo"
          >
            <div className="receipt-tracking-head">
              <h3>Assinatura do recibo</h3>
              <span
                className={`status-pill ${tracking.status === "signed" ? "paid" : "open"}`}
              >
                {receiptSignatureLabels[tracking.status]}
              </span>
            </div>
            <dl>
              {receiptSignatureSteps(tracking).map((step) => (
                <div key={step.key} className={step.at ? undefined : "pending"}>
                  <dt>{step.label}</dt>
                  <dd>{step.at ? receiptMomentLabel(step.at) : "Ainda não"}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <div className="modal-actions receipt-actions print-hidden">
          <button
            type="button"
            className="secondary-button"
            onClick={() => window.print()}
          >
            <Printer size={16} aria-hidden="true" />
            Imprimir recibo
          </button>
          {share ? (
            <ReceiptSignatureWhatsapp share={share} onSent={onSent} />
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
        </div>
      </ReceiptContent>
    </Modal>
  );
}
