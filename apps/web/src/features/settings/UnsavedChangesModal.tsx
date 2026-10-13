import { useState, type FormEvent } from "react";
import { Modal } from "../../shared/components/Modal";

export function UnsavedChangesModal({
  section,
  onSave,
  onDiscard,
  onContinue,
}: {
  section: string;
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onContinue: () => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      await onSave();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      eyebrow="Alterações não salvas"
      title="Salvar as alterações?"
      subtitle={`${section} tem edição que ainda não foi salva.`}
      busy={saving}
      onClose={onContinue}
    >
      <form
        className="form-grid"
        noValidate
        onSubmit={(event) => void save(event)}
      >
        <p className="span-2">
          Salve para manter o que foi alterado ou descarte para voltar aos
          valores salvos.
        </p>
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onContinue}
            disabled={saving}
          >
            Continuar editando
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={onDiscard}
            disabled={saving}
          >
            Descartar alterações
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={saving}
            autoFocus
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
