import {
  paymentProofLimits,
  type PaymentProof,
  type PaymentProofEntity,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useToast } from "../../shared/feedback/toast-context";
import { downloadBase64File } from "../../shared/lib/file-content";
import { shortDate } from "../../shared/lib/formatting";
import {
  acceptedProofTypes,
  proofFailureMessage,
  proofSizeLabel,
  uploadPaymentProofs,
} from "./payment-proofs";

/**
 * Campo de comprovantes no fim dos modais de baixa: vários PDFs/imagens, enviados depois
 * que o pagamento é registrado (um pedido por arquivo).
 */
export function PaymentProofsField({
  files,
  onChange,
  disabled = false,
  limit = paymentProofLimits.maxFiles,
  className = "",
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  /** Vagas restantes no registro (o total por registro é limitado). */
  limit?: number;
  className?: string;
}) {
  const [error, setError] = useState("");
  function add(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    const valid = picked.filter(
      (file) =>
        acceptedProofTypes.includes(file.type) &&
        file.size > 0 &&
        file.size <= paymentProofLimits.maxSizeInBytes,
    );
    const next = [...files, ...valid].slice(0, limit);
    setError(
      valid.length < picked.length
        ? "Use comprovantes PDF, PNG ou JPEG de até 5 MB."
        : files.length + valid.length > limit
          ? `Anexe no máximo ${limit} comprovante${limit === 1 ? "" : "s"}.`
          : "",
    );
    onChange(next);
  }
  return (
    <fieldset className={`form-fieldset proof-field ${className}`.trim()}>
      <legend>Comprovantes</legend>
      <label>
        Adicionar comprovantes (opcional)
        <input
          type="file"
          multiple
          accept={acceptedProofTypes.join(",")}
          disabled={disabled || files.length >= limit}
          onChange={(event) => {
            add(event.target.files);
            // Permite escolher o mesmo arquivo de novo depois de removê-lo.
            event.target.value = "";
          }}
        />
      </label>
      <p className="muted-copy">
        PDF, PNG ou JPEG de até 5 MB cada. Selecione vários arquivos de uma vez
        ou adicione aos poucos.
      </p>
      {files.length > 0 && (
        <ul className="proof-list" aria-label="Comprovantes selecionados">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <div>
                <strong title={file.name}>{file.name}</strong>
                <small>{proofSizeLabel(file.size)}</small>
              </div>
              <button
                type="button"
                className="secondary-button button-sm"
                disabled={disabled}
                aria-label={`Remover ${file.name}`}
                onClick={() =>
                  onChange(files.filter((_, position) => position !== index))
                }
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="form-error">{error}</div>}
    </fieldset>
  );
}

/** Comprovantes já anexados a uma baixa: baixar e anexar outros. */
export function PaymentProofsModal({
  entity,
  entityId,
  subtitle,
  canAttach,
  onClose,
}: {
  entity: PaymentProofEntity;
  entityId: string;
  subtitle: string;
  canAttach: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [proofs, setProofs] = useState<PaymentProof[] | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    api
      .paymentProofs(entity, entityId)
      .then((items) => {
        if (alive) setProofs(items);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [entity, entityId, attempt]);
  async function download(id: string) {
    setError("");
    try {
      downloadBase64File(await api.paymentProofContent(id));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function attach() {
    setBusy(true);
    setError("");
    const failed = await uploadPaymentProofs(entity, entityId, files);
    setBusy(false);
    if (failed.length) setError(proofFailureMessage(failed));
    else toast.success("Comprovantes anexados.");
    setFiles(files.filter((file) => failed.includes(file.name)));
    setAttempt((value) => value + 1);
  }
  const remaining = paymentProofLimits.maxFiles - (proofs?.length ?? 0);
  return (
    <Modal
      eyebrow="Financeiro"
      title="Comprovantes"
      subtitle={subtitle}
      busy={busy}
      dirty={files.length > 0}
      onClose={onClose}
    >
      {error && <ErrorBanner error={error} />}
      {proofs === null ? (
        !error && <LoadingBlock />
      ) : proofs.length === 0 ? (
        <EmptyState
          title="Nenhum comprovante anexado"
          copy="Os comprovantes anexados ao registrar o pagamento aparecem aqui."
        />
      ) : (
        <ul className="proof-list" aria-label="Comprovantes anexados">
          {proofs.map((proof) => (
            <li key={proof.id}>
              <div>
                <strong title={proof.fileName}>{proof.fileName}</strong>
                <small>
                  {proofSizeLabel(proof.sizeInBytes)} · {proof.authorName} em{" "}
                  {shortDate.format(new Date(proof.createdAt))}
                </small>
              </div>
              <button
                type="button"
                className="secondary-button button-sm"
                disabled={busy}
                aria-label={`Baixar ${proof.fileName}`}
                onClick={() => void download(proof.id)}
              >
                Baixar
              </button>
            </li>
          ))}
        </ul>
      )}
      {canAttach && proofs !== null && remaining > 0 && (
        <PaymentProofsField
          files={files}
          onChange={setFiles}
          disabled={busy}
          limit={remaining}
        />
      )}
      <div className="modal-actions">
        <ModalCancelButton disabled={busy}>Fechar</ModalCancelButton>
        {canAttach && files.length > 0 && (
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void attach()}
          >
            {busy ? "Enviando…" : "Anexar comprovantes"}
          </button>
        )}
      </div>
    </Modal>
  );
}
