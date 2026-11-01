import type { ClinicBranding, IssuedDocument } from "@crm/contracts";
import { FileDown, MessageCircle, Printer } from "lucide-react";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { shortDate, timeLabel } from "../../shared/lib/formatting";
import { DocumentPaper } from "./DocumentPaper";
import { DocumentSignatureActions } from "./DocumentSignatureActions";
import {
  documentSituation,
  documentSituationLabels,
  documentSituationPills,
} from "./model";
import { SignatureLinkRecord } from "./SignatureLinkRecord";

function when(iso: string | undefined) {
  const date = new Date(iso ?? "");
  if (Number.isNaN(date.getTime())) return "—";
  return `${shortDate.format(date)}, ${timeLabel.format(date)}`;
}

/** Tudo sobre um documento da lista: dados, assinatura, conteúdo e ações. */
export function DocumentDetailsModal({
  document,
  branding,
  inactive,
  onChanged,
  onReview,
  onIssue,
  onSend,
  onPrint,
  onCancel,
  onClose,
}: {
  document: IssuedDocument;
  branding: ClinicBranding | null;
  /** Outro modal da página (emitir, imprimir, cancelar…) está aberto por cima. */
  inactive: boolean;
  onChanged: (document: IssuedDocument) => void;
  onReview: () => void;
  onIssue: () => void;
  onSend: () => void;
  onPrint: (pdf: boolean) => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const { can, canEdit } = useAuthorization();
  const canManage = canEdit("contracts");
  const situation = documentSituation(document);
  const hasSignature = Boolean(
    document.signatureLink || document.manualSignature,
  );
  return (
    <Modal
      eyebrow="Contratos"
      title={document.title}
      subtitle={`${document.patientName}${document.supplierId ? " (fornecedor)" : ""} · ${document.templateName} v${document.templateVersion}`}
      inactive={inactive}
      wide
      onClose={onClose}
    >
      <div className="document-details">
        <dl className="signature-evidence document-details-facts">
          <div>
            <dt>Situação</dt>
            <dd>
              <span
                className={`status-pill ${documentSituationPills[situation]}`}
              >
                {documentSituationLabels[situation]}
              </span>
            </dd>
          </div>
          <div>
            <dt>{document.supplierId ? "Fornecedor" : "Cliente"}</dt>
            <dd>{document.patientName}</dd>
          </div>
          <div>
            <dt>Modelo</dt>
            <dd>
              {document.templateName} v{document.templateVersion}
            </dd>
          </div>
          {document.planName && (
            <div>
              <dt>Plano</dt>
              <dd>{document.planName}</dd>
            </div>
          )}
          <div>
            <dt>Criado em</dt>
            <dd>{when(document.createdAt)}</dd>
          </div>
          {document.issuedAt && (
            <div>
              <dt>Emitido em</dt>
              <dd>{when(document.issuedAt)}</dd>
            </div>
          )}
          {document.cancelledAt && (
            <div>
              <dt>Cancelado em</dt>
              <dd>{when(document.cancelledAt)}</dd>
            </div>
          )}
        </dl>

        <section className="document-details-section">
          <h3>Assinatura</h3>
          {!hasSignature && (
            <p className="muted-copy">
              {document.status === "draft"
                ? "Emita o documento para enviá-lo à assinatura."
                : document.status === "cancelled"
                  ? "Documento cancelado sem assinatura."
                  : "Nenhum link de assinatura enviado."}
            </p>
          )}
          <SignatureLinkRecord document={document} />
          <DocumentSignatureActions document={document} onChanged={onChanged} />
        </section>

        <details className="document-details-section document-details-content">
          <summary>Ver conteúdo</summary>
          <DocumentPaper
            body={document.snapshotBody}
            content={document.snapshotContent}
            branding={document.branding ?? branding}
          />
        </details>

        <div className="modal-actions document-details-actions">
          {canManage &&
            document.status !== "cancelled" &&
            can("contracts.cancel") && (
              <button
                type="button"
                className="danger-button"
                onClick={onCancel}
              >
                Cancelar documento
              </button>
            )}
          {canManage &&
            document.status === "draft" &&
            can("contracts.issue") && (
              <button
                type="button"
                className="secondary-button"
                onClick={onReview}
              >
                Revisar rascunho
              </button>
            )}
          {document.status === "issued" && (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onPrint(true)}
              >
                <FileDown size={15} aria-hidden="true" /> Salvar PDF
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onPrint(false)}
              >
                <Printer size={15} aria-hidden="true" /> Imprimir
              </button>
              {canManage &&
                can("contracts.status") &&
                situation !== "signed" && (
                  <button
                    type="button"
                    className="whatsapp-button"
                    onClick={onSend}
                  >
                    <MessageCircle size={15} aria-hidden="true" />
                    Enviar pelo WhatsApp
                  </button>
                )}
            </>
          )}
          {canManage &&
            document.status === "draft" &&
            can("contracts.status") && (
              <button
                type="button"
                className="primary-button"
                onClick={onIssue}
              >
                Emitir
              </button>
            )}
        </div>
      </div>
    </Modal>
  );
}
