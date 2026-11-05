import type { ReceiptSignatureShare } from "@crm/contracts";
import { MessageCircle } from "lucide-react";
import { useId, useState } from "react";
import { api } from "../../api";
import { receiptSignatureWhatsappLink } from "./model";

/**
 * "Enviar recibo pelo WhatsApp" (RC3): abre o wa.me do cliente com a mensagem "recebemos seu
 * pagamento" e o link de assinatura, e registra o clique como envio do recibo. Cliente sem
 * número: botão desativado com a dica.
 */
export function ReceiptSignatureWhatsapp({
  share,
}: {
  share: ReceiptSignatureShare;
}) {
  const hintId = useId();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(Boolean(share.sentAt));
  const href = receiptSignatureWhatsappLink(share);
  function registerSent() {
    setError("");
    void api
      .markReceiptSignatureSent(share.receivableId)
      .then(() => setSent(true))
      .catch((cause: Error) =>
        setError(`O envio do recibo não foi registrado: ${cause.message}`),
      );
  }
  return (
    <>
      {href ? (
        <a
          className="whatsapp-button"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={registerSent}
        >
          <MessageCircle size={16} aria-hidden="true" />
          Enviar recibo pelo WhatsApp
        </a>
      ) : (
        <button
          type="button"
          className="whatsapp-button"
          disabled
          aria-describedby={hintId}
        >
          <MessageCircle size={16} aria-hidden="true" />
          Enviar recibo pelo WhatsApp
        </button>
      )}
      {!href && (
        <small id={hintId} className="field-hint">
          O cliente não tem WhatsApp nem telefone no cadastro.
        </small>
      )}
      {sent && !error && (
        <small className="field-hint" role="status">
          Recibo enviado para assinatura.
        </small>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
