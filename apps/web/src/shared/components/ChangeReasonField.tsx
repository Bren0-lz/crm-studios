import { CHANGE_REASON_MAX_LENGTH } from "@crm/contracts";

/**
 * Motivo opcional de uma edição: vai junto do salvamento (`changeReason`) e aparece no
 * Histórico ao lado dos campos alterados. Use só nos modais de edição, não na criação.
 */
export function ChangeReasonField({
  value,
  onChange,
  disabled,
  className = "span-2",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={className}>
      Motivo da alteração (opcional)
      <textarea
        rows={2}
        maxLength={CHANGE_REASON_MAX_LENGTH}
        value={value}
        disabled={disabled}
        placeholder="Ex.: cliente informou novo telefone"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
