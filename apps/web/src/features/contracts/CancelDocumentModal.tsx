import type { IssuedDocument } from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";

export function CancelDocumentModal({
  document,
  onClose,
  onCancelled,
}: {
  document: IssuedDocument;
  onClose: () => void;
  onCancelled: (updated: IssuedDocument) => void;
}) {
  const { can } = useAuthorization();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function confirmCancel() {
    setSaving(true);
    setError("");
    try {
      onCancelled(await api.updateDocumentStatus(document.id, "cancelled"));
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Cancelar documento"
      subtitle={document.title}
      eyebrow="Documentos"
      busy={saving}
      onClose={onClose}
    >
      <div className="form-grid">
        <p className="span-2">
          “{document.title}” de {document.patientName} será cancelado
          definitivamente. Esta ação não pode ser desfeita.
        </p>
        {error && <div className="span-2 form-error">{error}</div>}
        <div className="span-2 modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Voltar
          </button>
          {can("contracts.cancel") && (
            <button
              type="button"
              className="danger-button"
              onClick={() => void confirmCancel()}
              disabled={saving}
            >
              {saving ? "Cancelando…" : "Cancelar documento"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
