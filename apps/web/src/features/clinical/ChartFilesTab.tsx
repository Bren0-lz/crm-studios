import type { ClinicalAttachment } from "@crm/contracts";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Image as ImageIcon,
  Paperclip,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { Modal } from "../../shared/components/Modal";
import { shortDate } from "../../shared/lib/formatting";
import { ClinicalAudioPlayer } from "./ClinicalAudioPlayer";

/** Miniaturas carregadas de uma vez; acima disso, a galeria pede "Carregar mais". */
const THUMBNAIL_BATCH = 12;

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

export function ChartFilesTab({
  attachments,
  canAttach,
  onAttach,
}: {
  attachments: ClinicalAttachment[];
  canAttach: boolean;
  onAttach: () => void;
}) {
  const { can } = useAuthorization();
  const canRead = can("clinical.attachments_read");
  const images = attachments.filter((item) =>
    item.mimeType.startsWith("image/"),
  );
  const others = attachments.filter(
    (item) => !item.mimeType.startsWith("image/"),
  );
  const [limit, setLimit] = useState(THUMBNAIL_BATCH);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<number | null>(null);
  const [error, setError] = useState("");

  const wanted = canRead
    ? images.slice(0, limit).filter((item) => !(item.id in sources))
    : [];
  const wantedKey = wanted.map((item) => item.id).join(",");
  useEffect(() => {
    if (!wantedKey) return;
    let active = true;
    Promise.all(
      wantedKey.split(",").map(async (id) => {
        const content = await api.clinicalAttachmentContent(id);
        return [
          id,
          `data:${content.mimeType};base64,${content.contentBase64}`,
        ] as const;
      }),
    )
      .then((loaded) => {
        if (active)
          setSources((current) => ({
            ...current,
            ...Object.fromEntries(loaded),
          }));
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [wantedKey]);

  async function download(attachment: ClinicalAttachment) {
    setError("");
    try {
      const href: string =
        sources[attachment.id] ??
        (await api
          .clinicalAttachmentContent(attachment.id)
          .then(
            (content) =>
              `data:${content.mimeType};base64,${content.contentBase64}`,
          ));
      const link = document.createElement("a");
      link.href = href;
      link.download = attachment.fileName;
      link.click();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const viewed = viewing === null ? undefined : images[viewing];

  return (
    <div className="chart-tab chart-files">
      <div className="chart-tab-toolbar">
        <p className="panel-context">
          {attachments.length === 0
            ? "Exames, laudos, fotos e áudios do cliente."
            : `${images.length} ${images.length === 1 ? "imagem" : "imagens"} · ${others.length} ${others.length === 1 ? "documento" : "documentos"}`}
        </p>
        {canAttach && (
          <button type="button" className="secondary-button" onClick={onAttach}>
            <Paperclip size={16} /> Anexar arquivo
          </button>
        )}
      </div>
      {error && <ErrorBanner error={error} />}
      {attachments.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="Nenhum arquivo no prontuário"
          copy="Guarde exames, laudos e fotos de acompanhamento junto do histórico."
        />
      ) : (
        <>
          {images.length > 0 && (
            <section aria-label="Imagens" className="chart-gallery">
              {images.slice(0, limit).map((image, index) => (
                <button
                  type="button"
                  key={image.id}
                  className="chart-gallery-item"
                  disabled={!canRead}
                  onClick={() => setViewing(index)}
                  aria-label={`Ver ${image.fileName}`}
                >
                  {sources[image.id] ? (
                    <img src={sources[image.id]} alt="" />
                  ) : (
                    <span className="chart-gallery-placeholder">
                      <ImageIcon size={24} />
                    </span>
                  )}
                  <span className="chart-gallery-caption">
                    <strong>{image.fileName}</strong>
                    <small>{shortDate.format(new Date(image.createdAt))}</small>
                  </span>
                </button>
              ))}
              {images.length > limit && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setLimit(limit + THUMBNAIL_BATCH)}
                >
                  Carregar mais imagens
                </button>
              )}
            </section>
          )}
          {others.length > 0 && (
            <ul className="chart-file-list" aria-label="Documentos e áudios">
              {others.map((attachment) => (
                <li key={attachment.id}>
                  <span className="chart-file-icon" aria-hidden="true">
                    <FileText size={18} />
                  </span>
                  <div>
                    <strong>{attachment.fileName}</strong>
                    <small>
                      {sizeLabel(attachment.sizeInBytes)} ·{" "}
                      {shortDate.format(new Date(attachment.createdAt))} ·{" "}
                      {attachment.authorName}
                    </small>
                    {attachment.notes && <p>{attachment.notes}</p>}
                  </div>
                  {attachment.mimeType.startsWith("audio/") && canRead && (
                    <ClinicalAudioPlayer attachmentId={attachment.id} />
                  )}
                  {canRead && (
                    <button
                      type="button"
                      className="text-button button-sm"
                      onClick={() => void download(attachment)}
                    >
                      Baixar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {viewed && viewing !== null && (
        <Modal
          title={viewed.fileName}
          subtitle={`${shortDate.format(new Date(viewed.createdAt))} · ${viewed.authorName}${viewed.notes ? ` · ${viewed.notes}` : ""}`}
          wide
          onClose={() => setViewing(null)}
        >
          <div className="chart-image-viewer">
            {sources[viewed.id] ? (
              <img src={sources[viewed.id]} alt={viewed.fileName} />
            ) : (
              <span className="chart-gallery-placeholder">
                <ImageIcon size={32} />
              </span>
            )}
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={viewing === 0}
              onClick={() => setViewing(viewing - 1)}
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={viewing >= Math.min(images.length, limit) - 1}
              onClick={() => setViewing(viewing + 1)}
            >
              Próxima <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void download(viewed)}
            >
              <Download size={16} /> Baixar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
