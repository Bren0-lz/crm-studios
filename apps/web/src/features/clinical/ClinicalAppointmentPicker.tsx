import type { ClinicalAppointmentOption } from "@crm/contracts";
import { useEffect, useId, useRef, useState } from "react";
import {
  clinicalAppointmentLabel,
  filterClinicalAppointments,
  RECENT_APPOINTMENT_DAYS,
} from "./model";

/** Busca de atendimento para a evolução: mais recentes primeiro, filtro por nome ou data. */
export function ClinicalAppointmentPicker({
  appointments,
  value,
  onChange,
}: {
  appointments: ClinicalAppointmentOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [includeOlder, setIncludeOlder] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const selected = appointments.find((item) => item.id === value);
  const choices = filterClinicalAppointments(
    appointments,
    query ?? "",
    includeOlder,
  );

  useEffect(() => {
    inputRef.current?.setCustomValidity(
      value ? "" : "Selecione um atendimento da lista.",
    );
  }, [value]);

  useEffect(() => {
    if (open && active >= 0)
      listRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  function choose(appointment: ClinicalAppointmentOption) {
    setQuery(null);
    setOpen(false);
    setActive(-1);
    onChange(appointment.id);
  }

  return (
    <div className="patient-picker clinical-appointment-picker">
      <div className="patient-picker-header">
        <label htmlFor={`${listId}-input`}>Atendimento</label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={includeOlder}
            onChange={(event) => setIncludeOlder(event.target.checked)}
          />
          Incluir mais antigos
        </label>
      </div>
      <input
        id={`${listId}-input`}
        ref={inputRef}
        role="combobox"
        required
        autoComplete="off"
        placeholder="Buscar por cliente ou data (DD/MM)"
        value={query ?? (selected ? clinicalAppointmentLabel(selected) : "")}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          open && choices[active] ? `${listId}-${active}` : undefined
        }
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              choices.length
                ? event.key === "ArrowDown"
                  ? (index + 1) % choices.length
                  : index <= 0
                    ? choices.length - 1
                    : index - 1
                : -1,
            );
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (choices[active]) choose(choices[active]);
          } else if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {open && (
        <div className="patient-picker-results">
          {choices.length === 0 && (
            <p role="status">
              {includeOlder
                ? "Nenhum atendimento encontrado"
                : `Nenhum atendimento nos últimos ${RECENT_APPOINTMENT_DAYS} dias. Marque "Incluir mais antigos".`}
            </p>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Atendimentos encontrados"
          >
            {choices.map((appointment, index) => (
              <li
                id={`${listId}-${index}`}
                key={appointment.id}
                role="option"
                aria-selected={appointment.id === value}
                className={index === active ? "active" : ""}
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(appointment)}
              >
                {clinicalAppointmentLabel(appointment)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
