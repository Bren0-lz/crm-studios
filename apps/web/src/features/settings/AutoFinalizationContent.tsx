import {
  autoFinalizationDelayLabel,
  autoFinalizationMaxDelayMinutes,
  type AutoFinalizationSettingsInput,
} from "@crm/contracts";
import { CheckCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useSettingsBusy } from "../../shared/workflows/useSettingsBusy";
import {
  autoFinalizationDraft,
  autoFinalizationExample,
  autoFinalizationUnits,
  draftDelayMinutes,
} from "./model";
import type { AutoFinalizationDraft } from "./types";
import { useUnsavedChangesPrompt } from "./useUnsavedChangesPrompt";

/** Finalização automática de atendimentos; só o admin vê esta seção. */
export function AutoFinalizationContent() {
  const [draft, setDraft] = useState<AutoFinalizationDraft | null>(null);
  const [saved, setSaved] = useState<AutoFinalizationSettingsInput | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  useSettingsBusy(saving);
  const delayMinutes = draft ? draftDelayMinutes(draft) : Number.NaN;
  const delayValid =
    Number.isInteger(delayMinutes) &&
    delayMinutes >= 0 &&
    delayMinutes <= autoFinalizationMaxDelayMinutes;
  const dirty =
    draft !== null &&
    saved !== null &&
    (draft.enabled !== saved.enabled || delayMinutes !== saved.delayMinutes);
  const prompt = useUnsavedChangesPrompt({
    section: "Finalização automática",
    dirty,
    busy: saving,
    save,
    discard: discardChanges,
  });

  useEffect(() => {
    let active = true;
    api
      .autoFinalizationSettings()
      .then((data) => {
        if (!active) return;
        const input = {
          enabled: data.enabled,
          delayMinutes: data.delayMinutes,
        };
        setSaved(input);
        setDraft(autoFinalizationDraft(input));
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  function discardChanges() {
    if (saved) setDraft(autoFinalizationDraft(saved));
    setError("");
    setNotice("");
  }

  async function save() {
    if (savingRef.current || !draft) return;
    if (!formRef.current?.reportValidity() || !delayValid)
      throw new Error("Informe um tempo de espera entre 0 minutos e 7 dias.");
    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await api.saveAutoFinalizationSettings({
        enabled: draft.enabled,
        delayMinutes,
      });
      const input = {
        enabled: result.enabled,
        delayMinutes: result.delayMinutes,
      };
      setSaved(input);
      setDraft(autoFinalizationDraft(input));
      setNotice(
        input.enabled
          ? "Finalização automática ligada."
          : "Finalização automática desligada.",
      );
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
          {!draft && (
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
      {!draft ? (
        !error && <LoadingBlock />
      ) : (
        <form
          ref={formRef}
          className="clinical-form"
          onChange={() => setNotice("")}
          onSubmit={(event) => void submit(event)}
        >
          <fieldset className="settings-fieldset" disabled={saving}>
            <legend>Finalização automática</legend>
            <p className="muted-copy">
              Atendimentos que continuam agendados ou confirmados depois do
              horário passam a contar como realizados quando o tempo de espera
              termina. Faltas e cancelamentos registrados antes disso são
              mantidos.
            </p>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) =>
                  setDraft({ ...draft, enabled: event.target.checked })
                }
              />
              Finalizar atendimentos automaticamente
            </label>
            <div className="form-grid auto-finalization-delay">
              <label>
                Tempo de espera após o término
                <input
                  type="number"
                  inputMode="numeric"
                  required
                  min={0}
                  step={1}
                  max={
                    autoFinalizationMaxDelayMinutes /
                    autoFinalizationUnits[draft.unit].minutes
                  }
                  disabled={!draft.enabled}
                  value={draft.amount}
                  onChange={(event) =>
                    setDraft({ ...draft, amount: event.target.value })
                  }
                />
              </label>
              <label>
                Unidade
                <select
                  value={draft.unit}
                  disabled={!draft.enabled}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      unit: event.target.value as AutoFinalizationDraft["unit"],
                    })
                  }
                >
                  {Object.entries(autoFinalizationUnits).map(([key, unit]) => (
                    <option key={key} value={key}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="auto-finalization-summary"
              data-enabled={draft.enabled}
              role="status"
            >
              {!draft.enabled ? (
                <p>
                  Desligada: os atendimentos sem desfecho ficam em “A finalizar”
                  até alguém registrar presença ou falta.
                </p>
              ) : delayValid ? (
                <>
                  <p>
                    <strong>
                      {delayMinutes === 0
                        ? "Finaliza logo após o término."
                        : `Finaliza ${autoFinalizationDelayLabel(delayMinutes)} após o término.`}
                    </strong>{" "}
                    {autoFinalizationExample(delayMinutes)}
                  </p>
                  <p>
                    A sessão do plano é consumida como num registro manual. Se o
                    cliente não tiver saldo, o atendimento continua em “A
                    finalizar”.
                  </p>
                </>
              ) : (
                <p>Informe um tempo de espera entre 0 minutos e 7 dias.</p>
              )}
            </div>
            {saved?.enabled && (
              <NavLink to="/agenda/concluidos" className="secondary-button">
                <CheckCheck size={16} aria-hidden="true" />
                Ver atendimentos concluídos
              </NavLink>
            )}
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
              className="secondary-button"
              type="button"
              disabled={!dirty || saving}
              onClick={discardChanges}
            >
              Descartar alterações
            </button>
            <button className="primary-button" disabled={!dirty || saving}>
              {saving ? "Salvando…" : "Salvar finalização automática"}
            </button>
          </div>
        </form>
      )}
      {prompt.modal}
    </>
  );
}
