import { PatientTagBadge } from "../../shared/components/PatientTagBadge";
import {
  normalizeTagColor,
  patientTagPalette,
  tagColorStyle,
} from "../../tag-colors";

export function TagColorPicker({
  value,
  previewName,
  onChange,
}: {
  value: string;
  previewName: string;
  onChange: (color: string) => void;
}) {
  return (
    <fieldset className="form-fieldset span-2 tag-color-picker">
      <legend>Cor</legend>
      <div className="tag-palette" role="group" aria-label="Cores sugeridas">
        {patientTagPalette.map((item) => (
          <button
            type="button"
            key={item.color}
            className="tag-swatch"
            style={tagColorStyle(item.color)}
            aria-label={`Cor ${item.name}`}
            aria-pressed={value === item.color}
            title={item.name}
            onClick={() => onChange(item.color)}
          />
        ))}
      </div>
      <div className="tag-color-row">
        <label className="tag-custom-color">
          Outra cor
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(normalizeTagColor(e.target.value))}
          />
        </label>
        <span className="tag-color-preview">
          Prévia
          <PatientTagBadge name={previewName} color={value} />
        </span>
      </div>
    </fieldset>
  );
}
