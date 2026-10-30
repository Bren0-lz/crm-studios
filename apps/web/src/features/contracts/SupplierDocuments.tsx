import type { IssuedDocument } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { SignatureLinkRecord } from "./SignatureLinkRecord";

/** Documentos do fornecedor com a situação da assinatura e o PDF assinado. */
export function SupplierDocuments({ supplierId }: { supplierId: string }) {
  const [documents, setDocuments] = useState<IssuedDocument[] | null>(null);
  const [error, setError] = useState("");
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
          {item.status === "cancelled" && (
            <div className="patient-tab-item-side">
              <span className="status-pill cancelled">Cancelado</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
