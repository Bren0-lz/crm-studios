import type { ClinicSettings } from "@crm/contracts";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { useSettingsBusy } from "../../shared/workflows/useSettingsBusy";
import { useUnsavedChangesPrompt } from "./useUnsavedChangesPrompt";

export function ClinicSettingsContent() {
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<ClinicSettings | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  const dirty =
    settings !== null &&
    savedSettings !== null &&
    JSON.stringify(settings) !== JSON.stringify(savedSettings);
  useSettingsBusy(saving);
  useEffect(() => {
    let active = true;
    api
      .clinicSettings()
      .then((data) => {
        if (active) {
          setSettings(data);
          setSavedSettings(data);
        }
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function save() {
    if (savingRef.current || !settings) return;
    if (!formRef.current?.reportValidity())
      throw new Error("Revise os campos obrigatórios antes de salvar.");
    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await api.updateClinicSettings(settings);
      setSettings(saved);
      setSavedSettings(saved);
      setNotice("Dados da clínica salvos.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const prompt = useUnsavedChangesPrompt({
    section: "Dados da clínica",
    dirty,
    busy: saving,
    save,
    discard: () => {
      setSettings(savedSettings);
      setError("");
      setNotice("");
    },
  });
  return (
    <>
      {error && <ErrorBanner error={error} />}
      {!settings ? (
        error ? (
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
        ) : (
          <LoadingBlock />
        )
      ) : (
        <form
          ref={formRef}
          className="clinical-form settings-clinic-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save().catch((cause: Error) => setError(cause.message));
          }}
          onChange={() => setNotice("")}
        >
          <fieldset disabled={saving} className="settings-fieldset">
            <legend>Identificação</legend>
            <p className="muted-copy">
              Informações utilizadas nos documentos da clínica.
            </p>
            <div className="form-grid">
              <label>
                Nome
                <input
                  required
                  value={settings.name}
                  onChange={(event) =>
                    setSettings({ ...settings, name: event.target.value })
                  }
                />
              </label>
              <label>
                Razão social
                <input
                  value={settings.legalName}
                  onChange={(event) =>
                    setSettings({ ...settings, legalName: event.target.value })
                  }
                />
              </label>
              <label>
                CNPJ/CPF
                <input
                  value={settings.taxId}
                  onChange={(event) =>
                    setSettings({ ...settings, taxId: event.target.value })
                  }
                />
              </label>
            </div>
          </fieldset>
          <fieldset disabled={saving} className="settings-fieldset">
            <legend>Contato e localização</legend>
            <div className="form-grid">
              <label>
                Telefone
                <PhoneInput
                  value={settings.phone ?? ""}
                  onChange={(phone) => setSettings({ ...settings, phone })}
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={settings.email}
                  onChange={(event) =>
                    setSettings({ ...settings, email: event.target.value })
                  }
                />
              </label>
              <label className="span-2">
                Endereço
                <textarea
                  rows={2}
                  value={settings.address}
                  onChange={(event) =>
                    setSettings({ ...settings, address: event.target.value })
                  }
                />
              </label>
            </div>
          </fieldset>
          {notice && (
            <div className="success-banner" role="status">
              {notice}
            </div>
          )}
          <div className="modal-actions settings-save-bar">
            <span className="settings-dirty" data-dirty={dirty} role="status">
              {dirty ? "Alterações não salvas" : "Dados atualizados"}
            </span>
            <button
              type="button"
              className="secondary-button"
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
              {saving ? "Salvando…" : "Salvar configurações"}
            </button>
          </div>
        </form>
      )}
      {prompt.modal}
    </>
  );
}
