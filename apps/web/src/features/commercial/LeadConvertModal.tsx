import {
  type Lead,
  formatPhone,
  leadMissingRegistrationFields,
  leadRegistrationRequestMessage,
  whatsappLink,
} from "@crm/contracts";
import { Copy, MessageCircle } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useToast } from "../../shared/feedback/toast-context";
import { copyText } from "../communications/index";

/**
 * Conversão do lead: antes do cadastro completo de cliente (LC1, `children`), se faltar algum
 * dado do cadastro, aparece a mensagem pronta para pedir tudo ao lead de uma vez (copiar ou
 * abrir no WhatsApp); "Preencher cadastro" segue para o cadastro (CV1).
 */
export function LeadConvertModal({
  children,
  ...props
}: LeadRegistrationRequestProps & { children: ReactNode }) {
  const [step, setStep] = useState<"request" | "form">(() =>
    leadMissingRegistrationFields(props.lead).length > 0 ? "request" : "form",
  );
  return step === "request" ? (
    <LeadRegistrationRequest {...props} onContinue={() => setStep("form")} />
  ) : (
    children
  );
}

interface LeadRegistrationRequestProps {
  lead: Lead;
  /** Módulo de origem (ex.: "Eventos"); o padrão é o CRM comercial. */
  eyebrow?: string;
  title?: string;
  onClose: () => void;
}

function LeadRegistrationRequest({
  lead,
  eyebrow = "CRM comercial",
  title = "Converter lead em cliente",
  onClose,
  onContinue,
}: LeadRegistrationRequestProps & { onContinue: () => void }) {
  const toast = useToast();
  const [message, setMessage] = useState(() =>
    leadRegistrationRequestMessage(lead),
  );
  const [error, setError] = useState("");
  const phone = lead.whatsapp?.trim() || lead.phone?.trim() || "";
  async function copy() {
    try {
      await copyText(message);
      setError("");
      toast.success("Mensagem copiada.");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <Modal
      eyebrow={eyebrow}
      title={title}
      subtitle={`${lead.fullName} · ${formatPhone(lead.phone)}`}
      initialFocus="textarea"
      onClose={onClose}
    >
      <div className="form-grid">
        <p className="span-2">
          Faltam dados para o cadastro. Envie o pedido ao lead e, com as
          respostas, preencha o cadastro.
        </p>
        <label className="span-2">
          Mensagem para o lead
          <textarea
            rows={10}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <ModalCancelButton>Voltar</ModalCancelButton>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void copy()}
          >
            <Copy size={16} aria-hidden="true" />
            Copiar mensagem
          </button>
          {phone && (
            <a
              className="whatsapp-button"
              href={whatsappLink(phone, message)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} aria-hidden="true" />
              Enviar pelo WhatsApp
            </a>
          )}
          <button className="primary-button" type="button" onClick={onContinue}>
            Preencher cadastro
          </button>
        </div>
      </div>
    </Modal>
  );
}
