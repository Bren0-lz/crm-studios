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
import { ActionModal } from "../../shared/components/ActionModal";
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

/** Lista de comprovantes anexados: baixar e, para quem pode anexar, excluir. */
function ProofList({
  label,
  proofs,
  busy,
  canDelete,
  onDownload,
  onDelete,
}: {
  label: string;
  proofs: PaymentProof[];
  busy: boolean;
  canDelete: boolean;
  onDownload: (id: string) => void;
  onDelete: (proof: PaymentProof) => void;
}) {
  return (
    <ul className="proof-list" aria-label={label}>
      {proofs.map((proof) => (
        <li key={proof.id}>
          <div>
            <strong title={proof.fileName}>{proof.fileName}</strong>
            <small>
              {proofSizeLabel(proof.sizeInBytes)} · {proof.authorName} em{" "}
              {shortDate.format(new Date(proof.createdAt))}
              {proof.reversedAt
                ? ` · baixa estornada em ${shortDate.format(new Date(proof.reversedAt))}`
                : ""}
            </small>
          </div>
          <div className="proof-actions">
            <button
              type="button"
              className="secondary-button button-sm"
              disabled={busy}
              aria-label={`Baixar ${proof.fileName}`}
              onClick={() => onDownload(proof.id)}
            >
              Baixar
            </button>
            {canDelete && (
              <button
                type="button"
                className="secondary-button button-sm"
                disabled={busy}
                aria-label={`Excluir ${proof.fileName}`}
                onClick={() => onDelete(proof)}
              >
                Excluir
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Comprovantes de uma baixa: os da baixa atual e, separados, os de baixas estornadas (ficam
 * no histórico). Quem pode anexar também pode excluir um enviado por engano, com motivo.
 */
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
  const [deleting, setDeleting] = useState<PaymentProof | null>(null);
  const [reason, setReason] = useState("");
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
  const current = proofs?.filter((proof) => !proof.reversedAt) ?? [];
  const reversed = proofs?.filter((proof) => proof.reversedAt) ?? [];
  const remaining = paymentProofLimits.maxFiles - current.length;
  return (
    <>
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
          <>
            {current.length > 0 && (
              <ProofList
                label="Comprovantes anexados"
                proofs={current}
                busy={busy}
                canDelete={canAttach}
                onDownload={(id) => void download(id)}
                onDelete={setDeleting}
              />
            )}
            {reversed.length > 0 && (
              <>
                <h3 className="proof-history-title">Da baixa estornada</h3>
                <ProofList
                  label="Comprovantes da baixa estornada"
                  proofs={reversed}
                  busy={busy}
                  canDelete={canAttach}
                  onDownload={(id) => void download(id)}
                  onDelete={setDeleting}
                />
              </>
            )}
          </>
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
      {deleting && (
        <ActionModal
          eyebrow="Financeiro"
          title="Excluir comprovante"
          subtitle={deleting.fileName}
          effect="O arquivo sai da lista de comprovantes. O registro e o motivo ficam no histórico."
          confirmLabel="Excluir comprovante"
          danger
          dirty={Boolean(reason)}
          missing={
            reason.trim().length < 5 ? ["Motivo (pelo menos 5 caracteres)"] : []
          }
          onClose={() => {
            setDeleting(null);
            setReason("");
          }}
          onConfirm={async () => {
            await api.deletePaymentProof(deleting.id, reason.trim());
            toast.success("Comprovante excluído.");
            setDeleting(null);
            setReason("");
            setAttempt((value) => value + 1);
          }}
        >
          <label className="span-2">
            Motivo
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </ActionModal>
      )}
    </>
  );
}
