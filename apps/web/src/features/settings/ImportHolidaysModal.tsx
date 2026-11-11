import {
  saoPauloToday,
  suggestedHolidays,
  suggestedHolidayScopeLabels,
} from "@crm/contracts";
import type { Holiday, HolidayBatchResult } from "@crm/contracts";
import { useMemo, useState } from "react";
import { api, ApiClientError } from "../../api";
import { Modal } from "../../shared/components/Modal";
import { formatIsoDate } from "../../shared/lib/formatting";

export function ImportHolidaysModal({
  registered,
  onClose,
  onDone,
}: {
  registered: Holiday[];
  onClose: () => void;
  onDone: (result: HolidayBatchResult) => void;
}) {
  const currentYear = Number(saoPauloToday().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const registeredDates = useMemo(
    () => new Set(registered.map((item) => item.date)),
    [registered],
  );
  const suggestions = useMemo(() => suggestedHolidays(year), [year]);
  const selected = suggestions.filter(
    (item) => !registeredDates.has(item.date) && !unchecked.has(item.date),
  );

  function toggle(date: string) {
    setUnchecked((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function confirm() {
    if (saving || selected.length === 0) return;
    setSaving(true);
    setError("");
    try {
      onDone(
        await api.createHolidays(
          selected.map(({ date, name }) => ({ date, name })),
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível importar os feriados.",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Importar feriados"
      subtitle="Nacionais, do estado do RJ e de Bom Jesus do Itabapoana"
      eyebrow="Feriados"
      busy={saving}
      onClose={onClose}
    >
      <div className="form-grid">
        <label>
          Ano
          <select
            value={year}
            disabled={saving}
            onChange={(event) => {
              setYear(Number(event.target.value));
              setUnchecked(new Set());
            }}
          >
            {[currentYear, currentYear + 1].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <p className="muted-copy span-2">
          Confira as datas antes de importar. Pontos facultativos e feriados
          definidos por decreto da prefeitura dependem de cada ano; desmarque o
          que não valer e cadastre à mão o que faltar.
        </p>
        <ul className="holiday-import-list span-2">
          {suggestions.map((item) => {
            const taken = registeredDates.has(item.date);
            return (
              <li key={item.date}>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={!taken && !unchecked.has(item.date)}
                    disabled={taken || saving}
                    onChange={() => toggle(item.date)}
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {formatIsoDate(item.date)} ·{" "}
                      {suggestedHolidayScopeLabels[item.scope]}
                      {item.optional && " · Ponto facultativo"}
                      {taken && " · Já cadastrado"}
                    </small>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Voltar
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void confirm()}
            disabled={saving || selected.length === 0}
          >
            {saving
              ? "Importando…"
              : selected.length === 1
                ? "Importar 1 feriado"
                : `Importar ${selected.length} feriados`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
