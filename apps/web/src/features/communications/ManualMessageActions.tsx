import type { OutboundMessage } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ActionMenu } from "../../shared/components/ActionMenu";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { Modal } from "../../shared/components/Modal";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { canMarkSent, messageLink } from "./model";

type Confirm = "sent" | "cancelled" | "returned";

/**
 * Ações da linha da fila: um botão principal abre o WhatsApp (ou e-mail) e, quando a pessoa
 * volta para a aba, pergunta se a mensagem foi enviada; o resto fica no menu "…".
 */
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
  const toast = useToast();
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);
  const [confirm, setConfirm] = useState<Confirm | null>(null),
    [awaitingReturn, setAwaitingReturn] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  useEffect(() => {
    if (!awaitingReturn) return;
    function onReturn() {
      if (document.visibilityState !== "visible") return;
      setAwaitingReturn(false);
      setConfirm("returned");
    }
    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, [awaitingReturn]);

  async function complete(status: "sent" | "cancelled") {
    setBusy(true);
    setError("");
    try {
      await api.completeManualMessage(message.id, status);
      toast.success(
        status === "sent"
          ? "Envio manual registrado."
          : "Cancelamento registrado.",
      );
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
  const sendable = canMarkSent(message, allowed, currentTime);
  const whatsapp = message.channel === "whatsapp";
  return (
    <>
      <div className="message-actions">
        {sendable && (
          <a
            className={whatsapp ? "whatsapp-button" : "primary-button"}
            href={messageLink(message)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setAwaitingReturn(true)}
          >
            {whatsapp ? "Enviar pelo WhatsApp" : "Enviar por e-mail"}
          </a>
        )}
        <ActionMenu
          label={`Mais ações da mensagem para ${message.patientName}`}
          iconOnly
          align="end"
          items={[
            {
              label: "Copiar texto",
              onSelect: () => {
                void (
                  navigator.clipboard
                    ? navigator.clipboard.writeText(message.body)
                    : Promise.reject(
                        new Error(
                          "A cópia não está disponível neste navegador.",
                        ),
                      )
                ).catch((cause: Error) => setError(cause.message));
              },
            },
            ...(sendable
              ? [
                  {
                    label: "Registrar envio manual",
                    onSelect: () => setConfirm("sent"),
                  },
                ]
              : []),
            {
              label: "Cancelar mensagem",
              danger: true,
              onSelect: () => setConfirm("cancelled"),
            },
          ]}
        />
      </div>
      {!allowed && (
        <p className="muted-copy">
          O cliente não autoriza mensagens neste canal.
        </p>
      )}
      {allowed && !sendable && (
        <p className="muted-copy">
          Programada para{" "}
          {new Date(message.scheduledFor).toLocaleString("pt-BR")}.
        </p>
      )}
      {error && !confirm && <ErrorBanner error={error} />}
      {confirm && (
        <Modal
          title={
            confirm === "returned"
              ? `Mensagem enviada para ${message.patientName}?`
              : confirm === "sent"
                ? "Registrar envio manual"
                : "Cancelar mensagem"
          }
          subtitle={
            confirm === "cancelled"
              ? "A mensagem será retirada da fila de trabalho."
              : "Confirme só se você realizou o envio. O registro não confirma a entrega ao destinatário."
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
              {confirm === "returned" ? "Não" : "Voltar"}
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void complete(confirm === "cancelled" ? "cancelled" : "sent")
              }
            >
              {confirm === "returned" ? "Sim, enviada" : "Confirmar"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
