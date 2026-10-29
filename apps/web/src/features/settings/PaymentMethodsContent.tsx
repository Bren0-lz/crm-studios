import {
  installmentsLimitLabel,
  maxInstallmentsLimit,
  paymentMethodLabels,
  type PaymentMethodInstallments,
} from "@crm/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useSettingsBusy } from "../../shared/workflows/useSettingsBusy";
import {
  paymentMethodDrafts,
  paymentMethodDraftIssue,
  paymentMethodsFromDrafts,
} from "./model";
import type { PaymentMethodDraft } from "./types";
import { useUnsavedChangesPrompt } from "./useUnsavedChangesPrompt";

/** Parcelamento por forma de pagamento; só o admin vê esta seção. */
export function PaymentMethodsContent() {
  const [drafts, setDrafts] = useState<PaymentMethodDraft[] | null>(null);
  const [saved, setSaved] = useState<PaymentMethodInstallments[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const savingRef = useRef(false);
  useSettingsBusy(saving);
  const issue = drafts ? paymentMethodDraftIssue(drafts) : "";
  const dirty =
    drafts !== null &&
    saved !== null &&
    JSON.stringify(drafts) !== JSON.stringify(paymentMethodDrafts(saved));
  const prompt = useUnsavedChangesPrompt({
    section: "Formas de pagamento",
    dirty,
    busy: saving,
    save,
    discard: discardChanges,
  });

  useEffect(() => {
    let active = true;
    api
      .paymentMethodSettings()
      .then((data) => {
        if (!active) return;
        setSaved(data.methods);
        setDrafts(paymentMethodDrafts(data.methods));
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  function discardChanges() {
    if (saved) setDrafts(paymentMethodDrafts(saved));
    setError("");
    setNotice("");
  }

  function update(method: string, patch: Partial<PaymentMethodDraft>) {
    setNotice("");
    setDrafts(
      (current) =>
        current?.map((item) =>
          item.method === method ? { ...item, ...patch } : item,
        ) ?? null,
    );
  }

  async function save() {
    if (savingRef.current || !drafts) return;
    if (issue) throw new Error(issue);
    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await api.savePaymentMethodSettings({
        methods: paymentMethodsFromDrafts(drafts),
      });
      setSaved(result.methods);
      setDrafts(paymentMethodDrafts(result.methods));
      setNotice("Formas de pagamento salvas.");
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
          {!drafts && (
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
      {!drafts ? (
        !error && <LoadingBlock />
      ) : (
        <form
          className="clinical-form"
          onSubmit={(event) => void submit(event)}
        >
          <fieldset className="settings-fieldset" disabled={saving}>
            <legend>Parcelamento por forma de pagamento</legend>
            <p className="muted-copy">
              Vale para a venda de planos (parcelas do plano) e para os
              pagamentos registrados na hora, como a baixa de uma parcela ou a
              venda de produtos no cartão parcelado. Cada plano do catálogo
              também pode ter um limite próprio em Configurações › Planos.
            </p>
            <div className="payment-method-list" role="list">
              {drafts.map((item) => {
                const label = paymentMethodLabels[item.method];
                const max = Number(item.maxInstallments);
                return (
                  <div
                    className="payment-method-row"
                    role="listitem"
                    key={item.method}
                  >
                    <strong>{label}</strong>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={item.acceptsInstallments}
                        onChange={(event) =>
                          update(item.method, {
                            acceptsInstallments: event.target.checked,
                            maxInstallments:
                              event.target.checked &&
                              Number(item.maxInstallments) < 2
                                ? "12"
                                : item.maxInstallments,
                          })
                        }
                      />
                      Aceita parcelamento
                    </label>
                    <label>
                      Até quantas parcelas
                      <input
                        type="number"
                        inputMode="numeric"
                        aria-label={`Máximo de parcelas: ${label}`}
                        required={item.acceptsInstallments}
                        min={2}
                        max={maxInstallmentsLimit}
                        step={1}
                        disabled={!item.acceptsInstallments}
                        value={
                          item.acceptsInstallments ? item.maxInstallments : ""
                        }
                        placeholder="Só à vista"
                        onChange={(event) =>
                          update(item.method, {
                            maxInstallments: event.target.value,
                          })
                        }
                      />
                    </label>
                    <span className="payment-method-summary" role="status">
                      {item.acceptsInstallments
                        ? Number.isInteger(max) && max >= 2
                          ? installmentsLimitLabel(max)
                          : "Informe o máximo"
                        : "Só à vista"}
                    </span>
                  </div>
                );
              })}
            </div>
            {issue && dirty && <p className="form-error">{issue}</p>}
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
            <button
              className="primary-button"
              disabled={!dirty || saving || Boolean(issue)}
            >
              {saving ? "Salvando…" : "Salvar formas de pagamento"}
            </button>
          </div>
        </form>
      )}
      {prompt.modal}
    </>
  );
}
