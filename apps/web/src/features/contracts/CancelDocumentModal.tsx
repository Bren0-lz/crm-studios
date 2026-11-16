import { CHANGE_REASON_MAX_LENGTH, type IssuedDocument } from "@crm/contracts";
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
  // Motivo obrigatório (E7c): fica no contrato e no Histórico.
  const [reason, setReason] = useState("");
  async function confirmCancel() {
    if (!reason.trim()) return;
    setSaving(true);
    setError("");
    try {
      onCancelled(
        await api.updateDocumentStatus(document.id, "cancelled", reason.trim()),
      );
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
        <label className="span-2">
          Motivo
          <textarea
            required
            maxLength={CHANGE_REASON_MAX_LENGTH}
            placeholder="Ex.: cliente desistiu do plano"
            value={reason}
            disabled={saving}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
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
              disabled={saving || !reason.trim()}
            >
              {saving ? "Cancelando…" : "Cancelar documento"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
