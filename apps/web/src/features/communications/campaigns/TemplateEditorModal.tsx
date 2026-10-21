import {
  fillCampaignMessage,
  MESSAGE_TEMPLATE_IMAGE_MAX_BYTES,
  MESSAGE_TEMPLATE_MAX_IMAGES,
  messageVariables,
  type MessageTemplate,
  type MessageTemplateInput,
} from "@crm/contracts";
import {
  ArrowLeft,
  ArrowRight,
  Bold,
  ImagePlus,
  Italic,
  Strikethrough,
  UserRound,
  X,
} from "lucide-react";
import { useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import { api } from "../../../api";
import { Modal, ModalCancelButton } from "../../../shared/components/Modal";
import { useFormDirty } from "../../../shared/workflows/useDirtyGuard";
import { useTemplateImages } from "./images";
import {
  formatBytes,
  insertAtSelection,
  templateDraft,
  wrapSelection,
  type EditorImage,
  type TemplateDraft,
} from "./model";
import { WhatsappBubble } from "./WhatsappBubble";

const acceptedTypes = ["image/png", "image/jpeg", "image/webp"];
const exampleName = messageVariables[1].example;

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error(`Não foi possível ler ${file.name}.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Editor da mensagem padrão: texto com códigos, até 3 imagens e prévia ao vivo. */
export function TemplateEditorModal({
  template,
  initial,
  onClose,
  onSaved,
}: {
  /** Mensagem em edição; sem ela, cria uma nova (a partir de `initial`, se houver). */
  template?: MessageTemplate | undefined;
  initial?: TemplateDraft | undefined;
  onClose: () => void;
  onSaved: (template: MessageTemplate) => void;
}) {
  const formId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<TemplateDraft>(
    () => initial ?? templateDraft(template),
  );
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  const dirty = useFormDirty(draft);
  const saved = useTemplateImages(
    draft.images.flatMap((image) => ("id" in image ? [image.id] : [])),
  );
  const remaining = MESSAGE_TEMPLATE_MAX_IMAGES - draft.images.length;

  function setBody(body: string, selection?: [number, number]) {
    setDraft((current) => ({ ...current, body }));
    if (!selection) return;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(...selection);
    });
  }

  function insertCode(code: string) {
    const element = textareaRef.current;
    const next = insertAtSelection(
      draft.body,
      code,
      element?.selectionStart ?? draft.body.length,
      element?.selectionEnd ?? draft.body.length,
    );
    setBody(next.text, [next.cursor, next.cursor]);
  }

  function format(marker: string) {
    const element = textareaRef.current;
    const next = wrapSelection(
      draft.body,
      marker,
      element?.selectionStart ?? draft.body.length,
      element?.selectionEnd ?? draft.body.length,
    );
    setBody(next.text, [next.selectionStart, next.selectionEnd]);
  }

  async function addFiles(files: File[]) {
    setImageError("");
    if (files.length > remaining) {
      setImageError(
        `Cada mensagem pode ter até ${MESSAGE_TEMPLATE_MAX_IMAGES} imagens.`,
      );
      files = files.slice(0, Math.max(0, remaining));
    }
    const added: EditorImage[] = [];
    for (const file of files) {
      if (!acceptedTypes.includes(file.type)) {
        setImageError(`${file.name}: envie uma imagem PNG, JPEG ou WebP.`);
        continue;
      }
      if (file.size > MESSAGE_TEMPLATE_IMAGE_MAX_BYTES) {
        setImageError(
          `${file.name} tem ${formatBytes(file.size)}; o limite é 2 MB.`,
        );
        continue;
      }
      try {
        added.push({
          key: crypto.randomUUID(),
          fileName: file.name,
          sizeBytes: file.size,
          dataUrl: await readDataUrl(file),
        });
      } catch (cause) {
        setImageError((cause as Error).message);
      }
    }
    if (added.length)
      setDraft((current) => ({
        ...current,
        images: [...current.images, ...added].slice(
          0,
          MESSAGE_TEMPLATE_MAX_IMAGES,
        ),
      }));
  }

  function moveImage(index: number, offset: -1 | 1) {
    setDraft((current) => {
      const images = [...current.images];
      const [image] = images.splice(index, 1);
      images.splice(index + offset, 0, image!);
      return { ...current, images };
    });
  }

  function removeImage(key: string) {
    setImageError("");
    setDraft((current) => ({
      ...current,
      images: current.images.filter((image) => image.key !== key),
    }));
  }

  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    void addFiles([...event.dataTransfer.files]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const input: MessageTemplateInput = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      images: draft.images.map((image) =>
        "id" in image
          ? { id: image.id }
          : { fileName: image.fileName, dataUrl: image.dataUrl },
      ),
    };
    try {
      onSaved(
        template
          ? await api.updateMessageTemplate(template.id, input)
          : await api.createMessageTemplate(input),
      );
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }

  const previewImages = draft.images.map((image) => ({
    key: image.key,
    fileName: image.fileName,
    dataUrl: "id" in image ? (saved.images[image.id] ?? null) : image.dataUrl,
  }));
  const missing = !draft.title.trim() || !draft.body.trim();

  return (
    <Modal
      wide
      className="template-editor-modal"
      eyebrow="Acervo de mensagens"
      title={template ? "Editar mensagem padrão" : "Nova mensagem padrão"}
      subtitle="Use os códigos para personalizar: cada cliente recebe com o próprio nome."
      busy={saving}
      dirty={dirty}
      initialFocus="input[name='template-title']"
      onClose={onClose}
    >
      <form id={formId} className="template-editor" onSubmit={submit}>
        <div className="template-editor-fields">
          <label>
            Título (só a equipe vê)
            <input
              name="template-title"
              required
              maxLength={80}
              value={draft.title}
              placeholder="Ex.: Promoção de Pilates de novembro"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
          <div className="template-body-field">
            <label htmlFor={`${formId}-body`}>Mensagem</label>
            <div
              className="template-toolbar"
              role="toolbar"
              aria-label="Personalizar mensagem"
            >
              {messageVariables.map((variable) => (
                <button
                  key={variable.code}
                  type="button"
                  className="variable-chip"
                  onClick={() => insertCode(variable.code)}
                  title={`Insere ${variable.code}: vira "${variable.example}" na mensagem`}
                >
                  <UserRound size={14} aria-hidden="true" />
                  Inserir {variable.label.toLowerCase()}
                </button>
              ))}
              <span className="template-toolbar-divider" aria-hidden="true" />
              <button
                type="button"
                className="icon-button format-button"
                aria-label="Negrito"
                title="Negrito (*texto*)"
                onClick={() => format("*")}
              >
                <Bold size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button format-button"
                aria-label="Itálico"
                title="Itálico (_texto_)"
                onClick={() => format("_")}
              >
                <Italic size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button format-button"
                aria-label="Riscado"
                title="Riscado (~texto~)"
                onClick={() => format("~")}
              >
                <Strikethrough size={15} aria-hidden="true" />
              </button>
            </div>
            <textarea
              id={`${formId}-body`}
              ref={textareaRef}
              required
              rows={8}
              maxLength={1000}
              value={draft.body}
              placeholder={
                "Olá, {{nome}}! Tudo bem?\nTemos uma novidade especial para você…"
              }
              onChange={(event) => setBody(event.target.value)}
            />
            <span className="field-hint template-counter">
              {draft.body.length}/1000
            </span>
          </div>
          <div className="template-images-field">
            <span className="filter-label">
              Imagens ({draft.images.length}/{MESSAGE_TEMPLATE_MAX_IMAGES})
            </span>
            <ul className="template-image-list">
              {draft.images.map((image, index) => {
                const src = previewImages[index]?.dataUrl;
                return (
                  <li key={image.key} className="template-image-item">
                    {src ? (
                      <img src={src} alt={image.fileName} />
                    ) : (
                      <span
                        className="wa-image-placeholder"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className="template-image-name"
                      title={image.fileName}
                    >
                      {image.fileName}
                      <small>{formatBytes(image.sizeBytes)}</small>
                    </span>
                    <span className="template-image-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Mover ${image.fileName} para a esquerda`}
                        disabled={index === 0}
                        onClick={() => moveImage(index, -1)}
                      >
                        <ArrowLeft size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Mover ${image.fileName} para a direita`}
                        disabled={index === draft.images.length - 1}
                        onClick={() => moveImage(index, 1)}
                      >
                        <ArrowRight size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remover ${image.fileName}`}
                        onClick={() => removeImage(image.key)}
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    </span>
                  </li>
                );
              })}
              {remaining > 0 && (
                <li>
                  <label
                    className={`image-dropzone ${dragging ? "dragging" : ""}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={drop}
                  >
                    <ImagePlus size={22} aria-hidden="true" />
                    <strong>Adicionar imagem</strong>
                    <small>
                      Arraste ou clique · PNG, JPEG ou WebP até 2 MB
                    </small>
                    <input
                      ref={fileRef}
                      type="file"
                      className="sr-only"
                      accept={acceptedTypes.join(",")}
                      multiple
                      aria-label="Escolher imagens"
                      onChange={(event) => {
                        void addFiles([...(event.target.files ?? [])]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </li>
              )}
            </ul>
            {(imageError || saved.error) && (
              <p className="form-error" role="alert">
                {imageError || saved.error}
              </p>
            )}
          </div>
        </div>
        <aside className="template-editor-preview">
          <span className="filter-label">Como {exampleName} vai receber</span>
          <WhatsappBubble
            contactName={exampleName}
            text={fillCampaignMessage(draft.body, exampleName)}
            images={previewImages}
          />
        </aside>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
        <button
          className="primary-button"
          type="submit"
          form={formId}
          disabled={saving || missing}
        >
          {saving ? "Salvando…" : "Salvar mensagem"}
        </button>
      </div>
    </Modal>
  );
}
