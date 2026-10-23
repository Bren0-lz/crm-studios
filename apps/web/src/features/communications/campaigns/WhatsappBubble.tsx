import { ImageIcon } from "lucide-react";
import { messageParts } from "./model";

/** Texto com a formatação do WhatsApp (e, se `codes`, os códigos como etiquetas). */
export function WhatsappText({
  text,
  codes = false,
}: {
  text: string;
  codes?: boolean;
}) {
  return (
    <>
      {messageParts(text, codes).map((part, index) =>
        part.kind === "code" ? (
          <mark key={index} className="message-code" title={part.text}>
            {part.label}
          </mark>
        ) : part.kind === "bold" ? (
          <strong key={index}>{part.text}</strong>
        ) : part.kind === "italic" ? (
          <em key={index}>{part.text}</em>
        ) : part.kind === "strike" ? (
          <s key={index}>{part.text}</s>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Prévia no estilo de uma conversa do WhatsApp: imagens em cima e o texto
 * (já personalizado) no balão verde, como o cliente vai ver.
 */
export function WhatsappBubble({
  text,
  images,
  contactName,
  emptyText = "Escreva a mensagem para ver a prévia.",
}: {
  text: string;
  /** Data URL de cada imagem (`null` enquanto carrega). */
  images: Array<{ key: string; dataUrl: string | null; fileName: string }>;
  contactName?: string;
  emptyText?: string;
}) {
  return (
    <figure className="wa-preview" aria-label="Prévia no WhatsApp">
      {contactName && (
        <figcaption className="wa-preview-head">
          <span className="wa-avatar" aria-hidden="true">
            {contactName.trim().charAt(0).toUpperCase()}
          </span>
          <span>
            <strong>{contactName}</strong>
            <small>WhatsApp</small>
          </span>
        </figcaption>
      )}
      <div className="wa-preview-chat">
        <div className="wa-bubble">
          {images.length > 0 && (
            <div
              className={`wa-bubble-images ${images.length > 1 ? "multiple" : ""}`}
            >
              {images.map((image) =>
                image.dataUrl ? (
                  <img
                    key={image.key}
                    src={image.dataUrl}
                    alt={image.fileName}
                  />
                ) : (
                  <span
                    key={image.key}
                    className="wa-image-placeholder"
                    role="img"
                    aria-label={`Carregando ${image.fileName}`}
                  >
                    <ImageIcon size={22} aria-hidden="true" />
                  </span>
                ),
              )}
            </div>
          )}
          <p className={text.trim() ? "" : "wa-bubble-empty"}>
            {text.trim() ? <WhatsappText text={text} /> : emptyText}
          </p>
          <span className="wa-bubble-meta" aria-hidden="true">
            agora ✓✓
          </span>
        </div>
      </div>
    </figure>
  );
}
