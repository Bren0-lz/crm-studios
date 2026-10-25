import {
  formatTaxId,
  isValidTaxId,
  pixMessageVariables,
  planPixChargeMessage,
  type ClinicSettings,
} from "@crm/contracts";
import {
  Building2,
  CheckCircle2,
  CircleDot,
  MapPin,
  Save,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { useSettingsBusy } from "../../shared/workflows/useSettingsBusy";
import { useUnsavedChangesPrompt } from "./useUnsavedChangesPrompt";

export function ClinicSettingsContent() {
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [taxIdChecked, setTaxIdChecked] = useState(false);
  const [savedSettings, setSavedSettings] = useState<ClinicSettings | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const pixMessageRef = useRef<HTMLTextAreaElement>(null);
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
    const taxId = settings.taxId?.trim() ?? "";
    if (taxId && !isValidTaxId(taxId)) {
      setTaxIdChecked(true);
      throw new Error("Informe um CPF ou CNPJ válido.");
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await api.updateClinicSettings(settings);
      setSettings(saved);
      setSavedSettings(saved);
      setNotice("Dados da clínica salvos.");
      window.dispatchEvent(new Event("crm:branding-updated"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const taxIdInvalid =
    taxIdChecked && !!settings?.taxId?.trim() && !isValidTaxId(settings.taxId);
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
          <fieldset
            disabled={saving}
            className="settings-clinic-section"
            aria-labelledby="clinic-identification-title"
          >
            <div className="settings-clinic-section-heading">
              <span className="settings-clinic-section-icon">
                <Building2 size={20} aria-hidden="true" />
              </span>
              <h3 id="clinic-identification-title">Identificação</h3>
              <p>Informações utilizadas nos documentos da clínica.</p>
            </div>
            <div className="settings-clinic-section-fields">
              <div className="settings-clinic-logo">
                <div className="settings-clinic-logo-preview">
                  {settings.logoDataUrl ? (
                    <img src={settings.logoDataUrl} alt="Logotipo da clínica" />
                  ) : (
                    <Building2 size={30} aria-hidden="true" />
                  )}
                </div>
                <div className="settings-clinic-logo-controls">
                  <label htmlFor="clinic-logo">Logotipo</label>
                  <input
                    id="clinic-logo"
                    type="file"
                    accept="image/png,image/jpeg"
                    aria-describedby="clinic-logo-help"
                    disabled={saving}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setError("");
                      try {
                        if (
                          file.size > 2 * 1024 * 1024 ||
                          !["image/png", "image/jpeg"].includes(file.type)
                        )
                          throw new Error("Use PNG ou JPEG de até 2 MB.");
                        const result = await new Promise<string>(
                          (resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () =>
                              resolve(String(reader.result));
                            reader.onerror = () =>
                              reject(
                                new Error("Não foi possível ler o logotipo."),
                              );
                            reader.readAsDataURL(file);
                          },
                        );
                        setSettings((current) =>
                          current
                            ? { ...current, logoDataUrl: result }
                            : current,
                        );
                      } catch (cause) {
                        setError((cause as Error).message);
                      }
                    }}
                  />
                  <p id="clinic-logo-help">PNG ou JPEG de até 2 MB.</p>
                  {settings.logoDataUrl && (
                    <button
                      type="button"
                      className="text-button settings-clinic-logo-remove"
                      onClick={() => {
                        setSettings({ ...settings, logoDataUrl: "" });
                        setNotice("");
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Remover logotipo
                    </button>
                  )}
                </div>
              </div>
              <div className="form-grid">
                <label className="span-2">
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
                      setSettings({
                        ...settings,
                        legalName: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  CNPJ/CPF
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    value={formatTaxId(settings.taxId ?? "")}
                    aria-invalid={taxIdInvalid || undefined}
                    aria-describedby={
                      taxIdInvalid ? "clinic-tax-id-error" : undefined
                    }
                    onBlur={() => setTaxIdChecked(true)}
                    onChange={(event) => {
                      setTaxIdChecked(false);
                      setSettings({
                        ...settings,
                        taxId: formatTaxId(event.target.value),
                      });
                    }}
                  />
                  {taxIdInvalid && (
                    <small
                      id="clinic-tax-id-error"
                      className="field-error"
                      aria-live="polite"
                    >
                      Informe um CPF ou CNPJ válido.
                    </small>
                  )}
                </label>
              </div>
            </div>
          </fieldset>
          <fieldset
            disabled={saving}
            className="settings-clinic-section"
            aria-labelledby="clinic-contact-title"
          >
            <div className="settings-clinic-section-heading">
              <span className="settings-clinic-section-icon">
                <MapPin size={20} aria-hidden="true" />
              </span>
              <h3 id="clinic-contact-title">Contato e localização</h3>
              <p>Canais de contato e endereço da sua clínica.</p>
            </div>
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
          <fieldset
            disabled={saving}
            className="settings-clinic-section"
            aria-labelledby="clinic-payments-title"
          >
            <div className="settings-clinic-section-heading">
              <span className="settings-clinic-section-icon">
                <Wallet size={20} aria-hidden="true" />
              </span>
              <h3 id="clinic-payments-title">Recebimentos</h3>
              <p>Chave e mensagem enviadas ao cliente nas cobranças por Pix.</p>
            </div>
            <div className="form-grid">
              <label className="span-2">
                Chave Pix
                <input
                  autoComplete="off"
                  maxLength={140}
                  placeholder="CNPJ, e-mail, telefone ou chave aleatória"
                  value={settings.pixKey ?? ""}
                  onChange={(event) =>
                    setSettings({ ...settings, pixKey: event.target.value })
                  }
                />
              </label>
              <div className="span-2 field-with-hint">
                <label htmlFor="clinic-pix-message">Mensagem do Pix</label>
                <div
                  className="template-toolbar"
                  role="toolbar"
                  aria-label="Inserir dados na mensagem do Pix"
                >
                  {pixMessageVariables.map((variable) => (
                    <button
                      key={variable.code}
                      type="button"
                      className="secondary-button"
                      title={`Insere ${variable.code}: vira "${variable.example}" na mensagem`}
                      onClick={() => {
                        const current = settings.pixMessageTemplate ?? "";
                        const field = pixMessageRef.current;
                        const start = field?.selectionStart ?? current.length;
                        const end = field?.selectionEnd ?? current.length;
                        setSettings({
                          ...settings,
                          pixMessageTemplate:
                            current.slice(0, start) +
                            variable.code +
                            current.slice(end),
                        });
                        setNotice("");
                      }}
                    >
                      Inserir {variable.label.toLowerCase()}
                    </button>
                  ))}
                </div>
                <textarea
                  id="clinic-pix-message"
                  ref={pixMessageRef}
                  rows={4}
                  maxLength={1000}
                  aria-describedby="clinic-pix-message-help"
                  placeholder="Em branco, usa a mensagem padrão com o valor, as sessões, o preço por sessão e a chave."
                  value={settings.pixMessageTemplate ?? ""}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      pixMessageTemplate: event.target.value,
                    })
                  }
                />
                <small id="clinic-pix-message-help" className="field-hint">
                  {`Prévia: ${planPixChargeMessage({
                    patientName: "Marina Costa",
                    planName: "Pilates 2x semana",
                    totalValueInCents: 48000,
                    installments: 3,
                    totalSessions: 8,
                    pixKey: settings.pixKey?.trim() || "sua chave Pix",
                    template: settings.pixMessageTemplate,
                  })}`}
                </small>
              </div>
            </div>
          </fieldset>
          {notice && (
            <div className="success-banner" role="status">
              {notice}
            </div>
          )}
          <div className="modal-actions settings-save-bar">
            <span className="settings-dirty" data-dirty={dirty} role="status">
              {dirty ? (
                <CircleDot size={16} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={16} aria-hidden="true" />
              )}
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
              <Save size={16} aria-hidden="true" />
              {saving ? "Salvando…" : "Salvar configurações"}
            </button>
          </div>
        </form>
      )}
      {prompt.modal}
    </>
  );
}
