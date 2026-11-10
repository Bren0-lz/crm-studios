import {
  publicDocumentSignInputSchema,
  isValidCpf,
  type PublicDocumentSignInput,
} from "@crm/contracts";
import { FileSignature } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CpfInput } from "../../shared/components/CpfInput";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useMissingFields } from "../../shared/components/MissingFields";
import { SignaturePad } from "./SignaturePad";

/**
 * Peças comuns das páginas abertas pelo cliente no link do WhatsApp (contrato e recibo):
 * a moldura sem login e o formulário de assinatura (nome, CPF obrigatório, desenho e aceite).
 */

/** Página pública: carregando, link indisponível ou o conteúdo. */
export function PublicSignatureShell({
  loading,
  unavailable,
  children,
}: {
  loading: boolean;
  /** Preenchido quando o link não abriu (token desconhecido, expirado…). */
  unavailable: { title: string; copy: string } | null;
  children: ReactNode;
}) {
  return (
    <main className="public-signature-page">
      {loading ? (
        <LoadingBlock />
      ) : unavailable ? (
        <section className="panel">
          <EmptyState
            icon={FileSignature}
            title={unavailable.title}
            copy={unavailable.copy}
          />
        </section>
      ) : (
        children
      )}
    </main>
  );
}

export function PublicSignatureForm({
  initialName,
  acceptLabel,
  submitLabel,
  footnote,
  onSign,
}: {
  initialName: string;
  acceptLabel: string;
  submitLabel: string;
  footnote: string;
  onSign: (input: PublicDocumentSignInput) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signerName, setSignerName] = useState(initialName);
  const [signerCpf, setSignerCpf] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signatureImage, setSignatureImage] = useState("");

  const missing = useMissingFields(
    [
      signerName.trim().length < 3 && "Nome completo",
      !isValidCpf(signerCpf) && "CPF válido de quem assina",
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
      await onSign(input.data);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
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
          CPF de quem assina
          <CpfInput value={signerCpf} onChange={setSignerCpf} required />
        </label>
        <div className="span-2">
          <span className="signature-pad-label">
            Desenhe sua assinatura abaixo
          </span>
          <SignaturePad disabled={busy} onChange={setSignatureImage} />
        </div>
        <label className="checkbox-field span-2">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          {acceptLabel}
        </label>
      </fieldset>
      {missing.hint}
      <div className="modal-actions">
        <button
          className="primary-button"
          disabled={busy || missing.blocked}
          aria-describedby={missing.describedBy}
        >
          {submitLabel}
        </button>
      </div>
      <p className="muted-copy">{footnote}</p>
    </form>
  );
}
