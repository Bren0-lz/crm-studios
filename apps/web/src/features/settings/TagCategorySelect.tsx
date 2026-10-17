import {
  patientTagCategoryLabels,
  type PatientTagCategory,
} from "@crm/contracts";

/** Categoria opcional da etiqueta (V3); sem cor própria, a etiqueta usa a cor da categoria. */
export function TagCategorySelect({
  value,
  onChange,
}: {
  value: PatientTagCategory | "";
  onChange: (value: PatientTagCategory | "") => void;
}) {
  return (
    <label>
      Categoria
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as PatientTagCategory | "")
        }
      >
        <option value="">Sem categoria</option>
        {(
          Object.entries(patientTagCategoryLabels) as Array<
            [PatientTagCategory, string]
          >
        ).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <small className="field-hint">
        Com a cor padrão (cinza), a etiqueta usa a cor da categoria.
      </small>
    </label>
  );
}
