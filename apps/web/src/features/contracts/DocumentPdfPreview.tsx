import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentPdfInput } from "./document-pdf";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { DocumentPaper } from "./DocumentPaper";

export function DocumentPdfPreview({
  title,
  body,
  content,
  branding,
  download = false,
  onReady,
}: DocumentPdfInput & {
  download?: boolean;
  onReady?: ((ready: boolean) => void) | undefined;
}) {
  const [result, setResult] = useState({ key: "", url: "", error: "" });
  const [attempt, setAttempt] = useState(0);
  const downloaded = useRef(false);
  const key = useMemo(
    () => JSON.stringify({ title, body, content, branding, attempt }),
    [title, body, content, branding, attempt],
  );
  const url = result.key === key ? result.url : "";
  const error = result.key === key ? result.error : "";
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    Promise.resolve()
      .then(() => {
        if (active) onReady?.(false);
        return import("./document-pdf");
      })
      .then((module) =>
        module.generateDocumentPdf({ title, body, content, branding }),
      )
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ key, url: objectUrl, error: "" });
        onReady?.(true);
      })
      .catch((cause: Error) => {
        if (active)
          setResult({
            key,
            url: "",
            error: `Não foi possível gerar o PDF. ${cause.message}`,
          });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [title, body, content, branding, attempt, onReady, key]);
  const filename = `${
    title
      .replace(/[<>:"/\\|?*]/g, "-")
      .split("")
      .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
      .join("")
      .slice(0, 120) || "contrato"
  }.pdf`;
  useEffect(() => {
    if (!download || !url || downloaded.current) return;
    downloaded.current = true;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  }, [download, url, filename]);
  return (
    <div className="document-pdf-preview">
      {error ? (
        <>
          <ErrorBanner error={error} />
          <button
            className="secondary-button"
            type="button"
            onClick={() => setAttempt((current) => current + 1)}
          >
            Tentar gerar novamente
          </button>
        </>
      ) : !url ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="page-actions">
            <a
              className="secondary-button"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir PDF
            </a>
            <a className="primary-button" href={url} download={filename}>
              Salvar PDF
            </a>
          </div>
          <p className="field-hint">
            Confira o arquivo abaixo. Se ele não aparecer no celular, use “Abrir
            PDF”.
          </p>
          <iframe
            className="document-pdf-frame"
            title="Prévia do PDF"
            src={url}
          />
        </>
      )}
      <details className="document-accessible-preview">
        <summary>Ler conteúdo do documento</summary>
        <DocumentPaper body={body} content={content} branding={branding} />
      </details>
    </div>
  );
}
