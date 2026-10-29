import type { IssuedDocument, DocumentSignatureInput } from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { localIsoDate, shortDate } from "../../shared/lib/formatting";
export function DocumentSignatureActions({
  document,
  onChanged,
}: {
  document: IssuedDocument;
  onChanged: (document: IssuedDocument) => void;
}) {
  const { can, user } = useAuthorization();
  const toast = useToast();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [date, setDate] = useState(localIsoDate()),
    [responsible, setResponsible] = useState(user?.fullName ?? ""),
    [file, setFile] = useState<Omit<
      DocumentSignatureInput,
      "signedOn" | "responsibleName"
    > | null>(null);
  const missing = useMissingFields(
    [
      !date && "Data da assinatura",
      responsible.trim().length < 2 &&
        "Responsável pela obtenção (pelo menos 2 caracteres)",
      !file && "Cópia do documento assinado",
    ].filter((item): item is string => Boolean(item)),
    "field-hint",
  );
  async function select(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      if (
        file.size > 5242880 ||
        !["application/pdf", "image/png", "image/jpeg"].includes(file.type)
      )
        throw new Error("Selecione PDF, PNG ou JPEG de até 5 MB.");
      const buffer = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buffer.length; i += 8192)
        binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
      setFile({
        fileName: file.name,
        mimeType: file.type as DocumentSignatureInput["mimeType"],
        sizeInBytes: file.size,
        contentBase64: btoa(binary),
      });
    } catch (cause) {
      setError((cause as Error).message);
      setFile(null);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      const data = await api.documentSignatureContent(document.id),
        binary = atob(data.contentBase64),
        bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0)),
        blob = new Blob([bytes], { type: data.mimeType }),
        url = URL.createObjectURL(blob),
        link = window.document.createElement("a");
      link.href = url;
      link.download = data.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {document.manualSignature ? (
        <div>
          <p>
            Assinatura manual de{" "}
            {shortDate.format(
              new Date(`${document.manualSignature.signedOn}T12:00:00`),
            )}{" "}
            · responsável {document.manualSignature.responsibleName}. Registrada
            por {document.manualSignature.actorName}.
          </p>
          <button
            className="secondary-button button-sm"
            disabled={busy}
            onClick={() => void download()}
          >
            Baixar cópia assinada
          </button>
        </div>
      ) : (
        document.status === "issued" &&
        !document.signatureLink?.signedAt &&
        can("contracts.status") && (
          <button
            className="secondary-button button-sm"
            onClick={() => setOpen(true)}
          >
            Registrar assinatura manual
          </button>
        )
      )}
      {error && !open && <ErrorBanner error={error} />}
      {open && (
        <Modal
          title="Registrar assinatura manual"
          subtitle={document.title}
          busy={busy}
          dirty={Boolean(file)}
          onClose={() => {
            setOpen(false);
            setFile(null);
          }}
        >
          <form
            className="clinical-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!file) return;
              setBusy(true);
              setError("");
              try {
                onChanged(
                  await api.recordDocumentSignature(document.id, {
                    ...file,
                    signedOn: date,
                    responsibleName: responsible,
                  }),
                );
                setOpen(false);
                setFile(null);
                toast.success("Assinatura registrada.");
              } catch (cause) {
                setError((cause as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <ErrorBanner error={error} />}
            <fieldset className="form-fields form-grid" disabled={busy}>
              <label>
                Data da assinatura
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label>
                Responsável pela obtenção
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={responsible}
                  onChange={(event) => setResponsible(event.target.value)}
                />
              </label>
              <label>
                Cópia do documento assinado
                <input
                  type="file"
                  required
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={(event) => void select(event.target.files?.[0])}
                />
              </label>
              <p className="muted-copy">
                A assinatura foi obtida fora do CRM. O conteúdo emitido e a
                situação do documento permanecem preservados.
              </p>
            </fieldset>
            {missing.hint}
            <div className="modal-actions">
              <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
              <button
                className="primary-button"
                disabled={busy || missing.blocked}
                aria-describedby={missing.describedBy}
              >
                Registrar assinatura
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
