import type { ClinicalAttachmentInput } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { fileToBase64 } from "./model";

export function ClinicalAttachmentModal({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuthorization();
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) {
      setError("Use um arquivo PDF, PNG ou JPEG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("O arquivo deve ter no máximo 5 MB.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const input: ClinicalAttachmentInput = {
        patientId,
        fileName: file.name,
        mimeType: file.type as ClinicalAttachmentInput["mimeType"],
        sizeInBytes: file.size,
        contentBase64: await fileToBase64(file),
        notes,
      };
      await api.createClinicalAttachment(input);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Novo anexo clínico"
      subtitle="PDF, PNG ou JPEG de até 5 MB. O conteúdo é validado e recebe uma impressão SHA-256."
      busy={loading}
      onClose={onClose}
    >
      {can("clinical.attachments_create") && (
        <form className="clinical-form" onSubmit={submit}>
          <label>
            Arquivo
            <input
              required
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            Observações
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button className="primary-button" disabled={!file || loading}>
              {loading ? "Enviando…" : "Anexar arquivo"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
