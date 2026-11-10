import type { IssuedDocument } from "@crm/contracts";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { SendForSignatureModal } from "./SendForSignatureModal";
import { SignatureLinkRecord } from "./SignatureLinkRecord";
import { useCanRequestSignature } from "./signature-request";

/**
 * Documentos do fornecedor com a situação da assinatura e o PDF assinado. Documento emitido
 * e ainda não assinado pode ser reenviado pelo WhatsApp (gera outro link se o anterior venceu).
 */
export function SupplierDocuments({ supplierId }: { supplierId: string }) {
  const canSend = useCanRequestSignature();
  const [documents, setDocuments] = useState<IssuedDocument[] | null>(null);
  const [error, setError] = useState("");
  const [resending, setResending] = useState<IssuedDocument | null>(null);
  useEffect(() => {
    let active = true;
    api
      .documents()
      .then(
        (items) =>
          active &&
          setDocuments(
            items.filter(
              (item) =>
                item.supplierId === supplierId && item.status !== "draft",
            ),
          ),
      )
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [supplierId]);
  if (error) return <ErrorBanner error={error} />;
  if (!documents) return <LoadingBlock />;
  if (!documents.length)
    return (
      <p className="field-hint">Nenhum documento enviado para assinatura.</p>
    );
  return (
    <>
      <ul className="patient-tab-items">
        {documents.map((item) => (
          <li key={item.id}>
            <div className="patient-tab-item-main">
              <strong>{item.title}</strong>
              <span>{item.templateName}</span>
              {item.status === "issued" && (
                <SignatureLinkRecord document={item} />
              )}
            </div>
            {item.status === "cancelled" ? (
              <div className="patient-tab-item-side">
                <span className="status-pill cancelled">Cancelado</span>
              </div>
            ) : (
              canSend &&
              !item.signatureLink?.signedAt && (
                <div className="patient-tab-item-side">
                  <button
                    type="button"
                    className="whatsapp-button button-sm"
                    aria-label={`Reenviar ${item.title} pelo WhatsApp`}
                    onClick={() => setResending(item)}
                  >
                    <MessageCircle size={15} aria-hidden="true" />
                    WhatsApp
                  </button>
                </div>
              )
            )}
          </li>
        ))}
      </ul>
      {resending && (
        <SendForSignatureModal
          document={resending}
          templates={[]}
          patients={[]}
          plans={[]}
          onSent={(updated) =>
            setDocuments(
              (current) =>
                current?.map((item) =>
                  item.id === updated.id ? updated : item,
                ) ?? null,
            )
          }
          onClose={() => setResending(null)}
        />
      )}
    </>
  );
}
