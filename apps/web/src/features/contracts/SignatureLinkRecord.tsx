import {
  formatCpf,
  signatureLinkExpired,
  type DocumentSignatureLinkDetails,
  type IssuedDocument,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { shortDate, timeLabel } from "../../shared/lib/formatting";

function when(iso: string) {
  const date = new Date(iso);
  return `${shortDate.format(date)}, ${timeLabel.format(date)}`;
}

/** Situação do link de assinatura enviado ao cliente: visualizações e assinatura. */
export function SignatureLinkRecord({
  document,
}: {
  document: IssuedDocument;
}) {
  const [open, setOpen] = useState(false);
  const link = document.signatureLink;
  if (!link) return null;
  return (
    <div className="signature-link-record">
      <p>
        {link.signedAt ? (
          <>
            <span className="status-pill issued">Assinado pelo link</span>{" "}
            {link.signerName} em {when(link.signedAt)}.
          </>
        ) : signatureLinkExpired(link) ? (
          <>
            <span className="status-pill expired">Link expirado</span> Venceu em{" "}
            {when(link.expiresAt)}. Envie de novo pelo WhatsApp para gerar outro
            link.
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
      <button
        type="button"
        className="secondary-button button-sm"
        onClick={() => setOpen(true)}
      >
        Ver registro
      </button>
      {open && (
        <SignatureLinkDetailsModal
          document={document}
          onClose={() => setOpen(false)}
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
          </div>
        </div>
      )}
    </Modal>
  );
}
