import type { PublicReceiptSignature } from "@crm/contracts";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { currency } from "../../shared/lib/formatting";
import {
  PublicSignatureForm,
  PublicSignatureShell,
  signatureMoment,
} from "../contracts";
import { ReceiptContent } from "./ReceiptContent";

const money = (cents: number) => currency.format(cents / 100);

/** "20 de nov." no fuso da clínica, não no do aparelho de quem abre o link. */
const clinicShortDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone,
  }).format(new Date(iso));

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

  const open = view?.status === "cancelled" ? null : view;
  const receipt = open?.receipt;
  // "Breno Assinante em 04 de nov., 14:30": quem assinou e quando (vai também na impressão).
  const signer = open
    ? `${open.signerName ?? ""}${open.signedAt ? ` em ${signatureMoment(open.signedAt, open.timezone)}` : ""}`
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
      {view?.status === "cancelled" ? (
        // Cancelado (baixa estornada): a API não devolve o recibo; só o aviso e o estúdio.
        <section className="panel public-signature">
          <div className="panel-head">
            <div>
              <h2>{view.clinicName}</h2>
            </div>
          </div>
          <div className="public-signature-form">
            <ErrorBanner error="Este recibo foi cancelado." />
          </div>
        </section>
      ) : (
        open && (
          <section className="panel public-signature">
            <div className="panel-head">
              <div>
                <h2>Recibo de pagamento</h2>
                <p className="panel-context">
                  {receipt
                    ? `${receipt.receiptNumber} · ${receipt.clinicName} · ${receipt.patientName}`
                    : `${money(open.amountInCents)} · pago em ${clinicShortDate(open.paidAt, open.timezone)}`}
                </p>
              </div>
            </div>
            {receipt && (
              <div className="public-signature-document">
                <ReceiptContent receipt={receipt}>
                  {open.status === "signed" && open.signatureImage && (
                    <figure className="signature-image">
                      <img
                        src={open.signatureImage}
                        alt={`Assinatura de ${open.signerName ?? "quem assinou"}`}
                      />
                      <figcaption>Assinado por {signer}</figcaption>
                    </figure>
                  )}
                </ReceiptContent>
              </div>
            )}
            <div className="public-signature-form">
              {open.status === "signed" ? (
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
        )
      )}
    </PublicSignatureShell>
  );
}
