import {
  formatCpf,
  signatureLinkExpired,
  type DocumentSignatureLinkDetails,
  type IssuedDocument,
} from "@crm/contracts";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { shortDate, timeLabel } from "../../shared/lib/formatting";
import type { DocumentPdfSignature } from "./ContractPdf";
import { DocumentPdfPreview } from "./DocumentPdfPreview";

function when(iso: string) {
  const date = new Date(iso);
  return `${shortDate.format(date)}, ${timeLabel.format(date)}`;
}

function viewsLabel(link: NonNullable<IssuedDocument["signatureLink"]>) {
  if (!link.viewCount) return "Ainda não visualizado";
  const times = link.viewCount === 1 ? "1 vez" : `${link.viewCount} vezes`;
  return link.lastViewedAt
    ? `${times} · última em ${when(link.lastViewedAt)}`
    : times;
}

/**
 * Situação do link de assinatura enviado ao cliente: visualizações e assinatura.
 * `detailed` mostra os dados em campos (modal de detalhes, onde a situação já
 * aparece no topo); `actions` entra na mesma linha dos botões do link.
 */
export function SignatureLinkRecord({
  document,
  detailed = false,
  actions,
}: {
  document: IssuedDocument;
  detailed?: boolean;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const link = document.signatureLink;
  if (!link) return null;
  const expired = !link.signedAt && signatureLinkExpired(link);
  return (
    <div
      className={
        detailed
          ? "signature-link-record signature-link-record-detailed"
          : "signature-link-record"
      }
    >
      {detailed ? (
        <dl className="signature-evidence signature-link-facts">
          <div>
            <dt>Link enviado</dt>
            <dd>
              {when(link.createdAt)} por {link.createdByName}
            </dd>
          </div>
          {link.signedAt ? (
            <div>
              <dt>Assinatura</dt>
              <dd>
                Assinado pelo link por {link.signerName} em{" "}
                {when(link.signedAt)}
              </dd>
            </div>
          ) : (
            <div>
              <dt>Validade</dt>
              <dd>
                {expired
                  ? `Expirou em ${when(link.expiresAt)}`
                  : `Vale até ${when(link.expiresAt)}`}
              </dd>
            </div>
          )}
          <div>
            <dt>Visualizações</dt>
            <dd>{viewsLabel(link)}</dd>
          </div>
        </dl>
      ) : (
        <p>
          {link.signedAt ? (
            <>
              <span className="status-pill issued">Assinado pelo link</span>{" "}
              {link.signerName} em {when(link.signedAt)}.
            </>
          ) : signatureLinkExpired(link) ? (
            <>
              <span className="status-pill expired">Link expirado</span> Venceu
              em {when(link.expiresAt)}. Envie de novo pelo WhatsApp para gerar
              outro link.
            </>
          ) : (
            <>
              <span className="status-pill draft">Aguardando assinatura</span>{" "}
              Link enviado em {when(link.createdAt)} por {link.createdByName}.
              Vale até {when(link.expiresAt)}.
            </>
          )}{" "}
          {link.viewCount
            ? `Visualizado ${link.viewCount === 1 ? "1 vez" : `${link.viewCount} vezes`}${link.lastViewedAt ? ` (última em ${when(link.lastViewedAt)})` : ""}.`
            : "Ainda não visualizado."}
        </p>
      )}
      {detailed && expired && (
        <p className="muted-copy">
          Envie de novo pelo WhatsApp para gerar outro link.
        </p>
      )}
      <div className="page-actions">
        {link.signedAt && (
          <button
            type="button"
            className="secondary-button button-sm"
            onClick={() => setViewing(true)}
          >
            Ver contrato assinado
          </button>
        )}
        <button
          type="button"
          className="secondary-button button-sm"
          onClick={() => setOpen(true)}
        >
          Ver registro
        </button>
        {actions}
      </div>
      {open && (
        <SignatureLinkDetailsModal
          document={document}
          onClose={() => setOpen(false)}
        />
      )}
      {viewing && (
        <SignedDocumentModal
          document={document}
          onClose={() => setViewing(false)}
        />
      )}
    </div>
  );
}

function SignatureLinkDetailsModal({
  document,
  onClose,
}: {
  document: IssuedDocument;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<DocumentSignatureLinkDetails | null>(
    null,
  );
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .documentSignatureLink(document.id)
      .then((data) => active && setDetails(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [document.id, document.updatedAt]);
  return (
    <Modal
      eyebrow="Contratos"
      title="Registro da assinatura"
      inactive={viewing}
      subtitle={`${document.title} · ${document.patientName}`}
      onClose={onClose}
    >
      {error ? (
        <ErrorBanner error={error} />
      ) : !details ? (
        <LoadingBlock />
      ) : (
        <div className="signature-link-details">
          <dl className="signature-evidence">
            <div>
              <dt>Link gerado</dt>
              <dd>
                {when(details.createdAt)} por {details.createdByName}
              </dd>
            </div>
            {!details.signedAt && (
              <div>
                <dt>Validade</dt>
                <dd>
                  {signatureLinkExpired(details)
                    ? `Expirado em ${when(details.expiresAt)}`
                    : `Vale até ${when(details.expiresAt)}`}
                </dd>
              </div>
            )}
            <div>
              <dt>Primeira visualização</dt>
              <dd>
                {details.firstViewedAt
                  ? when(details.firstViewedAt)
                  : "Ainda não visualizado"}
              </dd>
            </div>
            <div>
              <dt>Assinatura</dt>
              <dd>
                {details.signedAt
                  ? `${details.signerName} em ${when(details.signedAt)}`
                  : "Ainda não assinado"}
              </dd>
            </div>
            {details.signerCpf && (
              <div>
                <dt>CPF informado</dt>
                <dd>{formatCpf(details.signerCpf)}</dd>
              </div>
            )}
            {details.signerIpAddress && (
              <div>
                <dt>IP da assinatura</dt>
                <dd>{details.signerIpAddress}</dd>
              </div>
            )}
            {details.signerUserAgent && (
              <div>
                <dt>Navegador</dt>
                <dd>{details.signerUserAgent}</dd>
              </div>
            )}
            {details.documentSha256 && (
              <div>
                <dt>Código do documento (SHA-256)</dt>
                <dd className="signature-hash">{details.documentSha256}</dd>
              </div>
            )}
          </dl>
          {details.signatureImage && (
            <figure className="signature-image">
              <img
                src={details.signatureImage}
                alt={`Assinatura de ${details.signerName ?? "cliente"}`}
              />
              <figcaption>Assinatura desenhada pelo cliente</figcaption>
            </figure>
          )}
          <h3>Visualizações ({details.viewCount})</h3>
          {details.views.length === 0 ? (
            <EmptyState
              title="Nenhuma visualização"
              copy="O registro aparece quando o cliente abrir o link."
            />
          ) : (
            <ul className="signature-views">
              {[...details.views].reverse().map((view) => (
                <li key={view.viewedAt}>
                  <strong>{when(view.viewedAt)}</strong>
                  <span>
                    {[view.ipAddress, view.userAgent]
                      .filter(Boolean)
                      .join(" · ") || "Sem dados do acesso"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Fechar
            </button>
            {details.signedAt && (
              <button
                type="button"
                className="primary-button"
                onClick={() => setViewing(true)}
              >
                Ver contrato assinado
              </button>
            )}
          </div>
        </div>
      )}
      {viewing && details && (
        <SignedDocumentModal
          document={document}
          details={details}
          onClose={() => setViewing(false)}
        />
      )}
    </Modal>
  );
}

/** PDF do documento com a assinatura do cliente (imagem, nome, data, IP e hash) no fim. */
export function SignedDocumentModal({
  document,
  details: loaded,
  onClose,
}: {
  document: IssuedDocument;
  details?: DocumentSignatureLinkDetails;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<DocumentSignatureLinkDetails | null>(
    loaded ?? null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    if (loaded) return;
    let active = true;
    api
      .documentSignatureLink(document.id)
      .then((data) => active && setDetails(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [loaded, document.id]);
  const signature = useMemo<DocumentPdfSignature | undefined>(
    () =>
      details?.signedAt && details.signerName
        ? {
            signerName: details.signerName,
            signedAt: details.signedAt,
            signerCpf: details.signerCpf,
            signatureImage: details.signatureImage,
            ipAddress: details.signerIpAddress,
            documentSha256: details.documentSha256,
          }
        : undefined,
    [details],
  );
  return (
    <Modal
      eyebrow="Contratos"
      title="Contrato assinado"
      subtitle={`${document.title} · ${document.patientName}`}
      wide
      onClose={onClose}
    >
      <div className="receipt-content">
        {error ? (
          <ErrorBanner error={error} />
        ) : !details ? (
          <LoadingBlock />
        ) : !signature ? (
          <EmptyState
            title="Ainda não assinado"
            copy="O contrato assinado aparece aqui quando o cliente assinar pelo link."
          />
        ) : (
          <DocumentPdfPreview
            title={document.title}
            body={document.snapshotBody}
            content={document.snapshotContent}
            branding={document.branding}
            signature={signature}
          />
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}
