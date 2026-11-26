import {
  type IntegrationKey,
  type IntegrationKeyCreated,
  type IntegrationScope,
  integrationScopeDescriptions,
  integrationScopeLabels,
  withQuotedPrefix,
} from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { ActionModal } from "../../shared/components/ActionModal";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";

const scopes = Object.keys(integrationScopeLabels) as IntegrationScope[];

export function IntegrationKeyCreateModal({
  onCreated,
  onClose,
}: {
  onCreated: (key: IntegrationKey) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<IntegrationScope[]>([
    "sales:read",
  ]);
  const [created, setCreated] = useState<IntegrationKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  async function create() {
    const result = await api.createIntegrationKey({
      name: name.trim(),
      scopes: selectedScopes,
    });
    onCreated(result.key);
    setCreated(result);
  }

  async function copy(token: string) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopyError("Selecione o token e copie manualmente.");
    }
  }

  if (created) {
    return (
      <Modal
        eyebrow="Chaves de API"
        title="Chave criada"
        subtitle={withQuotedPrefix("Chave", created.key.name)}
        initialFocus="input"
        onClose={onClose}
      >
        <div className="form-grid">
          <p className="span-2">
            Copie o token agora. Ele só aparece nesta tela.
          </p>
          <label className="span-2">
            Token
            <input
              readOnly
              value={created.token}
              onFocus={(event) => event.target.select()}
            />
          </label>
          {copyError && (
            <div className="form-error span-2" role="alert">
              {copyError}
            </div>
          )}
          <p className="muted-copy span-2">
            Para acessar <code>/api/external/v1</code>, envie o cabeçalho{" "}
            <code>Authorization: Bearer &lt;token&gt;</code>.
          </p>
          <div className="modal-actions span-2">
            <ModalCancelButton>Concluir</ModalCancelButton>
            <button
              type="button"
              className="primary-button"
              onClick={() => void copy(created.token)}
            >
              {copied ? "Copiado" : "Copiar token"}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <ActionModal
      eyebrow="Chaves de API"
      title="Nova chave"
      subtitle="Escolha o que o sistema poderá fazer com esta chave."
      confirmLabel="Criar chave"
      dirty={
        name !== "" ||
        selectedScopes.length !== 1 ||
        selectedScopes[0] !== "sales:read"
      }
      validate={() => {
        if (name.trim().length < 3)
          return "Informe um nome com pelo menos 3 caracteres.";
        if (!selectedScopes.length) return "Escolha pelo menos uma permissão.";
        return "";
      }}
      onConfirm={create}
      onClose={onClose}
    >
      <label className="span-2">
        Nome
        <input
          required
          minLength={3}
          maxLength={80}
          placeholder="Dashboard de vendas"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <fieldset className="settings-inline-fields span-2">
        <legend>Permissões</legend>
        {scopes.map((scope) => (
          <div className="field-with-hint" key={scope}>
            <label className="checkbox-field">
              <input
                type="checkbox"
                aria-describedby={`integration-scope-${scope}-hint`}
                checked={selectedScopes.includes(scope)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelectedScopes((current) =>
                    checked
                      ? [...current, scope]
                      : current.filter((item) => item !== scope),
                  );
                }}
              />
              {integrationScopeLabels[scope]}
            </label>
            <span
              className="field-hint"
              id={`integration-scope-${scope}-hint`}
            >
              {integrationScopeDescriptions[scope]}
            </span>
          </div>
        ))}
      </fieldset>
      <p className="muted-copy span-2">
        A chave também segue as permissões de quem a cria.
      </p>
    </ActionModal>
  );
}
