import { MoneyInput } from "./MoneyInput";

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
      <MoneyInput
        required={required}
        valueInCents={value}
        onChange={(cents) => onChange(cents ?? 0)}
      />
    </label>
  );
}
