import type { OutboundMessage } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { Modal } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { useAuthorization } from "../../authorization-context";

export function ManualMessageActions({
  message,
  onChanged,
  allowed = true,
}: {
  message: OutboundMessage;
  allowed?: boolean;
  onChanged: () => Promise<void>;
}) {
  const { can } = useAuthorization();
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);
  const [confirm, setConfirm] = useState<"sent" | "cancelled" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function complete() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      await api.completeManualMessage(message.id, confirm);
      await onChanged();
      setConfirm(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (message.manualCompletion)
    return (
      <small>
        {message.manualCompletion.status === "sent"
          ? "Envio manual registrado"
          : "Cancelamento registrado"}{" "}
        por {message.manualCompletion.actorName} em{" "}
        {new Date(message.manualCompletion.occurredAt).toLocaleString("pt-BR")}
      </small>
    );
  if (message.status !== "queued" || !can("communications.messages"))
    return null;
  const link =
    message.channel === "whatsapp"
      ? `https://wa.me/${message.recipient.replace(/\D/g, "").length > 11 && message.recipient.replace(/\D/g, "").startsWith("55") ? "" : "55"}${message.recipient.replace(/\D/g, "")}?text=${encodeURIComponent(message.body)}`
      : `mailto:${encodeURIComponent(message.recipient)}?body=${encodeURIComponent(message.body)}`;
  return (
    <>
      <div className="page-actions">
        {allowed && (
          <a
            className={
              message.channel === "whatsapp"
                ? "whatsapp-button"
                : "secondary-button"
            }
            href={link}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir {message.channel === "whatsapp" ? "WhatsApp" : "e-mail"}
          </a>
        )}
        <button
          className="secondary-button"
          onClick={() => {
            void (
              navigator.clipboard
                ? navigator.clipboard.writeText(message.body)
                : Promise.reject(
                    new Error("A cópia não está disponível neste navegador."),
                  )
            ).catch((cause: Error) => setError(cause.message));
          }}
        >
          Copiar texto
        </button>
        <button
          className="primary-button"
          disabled={
            !allowed || new Date(message.scheduledFor).getTime() > currentTime
          }
          onClick={() => setConfirm("sent")}
        >
          Registrar envio manual
        </button>
        <button
          className="secondary-button"
          onClick={() => setConfirm("cancelled")}
        >
          Cancelar mensagem
        </button>
      </div>
      {!allowed && (
        <p className="muted-copy">
          O cliente não autoriza mensagens neste canal.
        </p>
      )}
      {error && <ErrorBanner error={error} />}
      {confirm && (
        <Modal
          title={
            confirm === "sent" ? "Registrar envio manual" : "Cancelar mensagem"
          }
          subtitle={
            confirm === "sent"
              ? "Confirme que você realizou o envio fora do CRM. Este registro não confirma a entrega ao destinatário."
              : "A mensagem será retirada da fila de trabalho."
          }
          busy={busy}
          onClose={() => setConfirm(null)}
        >
          {error && <ErrorBanner error={error} />}
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Voltar
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void complete()}
            >
              Confirmar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
