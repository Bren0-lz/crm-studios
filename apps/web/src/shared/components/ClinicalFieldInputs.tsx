import {
  assessmentValueLabel,
  type AssessmentField,
  type ClinicalAssessmentInput,
  type PreviousAssessmentAnswer,
} from "@crm/contracts";
import { useId } from "react";
import { shortDate } from "../lib/formatting";

type Values = ClinicalAssessmentInput["values"];

/** Seleção simples com até tantas opções vira botões de opção; acima disso, lista suspensa. */
const maxRadioOptions = 8;

/**
 * Campos de um formulário de avaliação. Com `previous`, mostra abaixo de cada campo a
 * última resposta registrada para o cliente (só consulta; não preenche nada).
 */
export function ClinicalFieldInputs({
  fields,
  values,
  onChange,
  disabled = false,
  previous,
}: {
  fields: AssessmentField[];
  values: Values;
  onChange: (values: Values) => void;
  disabled?: boolean;
  previous?: Record<string, PreviousAssessmentAnswer> | undefined;
}) {
  const id = useId();
  const set = (key: string, value: Values[string] | undefined) => {
    const next = { ...values };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  return (
    <div className="assessment-fields">
      {fields.map((field) => {
        if (field.type === "section")
          return (
            <h3 key={field.key} className="assessment-section-title">
              {field.label}
            </h3>
          );
        const fieldId = `${id}-${field.key}`;
        const answer = previous?.[field.key];
        const hintId = answer ? `${fieldId}-previous` : undefined;
        const hint = answer && (
          <p className="assessment-previous" id={hintId}>
            <span>
              Anterior · {shortDate.format(new Date(answer.createdAt))}:
            </span>{" "}
            {assessmentValueLabel(answer.value, field)}
          </p>
        );
        const label = `${field.label}${field.unit ? ` (${field.unit})` : ""}`;
        const value = values[field.key];
        const choices =
          field.type === "boolean"
            ? [
                ["true", "Sim"],
                ["false", "Não"],
              ]
            : field.type === "select" &&
                (field.options?.length ?? 0) <= maxRadioOptions
              ? (field.options ?? []).map((option) => [option, option])
              : undefined;
        if (choices)
          return (
            <div className="assessment-field wide" key={field.key}>
              <fieldset
                className="assessment-choice"
                aria-describedby={hintId}
                disabled={disabled}
              >
                <legend>{label}</legend>
                {choices.map(([optionValue, optionLabel]) => (
                  <label key={optionValue}>
                    <input
                      type="radio"
                      name={fieldId}
                      required={field.required}
                      checked={
                        value !== undefined && String(value) === optionValue
                      }
                      onChange={() =>
                        set(
                          field.key,
                          field.type === "boolean"
                            ? optionValue === "true"
                            : optionValue,
                        )
                      }
                    />
                    {optionLabel}
                  </label>
                ))}
                {!field.required && value !== undefined && value !== "" && (
                  <button
                    type="button"
                    className="text-button button-sm"
                    onClick={() => set(field.key, undefined)}
                  >
                    Limpar
                  </button>
                )}
              </fieldset>
              {hint}
            </div>
          );
        if (field.type === "multiselect") {
          const selected = Array.isArray(value) ? value : [];
          return (
            <div className="assessment-field wide" key={field.key}>
              <fieldset
                className="assessment-choice"
                aria-describedby={hintId}
                disabled={disabled}
              >
                <legend>{label}</legend>
                {field.options?.map((option) => (
                  <label key={option}>
                    <input
                      type="checkbox"
                      checked={selected.includes(option)}
                      onChange={(event) =>
                        set(
                          field.key,
                          event.target.checked
                            ? (field.options ?? []).filter(
                                (item) =>
                                  item === option || selected.includes(item),
                              )
                            : selected.filter((item) => item !== option),
                        )
                      }
                    />
                    {option}
                  </label>
                ))}
              </fieldset>
              {hint}
            </div>
          );
        }
        return (
          <div
            className={`assessment-field${field.type === "long_text" ? " wide" : ""}`}
            key={field.key}
          >
            <label>
              {label}
              {field.type === "select" ? (
                <select
                  disabled={disabled}
                  required={field.required}
                  aria-describedby={hintId}
                  value={String(value ?? "")}
                  onChange={(event) => set(field.key, event.target.value)}
                >
                  <option value="">Selecione</option>
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.type === "long_text" ? (
                <textarea
                  disabled={disabled}
                  required={field.required}
                  aria-describedby={hintId}
                  rows={3}
                  value={String(value ?? "")}
                  onChange={(event) => set(field.key, event.target.value)}
                />
              ) : (
                <input
                  disabled={disabled}
                  type={field.type === "text" ? "text" : "number"}
                  step="any"
                  required={field.required}
                  aria-describedby={hintId}
                  min={field.min}
                  max={field.max}
                  value={String(value ?? "")}
                  onChange={(event) =>
                    set(
                      field.key,
                      field.type === "text" || event.target.value === ""
                        ? event.target.value
                        : Number(event.target.value),
                    )
                  }
                />
              )}
            </label>
            {hint}
          </div>
        );
      })}
    </div>
  );
}
