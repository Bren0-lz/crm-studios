import {
  trashPurgeConfirmation,
  type TrashImpact,
  type TrashItem,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ActionModal } from "../../shared/components/ActionModal";
import { LoadingBlock } from "../../shared/components/LoadingBlock";

/**
 * Exclusão definitiva: lista, num aviso grande, tudo que será apagado junto e só libera o botão
 * depois de a pessoa digitar a palavra de confirmação.
 */
export function PurgeConfirmModal({
  item,
  onClose,
  onDone,
}: {
  item: TrashItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [impact, setImpact] = useState<TrashImpact | null>(null);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  useEffect(() => {
    let active = true;
    api
      .trashImpact(item.kind, item.id)
      .then((result) => active && setImpact(result))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [item.kind, item.id]);
  const confirmed = typed.trim().toUpperCase() === trashPurgeConfirmation;
  const missing = [
    ...(impact ? [] : ["carregar o que será apagado"]),
    ...(confirmed ? [] : [`digitar ${trashPurgeConfirmation}`]),
  ];
  return (
    <ActionModal
      eyebrow="Lixeira"
      title="Excluir em definitivo"
      subtitle={item.title}
      confirmLabel="Excluir em definitivo"
      danger
      missing={error ? ["carregar o que será apagado"] : missing}
      onConfirm={async () => {
        await api.purgeFromTrash(item.kind, item.id);
        onDone();
      }}
      onClose={onClose}
    >
      <div className="trash-purge-warning span-2" role="alert">
        <strong>Esta exclusão não pode ser desfeita.</strong>
        {error ? (
          <p>{error}</p>
        ) : !impact ? (
          <LoadingBlock />
        ) : impact.items.length ? (
          <>
            <p>
              Junto com &quot;{item.title}&quot;, serão apagados para sempre{" "}
              {impact.total.toLocaleString("pt-BR")}{" "}
              {impact.total === 1 ? "registro ligado" : "registros ligados"}:
            </p>
            <ul>
              {impact.items.map((entry) => (
                <li key={entry.key}>
                  <span>{entry.label}</span>
                  <strong>{entry.count.toLocaleString("pt-BR")}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Nenhum outro registro está ligado a este item.</p>
        )}
      </div>
      <label className="span-2">
        Para confirmar, digite {trashPurgeConfirmation}
        <input
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
