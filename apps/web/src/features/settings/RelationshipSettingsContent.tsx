import type { ContactReason, RelationshipSettings } from "@crm/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useSettingsBusy } from "../../shared/workflows/useSettingsBusy";
import { contactReasonLabels } from "../relationship/index";
import { relationshipDeadlineFields } from "./model";
import { useUnsavedChangesPrompt } from "./useUnsavedChangesPrompt";

export function RelationshipSettingsContent({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<RelationshipSettings | null>(null);
  const [savedSettings, setSavedSettings] =
    useState<RelationshipSettings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  useSettingsBusy(saving);
  const dirty =
    canEdit &&
    settings !== null &&
    savedSettings !== null &&
    JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const prompt = useUnsavedChangesPrompt({
    section: "Prazos e mensagens",
    dirty,
    busy: saving,
    save,
    discard: () => {
      setSettings(savedSettings);
      setError("");
      setNotice("");
    },
  });

  useEffect(() => {
    let active = true;
    api
      .relationshipSettings()
      .then((data) => {
        if (!active) return;
        setSettings(data);
        setSavedSettings(data);
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  async function save() {
    if (savingRef.current || !settings || !canEdit) return;
    if (!formRef.current?.reportValidity())
      throw new Error("Revise os prazos e as mensagens antes de salvar.");
    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await api.updateRelationshipSettings(settings);
      setSettings(saved);
      setSavedSettings(saved);
      setNotice("Prazos e mensagens salvos.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <>
      {error && (
        <>
          <ErrorBanner error={error} />
          {!settings && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
          )}
        </>
      )}
      {!canEdit && (
        <p className="muted-copy">
          Somente um admin pode alterar estes valores.
        </p>
      )}
      {!settings ? (
        !error && <LoadingBlock />
      ) : (
        <form
          ref={formRef}
          className="clinical-form"
          onChange={() => setNotice("")}
          onSubmit={(event) => void submit(event)}
        >
          <fieldset className="settings-fieldset" disabled={saving}>
            <legend>Regras de contato</legend>
            <p className="muted-copy">
              Defina os limites que geram sugestões de acompanhamento.
            </p>
            <div className="form-grid settings-deadlines">
              {relationshipDeadlineFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    type="number"
                    min={field.min}
                    step={1}
                    required
                    readOnly={!canEdit}
                    value={settings[field.key]}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        [field.key]: Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset
            className="settings-fieldset settings-messages"
            disabled={saving}
          >
            <legend>Modelos de mensagem</legend>
            <p className="muted-copy">
              Variáveis disponíveis nas mensagens: <code>{"{{nome}}"}</code> — é
              substituída pelo primeiro nome do cliente ao abrir o WhatsApp.
            </p>
            {(Object.keys(contactReasonLabels) as ContactReason[]).map(
              (reason) => (
                <label key={reason}>
                  Mensagem: {contactReasonLabels[reason]}
                  <textarea
                    rows={2}
                    required
                    maxLength={1000}
                    readOnly={!canEdit}
                    value={settings.messages[reason]}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        messages: {
                          ...settings.messages,
                          [reason]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ),
            )}
          </fieldset>
          {notice && (
            <div className="success-banner" role="status">
              {notice}
            </div>
          )}
          {canEdit && (
            <div className="modal-actions settings-save-bar">
              <span className="settings-dirty" role="status">
                {dirty ? "Alterações não salvas" : "Dados atualizados"}
              </span>
              <button
                className="secondary-button"
                type="button"
                disabled={!dirty || saving}
                onClick={() => {
                  setSettings(savedSettings);
                  setError("");
                  setNotice("");
                }}
              >
                Descartar alterações
              </button>
              <button className="primary-button" disabled={!dirty || saving}>
                {saving ? "Salvando…" : "Salvar prazos e mensagens"}
              </button>
            </div>
          )}
        </form>
      )}
      {prompt.modal}
    </>
  );
}
