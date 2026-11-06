import type { PublicSignatureDocument } from "@crm/contracts";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiClientError } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { DocumentPaper } from "./DocumentPaper";
import { signatureMoment } from "./model";
import {
  PublicSignatureForm,
  PublicSignatureShell,
} from "./PublicSignatureLayout";

/** Página aberta pelo cliente no link enviado pelo WhatsApp: lê o documento e assina. */
export function PublicSignaturePage() {
  const { token = "" } = useParams();
  const [document, setDocument] = useState<PublicSignatureDocument | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .publicSignatureDocument(token)
      .then((data) => {
        if (active) setDocument(data);
      })
      .catch((cause: Error) => {
        if (!active) return;
        setLoadError(cause.message);
        setExpired(
          cause instanceof ApiClientError &&
            cause.code === "DOCUMENT_SIGNATURE_LINK_EXPIRED",
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <PublicSignatureShell
      loading={loading}
      unavailable={
        document
          ? null
          : {
              title: expired ? "Link expirado" : "Link indisponível",
              copy:
                loadError ||
                "Confira se o link foi copiado por inteiro ou peça um novo à clínica.",
            }
      }
    >
      {document && (
        <section className="panel public-signature">
          <div className="panel-head">
            <div>
              <h2>{document.title}</h2>
              <p className="panel-context">
                {document.clinicName} · {document.patientName}
              </p>
            </div>
          </div>
          <div className="public-signature-document">
            <DocumentPaper
              body={document.snapshotBody}
              content={document.snapshotContent}
              branding={document.branding}
            />
          </div>
          <div className="public-signature-form">
            {document.status === "signed" ? (
              <div className="success-banner" role="status">
                Documento assinado por {document.signerName}
                {document.signedAt
                  ? ` em ${signatureMoment(document.signedAt)}`
                  : ""}
                . Código do documento: {document.documentSha256.slice(0, 16)}.
              </div>
            ) : document.status === "cancelled" ? (
              <ErrorBanner error="Este documento foi cancelado pela clínica e não pode mais ser assinado." />
            ) : (
              <PublicSignatureForm
                requireCpf
                initialName={document.patientName}
                acceptLabel="Li o documento e concordo com os seus termos."
                submitLabel="Assinar documento"
                footnote="Ao assinar, registramos data, hora, IP e navegador junto com o código do documento."
                onSign={async (input) =>
                  setDocument(await api.signPublicDocument(token, input))
                }
              />
            )}
          </div>
        </section>
      )}
    </PublicSignatureShell>
  );
}
