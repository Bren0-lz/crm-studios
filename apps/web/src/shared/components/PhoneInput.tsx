import { formatPhone, phoneDigits } from "@crm/contracts";

export function PhoneInput({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (digits: string) => void;
  required?: boolean;
}) {
  return (
    <input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="(11) 99999-9999"
      pattern="\(\d{2}\) \d{4,5}-\d{4}"
      title="Informe o telefone com DDD, por exemplo (11) 99999-9999."
      required={required}
      value={formatPhone(value)}
      onChange={(event) => onChange(phoneDigits(event.target.value))}
    />
  );
}
