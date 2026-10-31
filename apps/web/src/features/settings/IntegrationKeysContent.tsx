import {
  type IntegrationKey,
  type IntegrationKeyCreated,
  type IntegrationScope,
  integrationScopeLabels,
} from "@crm/contracts";
import { KeyRound, Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api";
import { ActionModal } from "../../shared/components/ActionModal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { shortDate } from "../../shared/lib/formatting";
import { useSettingsBusy } from "../../shared/workflows/useSettingsBusy";

const scopes = Object.keys(integrationScopeLabels) as IntegrationScope[];
const emptyForm = { name: "", scopes: ["sales:read"] as IntegrationScope[] };
const day = (iso: string) => shortDate.format(new Date(iso));

/** Chaves da API externa: cria (token exibido uma vez), lista e revoga. Só admin. */
export function IntegrationKeysContent() {
  const [keys, setKeys] = useState<IntegrationKey[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<IntegrationKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<IntegrationKey | null>(null);
  const [notice, setNotice] = useState("");
  const savingRef = useRef(false);
  useSettingsBusy(saving);

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    if (form.name.trim().length < 3) {
      setFormError("Informe um nome com pelo menos 3 caracteres.");
      return;
    }
    if (!form.scopes.length) {
      setFormError("Escolha pelo menos um escopo.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    setNotice("");
    try {
      const result = await api.createIntegrationKey({
        name: form.name.trim(),
        scopes: form.scopes,
      });
      setKeys((items) => [result.key, ...(items ?? [])]);
      setCreated(result);
      setCopied(false);
      setForm(emptyForm);
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setFormError(
        "Não foi possível copiar. Selecione o token e copie manualmente.",
      );
    }
  }

  async function revoke(key: IntegrationKey) {
    const revoked = await api.revokeIntegrationKey(key.id);
    setKeys((items) =>
      (items ?? []).map((item) => (item.id === key.id ? revoked : item)),
    );
    if (created?.key.id === key.id) setCreated(null);
    setRevoking(null);
    setNotice("Chave revogada.");
  }

  function toggleScope(scope: IntegrationScope, checked: boolean) {
    setForm((current) => ({
      ...current,
      scopes: checked
        ? [...current.scopes, scope]
        : current.scopes.filter((item) => item !== scope),
    }));
  }

  return (
    <>
      <p className="muted-copy">
        O outro sistema envia o token no cabeçalho{" "}
        <code>Authorization: Bearer &lt;token&gt;</code> para{" "}
        <code>/api/external/v1</code>. A chave age com as permissões de quem a
        criou e para de funcionar ao ser revogada.
      </p>
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      {error && (
        <>
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
        </>
      )}
      {!keys ? (
        !error && <LoadingBlock />
      ) : (
        <>
          <form
            className="form-grid holiday-form"
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            <fieldset className="settings-inline-fields" disabled={saving}>
              <legend>Nova chave</legend>
              <label className="span-2">
                Nome
                <input
                  required
                  minLength={3}
                  maxLength={80}
                  placeholder="Dashboard de vendas"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>
              {scopes.map((scope) => (
                <label className="checkbox-field" key={scope}>
                  <input
                    type="checkbox"
                    checked={form.scopes.includes(scope)}
                    onChange={(event) =>
                      toggleScope(scope, event.target.checked)
                    }
                  />
                  {integrationScopeLabels[scope]}
                </label>
              ))}
              {formError && (
                <div className="form-error span-2" role="alert">
                  {formError}
                </div>
              )}
              <div className="modal-actions span-2">
                <button className="primary-button" disabled={saving}>
                  <Plus size={17} aria-hidden="true" />
                  {saving ? "Criando…" : "Criar chave"}
                </button>
              </div>
            </fieldset>
          </form>
          {created && (
            <div className="clinical-form" role="status">
              <div className="success-banner">
                Chave “{created.key.name}” criada. Copie o token agora: ele não
                aparece de novo.
              </div>
              <label>
                Token
                <input
                  readOnly
                  value={created.token}
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCreated(null)}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void copy(created.token)}
                >
                  {copied ? "Copiado" : "Copiar token"}
                </button>
              </div>
            </div>
          )}
          {keys.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="Nenhuma chave criada"
              copy="Crie uma chave para conectar o dashboard de vendas."
            />
          ) : (
            <div className="holiday-list">
              {keys.map((key) => (
                <article key={key.id}>
                  <div>
                    <strong>
                      {key.name}{" "}
                      {key.revokedAt && (
                        <span className="status-pill cancelled">Revogada</span>
                      )}
                    </strong>
                    <small>
                      {key.prefix}… ·{" "}
                      {key.scopes
                        .map((scope) => integrationScopeLabels[scope])
                        .join(", ")}
                    </small>
                    <small>
                      Criada por {key.createdByName || "usuário removido"} em{" "}
                      {day(key.createdAt)} ·{" "}
                      {key.lastUsedAt
                        ? `último uso em ${day(key.lastUsedAt)}`
                        : "nunca usada"}
                      {key.revokedAt ? ` · revogada em ${day(key.revokedAt)}` : ""}
                    </small>
                  </div>
                  {!key.revokedAt && (
                    <button
                      type="button"
                      className="danger-button button-sm"
                      aria-label={`Revogar chave ${key.name}`}
                      onClick={() => setRevoking(key)}
                    >
                      Revogar
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {revoking && (
        <ActionModal
          eyebrow="Integrações"
          title="Revogar chave"
          subtitle={`${revoking.name} · ${revoking.prefix}…`}
          effect="O sistema que usa esta chave perde o acesso na hora. Não dá para desfazer: crie uma chave nova se precisar."
          confirmLabel="Revogar"
          danger
          onConfirm={() => revoke(revoking)}
          onClose={() => setRevoking(null)}
        />
      )}
    </>
  );
}
