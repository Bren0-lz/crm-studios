import {
  documentSignatureMessage,
  type DocumentSignatureLinkShare,
  type IssuedDocument,
} from "@crm/contracts";
import { Copy, MessageCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { sentence, shortDate } from "../../shared/lib/formatting";
import { signatureLinkUrl, signatureWhatsappLink } from "./model";
import type {
  SignatureRequest,
  SignatureTemplatesState,
} from "./signature-request";

/**
 * Campo do cadastro (plano, atendimento…): escolhe o modelo que o cliente vai assinar.
 * Depois de salvar, o modal mostra o link pronto para o WhatsApp (`SignatureSendStep`).
 */
export function SignatureTemplateField({
  state,
  value,
  onChange,
  disabled = false,
  signer = "cliente",
}: {
  state: SignatureTemplatesState;
  value: SignatureRequest | null;
  onChange: (value: SignatureRequest | null) => void;
  disabled?: boolean;
  /** Quem assina, no rótulo do campo. */
  signer?: "cliente" | "fornecedor";
}) {
  const hintId = useId();
  const templates = state.templates ?? [];
  return (
    <div className="span-2">
      <label>
        Documento para o {signer} assinar
        <select
          aria-describedby={hintId}
          disabled={disabled || !state.templates || templates.length === 0}
          value={value?.templateId ?? ""}
          onChange={(event) => {
            const template = templates.find(
              (item) => item.id === event.target.value,
            );
            onChange(
              template
                ? { templateId: template.id, title: template.name }
                : null,
            );
          }}
        >
          <option value="">
            {state.templates ? "Não enviar documento" : "Carregando modelos…"}
          </option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} · v{template.version}
            </option>
          ))}
        </select>
      </label>
      <span className="field-hint" id={hintId}>
        {state.error
          ? `Não foi possível carregar os modelos: ${state.error}`
          : state.templates && templates.length === 0
            ? "Nenhum modelo ativo. Crie um em Contratos para enviar com o cadastro."
            : "Ao salvar, o documento é emitido e o link de assinatura abre pronto para enviar pelo WhatsApp."}
      </span>
    </div>
  );
}

/**
 * Etapa final do cadastro: emite o documento (se preciso), gera o link e mostra a
 * mensagem do WhatsApp. O registro já está salvo; uma falha aqui só afeta o envio.
 */
export function SignatureSendStep({
  prepare,
  onBusyChange,
  onDone,
}: {
  /** Devolve o documento já emitido. Chamado uma vez, mesmo ao tentar de novo. */
  prepare: () => Promise<IssuedDocument>;
  onBusyChange?: (busy: boolean) => void;
  onDone: () => void;
}) {
  const [share, setShare] = useState<DocumentSignatureLinkShare | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const issued = useRef<IssuedDocument | null>(null);
  const job = useRef<Promise<DocumentSignatureLinkShare> | null>(null);
  const prepareRef = useRef(prepare);
  const busyRef = useRef(onBusyChange);
  useEffect(() => {
    prepareRef.current = prepare;
    busyRef.current = onBusyChange;
  });
  useEffect(() => {
    let active = true;
    // O mesmo pedido serve às duas execuções do efeito (StrictMode): um documento só.
    job.current ??= (async () => {
      issued.current ??= await prepareRef.current();
      return api.createDocumentSignatureLink(issued.current.id);
    })();
    busyRef.current?.(true);
    job.current
      .then((result) => active && setShare(result))
      .catch((cause: Error) => {
        job.current = null;
        if (active) setError(cause.message);
      })
      .finally(() => active && busyRef.current?.(false));
    return () => {
      active = false;
    };
  }, [attempt]);
  if (share) return <SignatureShare share={share} onDone={onDone} />;
  if (error)
    return (
      <div className="clinical-form">
        <ErrorBanner
          error={`O cadastro foi salvo, mas o link de assinatura não foi gerado. ${error}`}
        />
        <p className="muted-copy">
          Tente de novo ou envie depois pela tela Contratos.
        </p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onDone}>
            Concluir
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  return <LoadingBlock />;
}

/** Mensagem, link e botões de copiar/abrir o WhatsApp do link de assinatura. */
export function SignatureShare({
  share,
  onDone,
}: {
  share: DocumentSignatureLinkShare;
  onDone?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const link = signatureLinkUrl(share.token);
  const signer = share.document.supplierId ? "fornecedor" : "cliente";
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setError("");
    } catch {
      setError(
        "Não foi possível copiar. Selecione o link e copie manualmente.",
      );
    }
  }
  return (
    <div className="clinical-form signature-share">
      {error && <ErrorBanner error={error} />}
      <label>
        Mensagem
        <textarea
          readOnly
          rows={6}
          value={documentSignatureMessage({
            patientName: share.document.patientName,
            clinicName: share.clinicName,
            link,
            supplier: Boolean(share.document.supplierId),
          })}
        />
      </label>
      <label>
        Link de assinatura
        <input
          readOnly
          value={link}
          onFocus={(event) => event.target.select()}
        />
      </label>
      <p className="muted-copy">
        {share.patientPhone
          ? `O WhatsApp abre na conversa do ${signer} com a mensagem pronta.`
          : `O ${signer} não tem telefone no cadastro: o WhatsApp vai pedir o contato.`}{" "}
        {share.document.signatureLink &&
          !share.document.signatureLink.signedAt &&
          `${sentence(`O link vale até ${shortDate.format(new Date(share.document.signatureLink.expiresAt))}`)} `}
        A visualização e a assinatura ficam registradas no documento.
      </p>
      <div className="modal-actions">
        {onDone && (
          <button type="button" className="secondary-button" onClick={onDone}>
            Concluir
          </button>
        )}
        <button
          type="button"
          className="secondary-button"
          onClick={() => void copy()}
        >
          <Copy size={15} aria-hidden="true" />
          {copied ? "Link copiado" : "Copiar link"}
        </button>
        <a
          className="whatsapp-button"
          href={signatureWhatsappLink(share)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={15} aria-hidden="true" />
          Abrir WhatsApp
        </a>
      </div>
    </div>
  );
}
