import type { MessageTemplate } from "@crm/contracts";
import { Images, MessageSquareText, Plus, Search, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../api";
import { useAuthorization } from "../../../authorization-context";
import { ActionMenu } from "../../../shared/components/ActionMenu";
import { EmptyState } from "../../../shared/components/EmptyState";
import { ErrorBanner } from "../../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../../shared/components/LoadingBlock";
import { useToast } from "../../../shared/feedback/toast-context";
import { shortDate } from "../../../shared/lib/formatting";
import { loadTemplateImage, useTemplateImages } from "./images";
import type { TemplateDraft } from "./model";
import { TemplateEditorModal } from "./TemplateEditorModal";
import { WhatsappText } from "./WhatsappBubble";

type Editing =
  | { mode: "create"; initial?: TemplateDraft }
  | { mode: "edit"; template: MessageTemplate };

function TemplateCard({
  template,
  canManage,
  canSend,
  onEdit,
  onDuplicate,
  onArchive,
  onUse,
}: {
  template: MessageTemplate;
  canManage: boolean;
  canSend: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onUse: () => void;
}) {
  const cover = template.images[0];
  const { images } = useTemplateImages(cover ? [cover.id] : []);
  const coverUrl = cover ? images[cover.id] : undefined;
  return (
    <article
      className={`template-card ${template.archivedAt ? "archived" : ""}`}
    >
      <div className="template-card-cover">
        {coverUrl ? (
          <img src={coverUrl} alt="" />
        ) : (
          <span className="template-card-cover-icon" aria-hidden="true">
            <MessageSquareText size={28} />
          </span>
        )}
        {template.images.length > 0 && (
          <span className="template-card-count">
            <Images size={13} aria-hidden="true" />
            {template.images.length}{" "}
            {template.images.length === 1 ? "imagem" : "imagens"}
          </span>
        )}
      </div>
      <div className="template-card-body">
        <div className="template-card-title">
          <h3>{template.title}</h3>
          {canManage && (
            <ActionMenu
              label={`Mais ações da mensagem ${template.title}`}
              iconOnly
              align="end"
              items={[
                { label: "Editar", onSelect: onEdit },
                { label: "Duplicar", onSelect: onDuplicate },
                {
                  label: template.archivedAt ? "Reativar" : "Arquivar",
                  onSelect: onArchive,
                },
              ]}
            />
          )}
        </div>
        <p className="template-card-text">
          <WhatsappText text={template.body} codes />
        </p>
        <div className="template-card-foot">
          <small>
            {template.archivedAt
              ? `Arquivada em ${shortDate.format(new Date(template.archivedAt))}`
              : `Atualizada em ${shortDate.format(new Date(template.updatedAt))}`}
          </small>
          {canSend && !template.archivedAt && (
            <button
              type="button"
              className="secondary-button button-sm"
              onClick={onUse}
            >
              <Send size={15} aria-hidden="true" />
              Usar em campanha
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Aba "Mensagens padrão": o acervo de textos e imagens prontos para as campanhas. */
export function TemplatesTab({
  onUseTemplate,
}: {
  onUseTemplate: (template: MessageTemplate) => void;
}) {
  const { can, canEdit } = useAuthorization();
  const toast = useToast();
  const canManage =
    canEdit("communications") && can("communications.templates");
  const canSend = canEdit("communications") && can("communications.campaigns");
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);

  useEffect(() => {
    let active = true;
    api
      .messageTemplates()
      .then((data) => active && setTemplates(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);

  function upsert(template: MessageTemplate) {
    setTemplates((current) => [
      template,
      ...(current ?? []).filter((item) => item.id !== template.id),
    ]);
  }

  async function duplicate(template: MessageTemplate) {
    setError("");
    try {
      const images = await Promise.all(
        template.images.map((image) => loadTemplateImage(image.id)),
      );
      setEditing({
        mode: "create",
        initial: {
          title: `Cópia de ${template.title}`.slice(0, 80),
          body: template.body,
          images: images.map((image) => ({
            key: crypto.randomUUID(),
            fileName: image.fileName,
            sizeBytes: image.sizeBytes,
            dataUrl: image.dataUrl,
          })),
        },
      });
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function toggleArchive(template: MessageTemplate) {
    setError("");
    try {
      const updated = await api.archiveMessageTemplate(
        template.id,
        !template.archivedAt,
      );
      upsert(updated);
      toast.success(
        updated.archivedAt
          ? "Mensagem arquivada. Campanhas já criadas continuam iguais."
          : "Mensagem reativada.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const archivedCount =
    templates?.filter((template) => template.archivedAt).length ?? 0;
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const visible = (templates ?? []).filter(
    (template) =>
      Boolean(template.archivedAt) === showArchived &&
      (!term ||
        template.title.toLocaleLowerCase("pt-BR").includes(term) ||
        template.body.toLocaleLowerCase("pt-BR").includes(term)),
  );

  return (
    <section className="panel campaign-panel" aria-label="Mensagens padrão">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Acervo</span>
          <h2>Mensagens padrão</h2>
        </div>
        {canManage && (
          <button
            type="button"
            className="primary-button"
            onClick={() => setEditing({ mode: "create" })}
          >
            <Plus size={17} aria-hidden="true" />
            Nova mensagem
          </button>
        )}
      </div>
      {error && (
        <div className="campaign-panel-body">
          <ErrorBanner error={error} />
        </div>
      )}
      {!templates && !error ? (
        <LoadingBlock />
      ) : templates && templates.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="Crie sua primeira mensagem padrão"
          copy="Monte textos com {{nome}} e até 3 imagens. Depois é só escolher a mensagem e enviar para cada cliente."
          action={
            canManage ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => setEditing({ mode: "create" })}
              >
                <Plus size={17} aria-hidden="true" />
                Nova mensagem
              </button>
            ) : undefined
          }
        />
      ) : templates ? (
        <>
          <div className="list-toolbar template-toolbar-row">
            <label className="campaign-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar mensagem"
                placeholder="Buscar por título ou texto"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div
              className="campaign-segmented"
              role="group"
              aria-label="Situação das mensagens"
            >
              <button
                type="button"
                className="text-button"
                aria-pressed={!showArchived}
                onClick={() => setShowArchived(false)}
              >
                Ativas
              </button>
              <button
                type="button"
                className="text-button"
                aria-pressed={showArchived}
                onClick={() => setShowArchived(true)}
              >
                Arquivadas ({archivedCount})
              </button>
            </div>
          </div>
          {visible.length === 0 ? (
            <EmptyState
              icon={Search}
              title={
                showArchived
                  ? "Nenhuma mensagem arquivada"
                  : "Nenhuma mensagem encontrada"
              }
              copy={
                term
                  ? "Tente outro termo de busca."
                  : "As mensagens arquivadas aparecem aqui."
              }
            />
          ) : (
            <div className="template-grid">
              {visible.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  canManage={canManage}
                  canSend={canSend}
                  onEdit={() => setEditing({ mode: "edit", template })}
                  onDuplicate={() => void duplicate(template)}
                  onArchive={() => void toggleArchive(template)}
                  onUse={() => onUseTemplate(template)}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
      {editing && (
        <TemplateEditorModal
          template={editing.mode === "edit" ? editing.template : undefined}
          initial={editing.mode === "create" ? editing.initial : undefined}
          onClose={() => setEditing(null)}
          onSaved={(template) => {
            upsert(template);
            setShowArchived(Boolean(template.archivedAt));
            setEditing(null);
            toast.success("Mensagem padrão salva.");
          }}
        />
      )}
    </section>
  );
}
