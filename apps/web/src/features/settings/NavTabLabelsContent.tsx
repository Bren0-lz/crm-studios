import {
  defaultNavTabLabels,
  NAV_TAB_LABEL_MAX,
  type NavTabLabel,
} from "@crm/contracts";
import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { NavTabLabelsContext } from "../../shared/lib/NavTabLabelsContext";
import { useSettingsBusy } from "../../shared/workflows/useSettingsBusy";
import { useUnsavedChangesPrompt } from "./useUnsavedChangesPrompt";

/** Nomes das abas do menu lateral; só o admin vê esta seção. */
export function NavTabLabelsContent() {
  const publishLabels = useContext(NavTabLabelsContext);
  const [labels, setLabels] = useState<NavTabLabel[] | null>(null);
  const [savedLabels, setSavedLabels] = useState<NavTabLabel[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  useSettingsBusy(saving);
  const dirty =
    labels !== null &&
    savedLabels !== null &&
    JSON.stringify(labels) !== JSON.stringify(savedLabels);
  const prompt = useUnsavedChangesPrompt({
    section: "Abas do menu",
    dirty,
    busy: saving,
    save,
    discard: discardChanges,
  });

  useEffect(() => {
    let active = true;
    api
      .navTabLabels()
      .then((data) => {
        if (!active) return;
        setLabels(data);
        setSavedLabels(data);
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  function discardChanges() {
    setLabels(savedLabels);
    setError("");
    setNotice("");
  }

  async function save() {
    if (savingRef.current || !labels) return;
    if (!formRef.current?.reportValidity())
      throw new Error("Revise os nomes das abas antes de salvar.");
    const names = labels.map((item) =>
      item.label.trim().toLocaleLowerCase("pt-BR"),
    );
    if (new Set(names).size !== names.length)
      throw new Error("Duas abas não podem ter o mesmo nome.");
    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await api.saveNavTabLabels(labels);
      setLabels(saved);
      setSavedLabels(saved);
      publishLabels(saved);
      setNotice("Nomes das abas salvos.");
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
          {!labels && (
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
      {!labels ? (
        !error && <LoadingBlock />
      ) : (
        <form
          ref={formRef}
          className="clinical-form"
          onChange={() => setNotice("")}
          onSubmit={(event) => void submit(event)}
        >
          <fieldset className="settings-fieldset" disabled={saving}>
            <legend>Menu lateral</legend>
            <p className="muted-copy">
              Os novos nomes valem para toda a equipe, em todas as filiais.
            </p>
            <div className="form-grid">
              {labels.map((item, index) => (
                <label key={item.tab}>
                  Aba: {defaultNavTabLabels[item.tab]}
                  <input
                    required
                    maxLength={NAV_TAB_LABEL_MAX}
                    value={item.label}
                    onChange={(event) =>
                      setLabels(
                        labels.map((current, position) =>
                          position === index
                            ? { ...current, label: event.target.value }
                            : current,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setLabels(
                  labels.map((item) => ({
                    ...item,
                    label: defaultNavTabLabels[item.tab],
                  })),
                );
                setNotice("");
              }}
            >
              Restaurar nomes padrão
            </button>
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
              {saving ? "Salvando…" : "Salvar nomes das abas"}
            </button>
          </div>
        </form>
      )}
      {prompt.modal}
    </>
  );
}
