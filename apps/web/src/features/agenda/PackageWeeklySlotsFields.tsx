import type { PackageWeeklySlot } from "@crm/contracts";
import { X } from "lucide-react";
import { shortDate, timeLabel } from "../../shared/lib/formatting";
import { packageWeekdayNames } from "./model";

/**
 * Pacote com dias e horários fixos na semana: cada linha é um dia/horário que se repete
 * até completar o número de sessões. Mostra as datas que serão marcadas.
 */
export function PackageWeeklySlotsFields({
  slots,
  starts,
  showPreview = true,
  onChange,
}: {
  slots: PackageWeeklySlot[];
  /** Datas geradas, em "AAAA-MM-DDTHH:MM" local. */
  starts: string[];
  /** Sem a lista de datas (quem chama já mostra o resumo das sessões). */
  showPreview?: boolean;
  onChange: (slots: PackageWeeklySlot[]) => void;
}) {
  const first = starts[0];
  const last = starts.at(-1);
  return (
    <div className="recurrence-dates span-2">
      <div className="recurrence-dates-head">
        <div>
          <h4>Dias e horários fixos</h4>
          <p>
            As sessões começam na data escolhida acima e se repetem nestes dias
            da semana até completar o pacote.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button button-sm"
          disabled={slots.length >= 7}
          onClick={() =>
            onChange([
              ...slots,
              {
                weekday: ((slots.at(-1)?.weekday ?? 0) + 2) % 7,
                time: slots.at(-1)?.time ?? "09:00",
              },
            ])
          }
        >
          Adicionar dia
        </button>
      </div>
      {slots.map((slot, index) => (
        <div className="recurrence-date-row package-slot-row" key={index}>
          <label>
            {`${index + 1}º dia da semana`}
            <select
              value={slot.weekday}
              onChange={(e) =>
                onChange(
                  slots.map((item, position) =>
                    position === index
                      ? { ...item, weekday: Number(e.target.value) }
                      : item,
                  ),
                )
              }
            >
              {packageWeekdayNames.map((name, weekday) => (
                <option value={weekday} key={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {`Horário do ${index + 1}º dia`}
            <input
              type="time"
              required
              value={slot.time}
              onChange={(e) =>
                onChange(
                  slots.map((item, position) =>
                    position === index
                      ? { ...item, time: e.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remover dia ${index + 1}`}
            disabled={slots.length <= 1}
            onClick={() =>
              onChange(slots.filter((_, position) => position !== index))
            }
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
      {!showPreview ? null : first && last ? (
        <details className="package-preview">
          <summary>
            {starts.length} sessões de {shortDate.format(new Date(first))} a{" "}
            {shortDate.format(new Date(last))}
          </summary>
          <ol>
            {starts.map((value) => (
              <li key={value}>
                {packageWeekdayNames[new Date(value).getDay()]},{" "}
                {shortDate.format(new Date(value))} às{" "}
                {timeLabel.format(new Date(value))}
              </li>
            ))}
          </ol>
        </details>
      ) : (
        <p className="field-hint">Informe o horário de cada dia.</p>
      )}
    </div>
  );
}
