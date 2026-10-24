import type {
  CommunicationChannel,
  CommunicationKind,
  OutboundMessage,
} from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ManualMessageActions } from "./ManualMessageActions";
import {
  broadcastChannelLabels,
  canMarkSent,
  matchesQueueFilter,
  queueKindLabels,
  queueStatusLabels,
  type QueueFilter,
} from "./model";
import { NpsResponseAction } from "./NpsResponseAction";

type BulkAction = "sent" | "cancelled";

export function MessageQueue({
  messages: allMessages,
  allowed,
  onChanged,
  onNotice,
}: {
  messages: OutboundMessage[];
  allowed: (patientId: string, channel: CommunicationChannel) => boolean;
  onChanged: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const { can } = useAuthorization();
  const [filter, setFilter] = useState<QueueFilter>({ kind: "", status: "" });
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const canAct = can("communications.messages");
  const messages = allMessages.filter((message) =>
    matchesQueueFilter(message, filter),
  );
  const selectable = messages.filter((message) => message.status === "queued");
  const chosen = selectable.filter((message) => selected.includes(message.id));
  const sendable = chosen.filter((message) =>
    canMarkSent(message, allowed(message.patientId, message.channel)),
  );
  const targets = bulk === "sent" ? sendable : chosen;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function runBulk() {
    if (!bulk) return;
    let done = 0;
    const failures: string[] = [];
    for (const message of targets) {
      try {
        await api.completeManualMessage(message.id, bulk);
        done += 1;
      } catch (cause) {
        failures.push(`${message.patientName}: ${(cause as Error).message}`);
      }
    }
    await onChanged();
    setSelected([]);
    setBulk(null);
    onNotice(
      `${done} mensagem(ns) ${bulk === "sent" ? "marcada(s) como enviada(s)" : "descartada(s)"}.` +
        (failures.length
          ? ` Não foi possível concluir: ${failures.join("; ")}.`
          : ""),
    );
  }

  return (
    <>
      <div className="list-toolbar message-queue-toolbar">
        <label>
          Tipo de mensagem
          <select
            value={filter.kind}
            onChange={(event) =>
              setFilter({
                ...filter,
                kind: event.target.value as CommunicationKind | "",
              })
            }
          >
            <option value="">Todos os tipos</option>
            {Object.entries(queueKindLabels).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Situação da mensagem
          <select
            value={filter.status}
            onChange={(event) =>
              setFilter({
                ...filter,
                status: event.target.value as OutboundMessage["status"] | "",
              })
            }
          >
            <option value="">Todas as situações</option>
            {Object.entries(queueStatusLabels).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {canAct && selectable.length > 0 && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={chosen.length === selectable.length}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? selectable.map((message) => message.id)
                    : [],
                )
              }
            />
            Selecionar todas na fila
          </label>
        )}
      </div>
      {canAct && chosen.length > 0 && (
        <div
          className="message-bulk-bar"
          role="region"
          aria-label="Ações em lote"
        >
          <strong>{chosen.length} selecionada(s)</strong>
          <button
            type="button"
            className="primary-button button-sm"
            disabled={sendable.length === 0}
            onClick={() => setBulk("sent")}
          >
            Marcar como enviadas ({sendable.length})
          </button>
          <button
            type="button"
            className="danger-button button-sm"
            onClick={() => setBulk("cancelled")}
          >
            Descartar ({chosen.length})
          </button>
          <button
            type="button"
            className="text-button button-sm"
            onClick={() => setSelected([])}
          >
            Limpar seleção
          </button>
        </div>
      )}
      {messages.length === 0 ? (
        <EmptyState
          title={
            allMessages.length
              ? "Nenhuma mensagem com esses filtros"
              : "Fila vazia"
          }
          copy={
            allMessages.length
              ? "Mude o tipo ou a situação para ver outras mensagens."
              : "Gere lembretes ou adicione uma mensagem individual."
          }
        />
      ) : (
        <div className="message-list">
          {messages.map((message) => (
            <article key={message.id} className="message-row">
              <div className="message-row-head">
                {canAct && message.status === "queued" && (
                  <input
                    type="checkbox"
                    aria-label={`Selecionar mensagem para ${message.patientName}`}
                    checked={selected.includes(message.id)}
                    onChange={() => toggle(message.id)}
                  />
                )}
                <div className="message-row-title">
                  <strong>{message.patientName}</strong>
                  <span>
                    {queueKindLabels[message.kind]} ·{" "}
                    {message.channel === "whatsapp"
                      ? "WhatsApp"
                      : broadcastChannelLabels[message.channel]}
                  </span>
                </div>
                <span className={`status-pill ${message.status}`}>
                  {queueStatusLabels[message.status]}
                </span>
              </div>
              <p className="message-body">{message.body}</p>
              <div className="message-row-foot">
                <NpsResponseAction message={message} onChanged={onChanged} />
                <ManualMessageActions
                  message={message}
                  allowed={allowed(message.patientId, message.channel)}
                  onChanged={onChanged}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      {bulk && (
        <ActionModal
          eyebrow="Fila de mensagens"
          title={
            bulk === "sent" ? "Marcar como enviadas" : "Descartar mensagens"
          }
          subtitle={`${targets.length} mensagem(ns) selecionada(s)`}
          effect={
            bulk === "sent"
              ? `Registra o envio manual de ${targets.length} mensagem(ns). Use só se você já enviou cada uma.${
                  chosen.length > sendable.length
                    ? ` ${chosen.length - sendable.length} ficam de fora (programadas para depois ou sem autorização do cliente).`
                    : ""
                }`
              : `Retira ${targets.length} mensagem(ns) da fila de trabalho.`
          }
          danger={bulk === "cancelled"}
          confirmLabel={bulk === "sent" ? "Marcar como enviadas" : "Descartar"}
          onConfirm={runBulk}
          onClose={() => setBulk(null)}
        />
      )}
    </>
  );
}
