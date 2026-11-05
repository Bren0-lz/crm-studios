import type { PublicReceiptSignature } from "@crm/contracts";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { currency, shortDate } from "../../shared/lib/formatting";
import {
  PublicSignatureForm,
  PublicSignatureShell,
  signatureMoment,
} from "../contracts";
import { ReceiptContent } from "./ReceiptContent";

const money = (cents: number) => currency.format(cents / 100);

/** Página aberta pelo cliente no link do recibo (B5-02): confere o pagamento e assina. */
export function PublicReceiptSignaturePage() {
  const { token = "" } = useParams();
  const [view, setView] = useState<PublicReceiptSignature | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .publicReceiptSignature(token)
      .then((data) => {
        if (active) setView(data);
      })
      .catch((cause: Error) => {
        if (active) setLoadError(cause.message);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const receipt = view?.receipt;
  // "Breno Assinante em 04 de nov., 14:30": quem assinou e quando (vai também na impressão).
  const signer = view
    ? `${view.signerName ?? ""}${view.signedAt ? ` em ${signatureMoment(view.signedAt)}` : ""}`
    : "";
  return (
    <PublicSignatureShell
      loading={loading}
      unavailable={
        view
          ? null
          : {
              title: "Link indisponível",
              copy:
                loadError ||
                "Confira se o link foi copiado por inteiro ou peça um novo à clínica.",
            }
      }
    >
      {view && (
        <section className="panel public-signature">
          <div className="panel-head">
            <div>
              <h2>Recibo de pagamento</h2>
              <p className="panel-context">
                {receipt
                  ? `${receipt.receiptNumber} · ${receipt.clinicName} · ${receipt.patientName}`
                  : `${money(view.amountInCents)} · pago em ${shortDate.format(new Date(view.paidAt))}`}
              </p>
            </div>
          </div>
          {receipt && (
            <div className="public-signature-document">
              <ReceiptContent receipt={receipt}>
                {view.status === "signed" && view.signatureImage && (
                  <figure className="signature-image">
                    <img
                      src={view.signatureImage}
                      alt={`Assinatura de ${view.signerName ?? "quem assinou"}`}
                    />
                    <figcaption>Assinado por {signer}</figcaption>
                  </figure>
                )}
              </ReceiptContent>
            </div>
          )}
          <div className="public-signature-form">
            {view.status === "signed" ? (
              <>
                <div className="success-banner" role="status">
                  Recibo assinado por {signer}.
                </div>
                <div className="modal-actions print-hidden">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => window.print()}
                  >
                    <Printer size={16} aria-hidden="true" />
                    Imprimir ou salvar PDF
                  </button>
                </div>
              </>
            ) : view.status === "cancelled" ? (
              <ErrorBanner error="Este recibo foi cancelado pela clínica porque o pagamento foi estornado. Ele não pode mais ser assinado." />
            ) : (
              <PublicSignatureForm
                initialName={receipt?.patientName ?? ""}
                acceptLabel="Conferi o recibo e confirmo o pagamento descrito."
                submitLabel="Assinar recibo"
                footnote="Ao assinar, registramos data, hora, IP e navegador junto com o recibo."
                onSign={async (input) =>
                  setView(await api.signPublicReceipt(token, input))
                }
              />
            )}
          </div>
        </section>
      )}
    </PublicSignatureShell>
  );
}
