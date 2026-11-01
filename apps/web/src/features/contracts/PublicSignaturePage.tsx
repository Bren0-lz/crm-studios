import {
  publicDocumentSignInputSchema,
  type PublicSignatureDocument,
} from "@crm/contracts";
import { FileSignature } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiClientError } from "../../api";
import { CpfInput } from "../../shared/components/CpfInput";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useMissingFields } from "../../shared/components/MissingFields";
import { shortDate, timeLabel } from "../../shared/lib/formatting";
import { DocumentPaper } from "./DocumentPaper";

function when(iso: string) {
  const date = new Date(iso);
  return `${shortDate.format(date)}, ${timeLabel.format(date)}`;
}

/** Área para desenhar a assinatura com o dedo, a caneta ou o mouse. */
function SignaturePad({
  disabled,
  onChange,
}: {
  disabled: boolean;
  onChange: (image: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, canvas.clientWidth * ratio);
    canvas.height = Math.max(1, canvas.clientHeight * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1f2a37";
  }, []);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const context = event.currentTarget.getContext("2d");
    const { x, y } = point(event);
    context?.beginPath();
    context?.moveTo(x, y);
    context?.lineTo(x + 0.1, y + 0.1);
    context?.stroke();
    drawing.current = true;
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    const { x, y } = point(event);
    context?.lineTo(x, y);
    context?.stroke();
  }
  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(event.currentTarget.toDataURL("image/png"));
  }
  function clear() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }
  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Área de assinatura"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <button
        type="button"
        className="secondary-button button-sm"
        disabled={disabled}
        onClick={clear}
      >
        Limpar assinatura
      </button>
    </div>
  );
}

/** Página aberta pelo cliente no link enviado pelo WhatsApp: lê o documento e assina. */
export function PublicSignaturePage() {
  const { token = "" } = useParams();
  const [document, setDocument] = useState<PublicSignatureDocument | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerCpf, setSignerCpf] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signatureImage, setSignatureImage] = useState("");

  useEffect(() => {
    let active = true;
    api
      .publicSignatureDocument(token)
      .then((data) => {
        if (!active) return;
        setDocument(data);
        setSignerName(data.patientName);
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

  const missing = useMissingFields(
    [
      signerName.trim().length < 3 && "Nome completo",
      !signatureImage && "Assinatura",
      !accepted && "Confirmação de leitura",
    ].filter((item): item is string => Boolean(item)),
    "field-hint",
  );

  async function sign() {
    const input = publicDocumentSignInputSchema.safeParse({
      signerName,
      signerCpf,
      accepted,
      signatureImage,
    });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? "Confira os dados.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setDocument(await api.signPublicDocument(token, input.data));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="public-signature-page">
      {loading ? (
        <LoadingBlock />
      ) : !document ? (
        <section className="panel">
          <EmptyState
            icon={FileSignature}
            title={expired ? "Link expirado" : "Link indisponível"}
            copy={
              loadError ||
              "Confira se o link foi copiado por inteiro ou peça um novo à clínica."
            }
          />
        </section>
      ) : (
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
                {document.signedAt ? ` em ${when(document.signedAt)}` : ""}.
                Código do documento: {document.documentSha256.slice(0, 16)}.
              </div>
            ) : document.status === "cancelled" ? (
              <ErrorBanner error="Este documento foi cancelado pela clínica e não pode mais ser assinado." />
            ) : (
              <form
                className="clinical-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sign();
                }}
              >
                <h3>Assinatura</h3>
                {error && <ErrorBanner error={error} />}
                <fieldset className="form-fields form-grid" disabled={busy}>
                  <label>
                    Nome completo
                    <input
                      required
                      minLength={3}
                      maxLength={160}
                      autoComplete="name"
                      value={signerName}
                      onChange={(event) => setSignerName(event.target.value)}
                    />
                  </label>
                  <label>
                    CPF (opcional)
                    <CpfInput value={signerCpf} onChange={setSignerCpf} />
                  </label>
                  <div className="span-2">
                    <span className="signature-pad-label">
                      Desenhe sua assinatura abaixo
                    </span>
                    <SignaturePad
                      disabled={busy}
                      onChange={setSignatureImage}
                    />
                  </div>
                  <label className="checkbox-field span-2">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(event) => setAccepted(event.target.checked)}
                    />
                    Li o documento e concordo com os seus termos.
                  </label>
                </fieldset>
                {missing.hint}
                <div className="modal-actions">
                  <button
                    className="primary-button"
                    disabled={busy || missing.blocked}
                    aria-describedby={missing.describedBy}
                  >
                    Assinar documento
                  </button>
                </div>
                <p className="muted-copy">
                  Ao assinar, registramos data, hora, IP e navegador junto com o
                  código do documento.
                </p>
              </form>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
