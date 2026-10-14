export function CurrencyField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: number;
  onChange: (cents: number) => void;
  required?: boolean;
}) {
  return (
    <label>
      {label} (R$)
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        required={required}
        value={value / 100 || ""}
        onChange={(event) =>
          onChange(Math.round(Number(event.target.value) * 100))
        }
      />
    </label>
  );
}
