import type { AssessmentTemplateInput } from "@crm/contracts";
import { useState } from "react";
import { ClinicalFieldInputs } from "../../shared/components/ClinicalFieldInputs";
import { ClinicalFormBuilder } from "../../shared/components/ClinicalFormBuilder";

/** Nome, especialidade, perguntas e prévia de um modelo de avaliação. */
export function AssessmentTemplateFields({
  form,
  onChange,
}: {
  form: AssessmentTemplateInput;
  onChange: (form: AssessmentTemplateInput) => void;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <>
      <div className="form-grid">
        <label>
          Nome do modelo
          <input
            required
            minLength={3}
            maxLength={120}
            value={form.name}
            onChange={(event) =>
              onChange({ ...form, name: event.target.value })
            }
          />
        </label>
        <label>
          Especialidade
          <input
            required
            minLength={2}
            maxLength={100}
            value={form.specialty}
            onChange={(event) =>
              onChange({ ...form, specialty: event.target.value })
            }
          />
        </label>
      </div>
      <ClinicalFormBuilder
        fields={form.fields}
        onChange={(fields) => onChange({ ...form, fields })}
      />
      <button
        type="button"
        className="secondary-button"
        aria-expanded={preview}
        onClick={() => setPreview((value) => !value)}
      >
        Prévia do formulário
      </button>
      {preview && (
        <fieldset disabled className="assessment-preview">
          <legend>Prévia</legend>
          <ClinicalFieldInputs
            fields={form.fields}
            values={{}}
            onChange={() => {}}
          />
        </fieldset>
      )}
    </>
  );
}
