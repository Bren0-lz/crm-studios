import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Modal, ModalCancelButton } from "./Modal";

export function ActionModal({
  eyebrow,
  title,
  subtitle,
  effect,
  confirmLabel = "Confirmar",
  danger = false,
  validate,
  missing = [],
  missingHint,
  dirty = false,
  onConfirm,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Explicação do efeito; omitida quando o formulário já basta. */
  effect?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  validate?: () => string;
  /**
   * O que ainda falta para confirmar: enquanto houver item, o botão fica desativado e a
   * lista aparece acima dele (ligada por `aria-describedby`), em vez de um erro após o clique.
   */
  missing?: string[];
  /** Orientação extra exibida junto da lista do que falta. */
  missingHint?: string;
  /** Campos alterados: Esc, X e Voltar perguntam "Descartar alterações?". */
  dirty?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const missingId = useId();
  const blocked = missing.length > 0;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || blocked) return;
    const problem = validate?.() ?? "";
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onConfirm();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      busy={saving}
      dirty={dirty}
      // Com campos, o foco vai para o primeiro; sem campos, para Confirmar (autoFocus).
      {...(children
        ? { initialFocus: "form input, form select, form textarea" }
        : {})}
      onClose={onClose}
    >
      <form
        className="form-grid"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        {effect && <p className="span-2">{effect}</p>}
        {children}
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        {blocked && (
          <p className="field-hint span-2" id={missingId}>
            Falta: {missing.join(", ")}.{missingHint ? ` ${missingHint}` : ""}
          </p>
        )}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={saving}>Voltar</ModalCancelButton>
          <button
            type="submit"
            className={danger ? "danger-button" : "primary-button"}
            disabled={saving || blocked}
            aria-describedby={blocked ? missingId : undefined}
            autoFocus={!children}
          >
            {saving ? "Salvando…" : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
