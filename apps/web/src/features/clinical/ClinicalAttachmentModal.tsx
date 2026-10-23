import { AudioRecorder } from "./AudioRecorder";
import type { ClinicalAttachmentInput } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { fileToBase64 } from "./model";
import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";

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
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const missing = useMissingFields(
    file ? [] : ["Arquivo ou gravação de áudio"],
    "field-hint",
  );

  async function save() {
    if (!file) throw new Error("Selecione um arquivo ou grave um áudio.");
    if (
      ![
        "application/pdf",
        "image/png",
        "image/jpeg",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
      ].includes(file.type)
    ) {
      throw new Error("Use PDF, PNG, JPEG, Word ou uma gravação de áudio.");
    }
    if (file.size > (file.type.startsWith("audio/") ? 16 : 5) * 1024 * 1024) {
      throw new Error(
        file.type.startsWith("audio/")
          ? "O áudio deve ter no máximo 16 MB."
          : "O arquivo deve ter no máximo 5 MB.",
      );
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
        ...(duration !== undefined ? { durationInSeconds: duration } : {}),
      };
      await api.createClinicalAttachment(input);
      onSaved();
    } finally {
      setLoading(false);
    }
  }
  const prompt = useUnsavedChangesPrompt({
    section: "Anexo clínico",
    dirty: Boolean(file || notes),
    busy: loading || recording,
    save,
    discard: () => {},
  });
  const close = () => prompt.confirmLeave(onClose);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <>
      <Modal
        title="Novo anexo clínico"
        subtitle="PDF, Word e imagens de até 5 MB. Áudios de até 15 minutos e 16 MB."
        busy={loading || recording || Boolean(prompt.modal)}
        onClose={close}
      >
        {can("clinical.attachments_create") && (
          <form className="clinical-form" onSubmit={submit}>
            <label>
              Arquivo
              <input
                required={!file}
                type="file"
                disabled={loading || recording}
                accept="application/pdf,image/png,image/jpeg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setDuration(undefined);
                }}
              />
            </label>
            <AudioRecorder
              disabled={loading}
              onRecorded={(audio, seconds) => {
                setFile(audio);
                setDuration(seconds);
              }}
              onRecording={setRecording}
            />
            {file?.type.startsWith("audio/") && (
              <p>Gravação pronta: {duration}s</p>
            )}
            <label>
              Observações
              <textarea
                rows={3}
                disabled={loading || recording}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            {missing.hint}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={close}
                disabled={loading || recording}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={missing.blocked || loading || recording}
                aria-describedby={missing.describedBy}
              >
                {loading ? "Enviando…" : "Anexar arquivo"}
              </button>
            </div>
          </form>
        )}
      </Modal>
      {prompt.modal}
    </>
  );
}
