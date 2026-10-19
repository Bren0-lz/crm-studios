import { Check } from "lucide-react";
import { tagColorStyle } from "../../tag-colors";

export function TagChoice({
  name,
  color,
  pressed,
  count,
  disabled,
  hint,
  onToggle,
}: {
  name: string;
  color: string;
  pressed: boolean;
  count?: number;
  disabled?: boolean;
  /** Dica nativa (ex.: etiqueta automática). */
  hint?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="tag-filter tag-choice"
      style={tagColorStyle(color)}
      aria-pressed={pressed}
      disabled={disabled}
      title={hint}
      onClick={onToggle}
    >
      {pressed ? (
        <Check className="tag-check" size={14} aria-hidden="true" />
      ) : (
        <i className="tag-dot" aria-hidden="true" />
      )}
      {name}
      {count !== undefined && <small>{count}</small>}
    </button>
  );
}
