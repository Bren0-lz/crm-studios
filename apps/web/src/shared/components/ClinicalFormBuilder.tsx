import type { AssessmentField } from "@crm/contracts";
export function ClinicalFormBuilder({
  fields,
  onChange,
}: {
  fields: AssessmentField[];
  onChange: (fields: AssessmentField[]) => void;
}) {
  const change = (index: number, patch: Partial<AssessmentField>) =>
    onChange(
      fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  const types = {
    text: "Resposta curta",
    long_text: "Resposta longa",
    number: "Número",
    scale: "Escala",
    boolean: "Sim/Não",
    select: "Seleção simples",
    multiselect: "Seleção múltipla",
    section: "Seção",
  };
  return (
    <div className="clinical-form-builder">
      {fields.map((field, index) => (
        <fieldset className="form-fieldset" key={field.key}>
          <legend>Campo {index + 1}</legend>
          <div className="form-grid">
            <label>
              Pergunta ou título
              <input
                required
                value={field.label}
                onChange={(event) =>
                  change(index, { label: event.target.value })
                }
              />
            </label>
            <label>
              Tipo
              <select
                value={field.type}
                onChange={(event) =>
                  change(index, {
                    type: event.target.value as AssessmentField["type"],
                  })
                }
              >
                {Object.entries(types).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {["select", "multiselect"].includes(field.type) && (
              <label>
                Opções, uma por linha
                <textarea
                  required
                  rows={4}
                  value={field.options?.join("\n") ?? ""}
                  onChange={(event) =>
                    change(index, { options: event.target.value.split("\n") })
                  }
                />
              </label>
            )}
            {["number", "scale"].includes(field.type) && (
              <>
                <label>
                  Unidade
                  <input
                    value={field.unit ?? ""}
                    onChange={(event) =>
                      change(index, { unit: event.target.value })
                    }
                  />
                </label>
                <label>
                  Mínimo
                  <input
                    type="number"
                    step="any"
                    value={field.min ?? ""}
                    onChange={(event) =>
                      change(index, {
                        min:
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Máximo
                  <input
                    type="number"
                    step="any"
                    value={field.max ?? ""}
                    onChange={(event) =>
                      change(index, {
                        max:
                          event.target.value === ""
                            ? undefined
                            : Number(event.target.value),
                      })
                    }
                  />
                </label>
              </>
            )}
            {field.type !== "section" && (
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) =>
                    change(index, { required: event.target.checked })
                  }
                />
                Obrigatório
              </label>
            )}
            <div className="page-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={index === 0}
                onClick={() => {
                  const next = [...fields];
                  [next[index - 1], next[index]] = [
                    next[index]!,
                    next[index - 1]!,
                  ];
                  onChange(next);
                }}
              >
                Mover para cima
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onChange(fields.filter((_, i) => i !== index))}
              >
                Remover campo
              </button>
            </div>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary-button"
        disabled={fields.length >= 60}
        onClick={() => {
          const suffix =
            Math.max(
              0,
              ...fields.map(
                (field) => Number(field.key.replace("campo_", "")) || 0,
              ),
            ) + 1;
          onChange([
            ...fields,
            {
              key: `campo_${suffix}`,
              label: "",
              type: "text",
              required: false,
            },
          ]);
        }}
      >
        Adicionar campo
      </button>
    </div>
  );
}
