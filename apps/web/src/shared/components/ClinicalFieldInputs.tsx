import type { AssessmentField, ClinicalAssessmentInput } from "@crm/contracts";
export function ClinicalFieldInputs({
  fields,
  values,
  onChange,
  disabled = false,
}: {
  fields: AssessmentField[];
  values: ClinicalAssessmentInput["values"];
  onChange: (values: ClinicalAssessmentInput["values"]) => void;
  disabled?: boolean;
}) {
  const set = (key: string, value: ClinicalAssessmentInput["values"][string]) =>
    onChange({ ...values, [key]: value });
  return (
    <>
      {fields.map((field) =>
        field.type === "section" ? (
          <h3 key={field.key}>{field.label}</h3>
        ) : (
          <label key={field.key}>
            {field.label}
            {field.unit ? ` (${field.unit})` : ""}
            {field.type === "boolean" ? (
              <select
                disabled={disabled}
                required={field.required}
                value={
                  values[field.key] === undefined
                    ? ""
                    : String(values[field.key])
                }
                onChange={(event) =>
                  set(
                    field.key,
                    event.target.value === ""
                      ? ""
                      : event.target.value === "true",
                  )
                }
              >
                <option value="">Selecione</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            ) : field.type === "select" || field.type === "multiselect" ? (
              <select
                disabled={disabled}
                multiple={field.type === "multiselect"}
                required={field.required}
                value={
                  field.type === "multiselect"
                    ? Array.isArray(values[field.key])
                      ? (values[field.key] as string[])
                      : []
                    : String(values[field.key] ?? "")
                }
                onChange={(event) =>
                  set(
                    field.key,
                    field.type === "multiselect"
                      ? Array.from(
                          event.target.selectedOptions,
                          (item) => item.value,
                        )
                      : event.target.value,
                  )
                }
              >
                {field.type === "select" && <option value="">Selecione</option>}
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
                rows={4}
                value={String(values[field.key] ?? "")}
                onChange={(event) => set(field.key, event.target.value)}
              />
            ) : (
              <input
                disabled={disabled}
                type={field.type === "text" ? "text" : "number"}
                step="any"
                required={field.required}
                min={field.min}
                max={field.max}
                value={String(values[field.key] ?? "")}
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
        ),
      )}
    </>
  );
}
