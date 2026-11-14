import {
  formatPhone,
  trashKindLabels,
  type TrashItem,
  type TrashKind,
} from "@crm/contracts";
import { RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useToast } from "../../shared/feedback/toast-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { PurgeConfirmModal } from "./PurgeConfirmModal";

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

/** Lixeira de um tópico: restaurar devolve o item como estava; excluir apaga de vez. */
export function TrashModal({
  kind,
  onClose,
  onChanged,
}: {
  kind: TrashKind;
  onClose: () => void;
  /** Item restaurado ou excluído: a tela de origem recarrega a lista. */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [purging, setPurging] = useState<TrashItem | null>(null);
  const load = useCallback(() => {
    api
      .trash(kind)
      .then((result) => {
        setItems(result);
        setError("");
      })
      .catch((cause: Error) => setError(cause.message));
  }, [kind]);
  useEffect(load, [load]);

  async function restore(item: TrashItem) {
    setBusyId(item.id);
    try {
      await api.restoreFromTrash(kind, item.id);
      toast.success(`"${item.title}" foi restaurado.`);
      load();
      onChanged?.();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <Modal
      eyebrow={trashKindLabels[kind]}
      title="Lixeira"
      subtitle="Itens excluídos ficam aqui até serem restaurados ou excluídos em definitivo."
      wide
      busy={Boolean(busyId)}
      onClose={onClose}
    >
      {error && <ErrorBanner error={error} />}
      {!items && !error ? (
        <LoadingBlock />
      ) : items && items.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="Lixeira vazia"
          copy="Nada foi excluído aqui."
        />
      ) : (
        <ul className="trash-list">
          {items?.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.title}</strong>
                {item.detail && (
                  <span>
                    {kind === "appointments"
                      ? dateTime(item.detail)
                      : kind === "patients" || kind === "leads"
                        ? formatPhone(item.detail)
                        : item.detail}
                  </span>
                )}
                <small>
                  Excluído em {dateTime(item.deletedAt)}
                  {item.deletedByName ? ` por ${item.deletedByName}` : ""}
                </small>
              </div>
              <div className="trash-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={Boolean(busyId)}
                  onClick={() => void restore(item)}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  {busyId === item.id ? "Restaurando…" : "Restaurar"}
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={Boolean(busyId)}
                  onClick={() => setPurging(item)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Excluir em definitivo
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {purging && (
        <PurgeConfirmModal
          item={purging}
          onClose={() => setPurging(null)}
          onDone={() => {
            toast.success(`"${purging.title}" foi excluído em definitivo.`);
            setPurging(null);
            load();
            onChanged?.();
          }}
        />
      )}
    </Modal>
  );
}
