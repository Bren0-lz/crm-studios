import {
  formatPhone,
  type Receivable,
  type ReceivableContact,
  receivableContactMessage,
  whatsappLink,
} from "@crm/contracts";
import { MessageCircle, PhoneCall } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";

/** Falar com o cliente sobre uma parcela em aberto: avisar o atraso e saber se houve algo. */
export function ReceivableContactModal({
  receivable,
  overdue,
  onClose,
}: {
  receivable: Receivable;
  overdue: boolean;
  onClose: () => void;
}) {
  const [contact, setContact] = useState<ReceivableContact | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(() =>
    receivableContactMessage({ ...receivable, overdue }),
  );
  useEffect(() => {
    let active = true;
    api
      .receivableContact(receivable.id)
      .then((data) => active && setContact(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [receivable.id]);
  const whatsapp = contact?.whatsapp || contact?.phone;
  return (
    <Modal
      eyebrow="Financeiro"
      title="Entrar em contato"
      subtitle={`${receivable.patientName} · ${receivable.description}`}
      onClose={onClose}
    >
      {error ? (
        <ErrorBanner error={error} />
      ) : !contact ? (
        <LoadingBlock />
      ) : (
        <div className="form-grid">
          <div className="plan-meta">
            <span>Telefone</span>
            <strong>{formatPhone(contact.phone)}</strong>
          </div>
          {contact.whatsapp && contact.whatsapp !== contact.phone && (
            <div className="plan-meta">
              <span>WhatsApp</span>
              <strong>{formatPhone(contact.whatsapp)}</strong>
            </div>
          )}
          <label className="span-2">
            Mensagem
            <textarea
              rows={5}
              maxLength={1000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
        </div>
      )}
      <div className="modal-actions">
        <ModalCancelButton>Voltar</ModalCancelButton>
        {contact && (
          <a className="secondary-button" href={`tel:${contact.phone}`}>
            <PhoneCall size={16} aria-hidden="true" />
            Ligar
          </a>
        )}
        {whatsapp && (
          <a
            className="whatsapp-button"
            href={whatsappLink(whatsapp, message)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={16} aria-hidden="true" />
            Enviar pelo WhatsApp
          </a>
        )}
      </div>
    </Modal>
  );
}
