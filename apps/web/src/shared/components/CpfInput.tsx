import { cpfDigits, formatCpf, isValidCpf } from "@crm/contracts";

export function CpfInput({
  value,
  onChange,
  required = false,
  hintId,
}: {
  value: string;
  onChange: (digits: string) => void;
  required?: boolean;
  /** Id de uma dica exibida junto do campo (entra no `aria-describedby`). */
  hintId?: string | undefined;
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
        aria-describedby={
          [hintId, invalid ? "patient-cpf-error" : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
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
