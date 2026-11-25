import {
  type IntegrationKey,
  integrationScopeLabels,
  withPrefix,
} from "@crm/contracts";
import { KeyRound, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { ActionModal } from "../../shared/components/ActionModal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { shortDate } from "../../shared/lib/formatting";
import { IntegrationKeyCreateModal } from "./IntegrationKeyCreateModal";

const day = (iso: string) => shortDate.format(new Date(iso));

function IntegrationKeyList({
  keys,
  onRevoke,
}: {
  keys: IntegrationKey[];
  onRevoke?: (key: IntegrationKey) => void;
}) {
  return (
    <ul className="integration-key-list">
      {keys.map((key) => (
        <li key={key.id}>
          <div className="integration-key-info">
            <div className="integration-key-name">
              <strong>{key.name}</strong>
              <code>{key.prefix}…</code>
            </div>
            <span>
              {key.scopes
                .map((scope) => integrationScopeLabels[scope])
                .join(", ")}
            </span>
            <small>
              Criada por {key.createdByName || "usuário removido"} em{" "}
              {day(key.createdAt)} ·{" "}
              {key.lastUsedAt
                ? `último uso em ${day(key.lastUsedAt)}`
                : "nunca usada"}
              {key.revokedAt && ` · revogada em ${day(key.revokedAt)}`}
            </small>
          </div>
          {onRevoke && (
            <button
              type="button"
              className="danger-button button-sm"
              aria-label={`Revogar ${withPrefix("chave", key.name)}`}
              onClick={() => onRevoke(key)}
            >
              Revogar
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function IntegrationKeysContent() {
  const [keys, setKeys] = useState<IntegrationKey[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<IntegrationKey | null>(null);
  const [notice, setNotice] = useState("");
  const createButton = useRef<HTMLButtonElement>(null);
  const activeHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    api
      .integrationKeys()
      .then((data) => active && setKeys(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  const activeKeys = keys?.filter((key) => !key.revokedAt) ?? [];
  const revokedKeys = keys?.filter((key) => key.revokedAt) ?? [];

  function closeCreate() {
    setCreating(false);
    createButton.current?.focus();
  }

  async function revoke(key: IntegrationKey) {
    const revoked = await api.revokeIntegrationKey(key.id);
    setKeys(
      (items) =>
        items?.map((item) => (item.id === key.id ? revoked : item)) ?? null,
    );
    setRevoking(null);
    setNotice("Chave revogada.");
    activeHeading.current?.focus();
  }

  return (
    <section
      className="catalog-section"
      aria-labelledby="integration-keys-title"
    >
      <header className="catalog-section-head">
        <div>
          <h3 id="integration-keys-title">Chaves de API</h3>
          <p>Controle o acesso de sistemas externos aos dados da clínica.</p>
        </div>
        <button
          ref={createButton}
          type="button"
          className="primary-button"
          disabled={!keys}
          onClick={() => {
            setNotice("");
            setCreating(true);
          }}
        >
          <Plus size={17} aria-hidden="true" />
          Nova chave
        </button>
      </header>
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      {error ? (
        <div className="integration-key-error">
          <ErrorBanner error={error} />
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : !keys ? (
        <LoadingBlock />
      ) : (
        <>
          <section
            className="integration-key-active"
            aria-labelledby="integration-active-title"
          >
            <h4 id="integration-active-title" tabIndex={-1} ref={activeHeading}>
              Chaves ativas ({activeKeys.length})
            </h4>
            {activeKeys.length ? (
              <IntegrationKeyList
                keys={activeKeys}
                onRevoke={(key) => {
                  setNotice("");
                  setRevoking(key);
                }}
              />
            ) : (
              <EmptyState
                icon={KeyRound}
                title="Nenhuma chave ativa"
                copy="Crie uma chave para conectar um sistema à API do CRM."
              />
            )}
          </section>
          {revokedKeys.length > 0 && (
            <details className="integration-key-history">
              <summary>Chaves revogadas ({revokedKeys.length})</summary>
              <IntegrationKeyList keys={revokedKeys} />
            </details>
          )}
        </>
      )}
      {creating && (
        <IntegrationKeyCreateModal
          onCreated={(key) => setKeys((items) => [key, ...(items ?? [])])}
          onClose={closeCreate}
        />
      )}
      {revoking && (
        <ActionModal
          eyebrow="Chaves de API"
          title="Revogar chave"
          subtitle={`${revoking.name} · ${revoking.prefix}…`}
          effect="A chave perde o acesso à API imediatamente. Para restabelecer o acesso, crie outra chave."
          confirmLabel="Revogar"
          danger
          onConfirm={() => revoke(revoking)}
          onClose={() => setRevoking(null)}
        />
      )}
    </section>
  );
}
