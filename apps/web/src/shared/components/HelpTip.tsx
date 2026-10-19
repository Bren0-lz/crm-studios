import { CircleHelp } from "lucide-react";
import { useId, useState } from "react";

/**
 * Ajuda curta para um termo técnico: gatilho com `aria-describedby`; a explicação abre ao
 * clicar e ao focar (não só no hover) e fecha com Esc ou ao sair.
 *
 * O gatilho é um `span role="button"` (e não `<button>`) porque costuma ficar dentro de um
 * `<label>`: um botão seria o controle rotulado e o campo perderia o rótulo.
 */
export function HelpTip({ term, text }: { term: string; text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="help-tip">
      <span
        role="button"
        tabIndex={0}
        className="help-tip-button"
        aria-label={`Ajuda: ${term}`}
        aria-describedby={id}
        aria-expanded={open}
        onClick={(event) => {
          // Não ativa o campo do rótulo.
          event.preventDefault();
          setOpen((current) => !current);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => !current);
          } else if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <CircleHelp size={15} aria-hidden="true" />
      </span>
      <span id={id} role="tooltip" className="help-tip-text" hidden={!open}>
        {text}
      </span>
    </span>
  );
}
