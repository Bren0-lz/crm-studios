import { useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "./Modal";

export function ActionModal({
  eyebrow,
  title,
  subtitle,
  effect,
  confirmLabel = "Confirmar",
  danger = false,
  validate,
  onConfirm,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  effect: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  validate?: () => string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
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
      onClose={onClose}
    >
      <form
        className="form-grid"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <p className="span-2">{effect}</p>
        {children}
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Voltar
          </button>
          <button
            type="submit"
            className={danger ? "danger-button" : "primary-button"}
            disabled={saving}
            autoFocus={!children}
          >
            {saving ? "Salvando…" : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
