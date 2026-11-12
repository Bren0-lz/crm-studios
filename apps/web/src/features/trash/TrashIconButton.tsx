import { Trash2 } from "lucide-react";

/**
 * Botão só com o ícone de lixeira (hover vermelho). O nome acessível e a dica vêm de `label`
 * ("Abrir lixeira" ou "Excluir"). Quem chama decide a permissão: sem ela, nem renderiza.
 */
export function TrashIconButton({
  label,
  onClick,
  disabled = false,
  size = "md",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  size?: "md" | "sm";
}) {
  return (
    <button
      type="button"
      className={`icon-button trash-icon-button${size === "sm" ? " button-sm" : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 size={size === "sm" ? 15 : 18} aria-hidden="true" />
    </button>
  );
}
