import { cpfDigits, formatCpf, isValidCpf } from "@crm/contracts";

export function CpfInput({
  value,
  onChange,
  required = false,
}: {
  value: string;
  onChange: (digits: string) => void;
  required?: boolean;
}) {
  const invalid = cpfDigits(value).length === 11 && !isValidCpf(value);
  return (
    <>
      <input
        required={required}
        inputMode="numeric"
        autoComplete="off"
        placeholder="000.000.000-00"
        maxLength={14}
        value={formatCpf(value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "patient-cpf-error" : undefined}
        onChange={(event) => onChange(cpfDigits(event.target.value))}
      />
      {invalid && (
        <small
          id="patient-cpf-error"
          className="field-error"
          aria-live="polite"
        >
          Informe um CPF válido.
        </small>
      )}
    </>
  );
}
