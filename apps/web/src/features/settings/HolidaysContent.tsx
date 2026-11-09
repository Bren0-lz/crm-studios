import { withPrefix } from "@crm/contracts";
import type { Holiday } from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiClientError } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { formatIsoDate } from "../../shared/lib/formatting";
import { useSettingsBusy } from "../../shared/workflows/useSettingsBusy";
import { DeleteHolidayModal } from "./DeleteHolidayModal";
import { useUnsavedChangesPrompt } from "./useUnsavedChangesPrompt";

export function HolidaysContent() {
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ date: "", name: "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  useSettingsBusy(saving);
  const [deletingHoliday, setDeletingHoliday] = useState<Holiday | null>(null);

  useEffect(() => {
    let active = true;
    api
      .holidays()
      .then((data) => active && setHolidays(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  async function save() {
    if (savingRef.current) return;
    if (!formRef.current?.reportValidity())
      throw new Error("Revise a data e o nome do feriado.");
    savingRef.current = true;
    setSaving(true);
    setNotice("");
    setFormError("");
    try {
      const created = await api.createHoliday({
        date: form.date,
        name: form.name.trim(),
      });
      setHolidays((items) =>
        [...(items ?? []), created].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      );
      setForm({ date: "", name: "" });
      setNotice("Feriado adicionado.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const prompt = useUnsavedChangesPrompt({
    section: "Feriados",
    dirty: Boolean(form.date || form.name),
    busy: saving,
    save,
    discard: () => {
      setForm({ date: "", name: "" });
      setFormError("");
    },
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save();
    } catch (cause) {
      setFormError((cause as Error).message);
    }
  }

  async function remove(holiday: Holiday) {
    try {
      await api.deleteHoliday(holiday.id);
    } catch (cause) {
      throw new Error(
        cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível excluir o feriado.",
        { cause },
      );
    }
    setHolidays((items) =>
      (items ?? []).filter((item) => item.id !== holiday.id),
    );
    setDeletingHoliday(null);
    setNotice("Feriado excluído.");
  }

  return (
    <>
      <p className="muted-copy">
        Nos feriados a agenda não aceita novos atendimentos.
      </p>
      {prompt.modal}
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
      {!holidays ? (
        !error && <LoadingBlock />
      ) : (
        <>
          <form
            ref={formRef}
            onChange={() => setNotice("")}
            className="form-grid holiday-form"
            onSubmit={(event) => void submit(event)}
          >
            <fieldset className="settings-inline-fields" disabled={saving}>
              <legend>Cadastrar feriado</legend>
              <label>
                Data
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
              <label>
                Nome do feriado
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              {formError && (
                <div className="form-error span-2">{formError}</div>
              )}
              <div className="modal-actions span-2">
                {(form.date || form.name) && (
                  <span className="settings-dirty" role="status">
                    Alterações não salvas
                  </span>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!form.date && !form.name}
                  onClick={() => {
                    setForm({ date: "", name: "" });
                    setFormError("");
                  }}
                >
                  Descartar alterações
                </button>
                <button className="primary-button" disabled={saving}>
                  <Plus size={17} />
                  {saving ? "Adicionando…" : "Adicionar feriado"}
                </button>
              </div>
            </fieldset>
          </form>
          {holidays.length === 0 ? (
            <EmptyState
              title="Nenhum feriado cadastrado"
              copy="Adicione as datas em que a clínica não atende."
            />
          ) : (
            <div className="holiday-list">
              {holidays.map((holiday) => (
                <article key={holiday.id}>
                  <div>
                    <strong>{holiday.name}</strong>
                    <small>{formatIsoDate(holiday.date)}</small>
                  </div>
                  <button
                    type="button"
                    className="danger-button button-sm"
                    aria-label={`Excluir ${withPrefix("feriado", holiday.name)}`}
                    onClick={() => setDeletingHoliday(holiday)}
                  >
                    Excluir
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {deletingHoliday && (
        <DeleteHolidayModal
          holiday={deletingHoliday}
          onClose={() => setDeletingHoliday(null)}
          onConfirm={() => remove(deletingHoliday)}
        />
      )}
    </>
  );
}
