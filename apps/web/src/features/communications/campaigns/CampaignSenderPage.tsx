import {
  campaignRecipientStatusLabels,
  formatPhone,
  whatsappLink,
  type CampaignRecipientStatus,
  type WhatsappCampaignDetail,
  type WhatsappCampaignRecipient,
} from "@crm/contracts";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  MessageCircle,
  PartyPopper,
  Search,
  Share2,
  SkipForward,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../../api";
import { useAuthorization } from "../../../authorization-context";
import { EmptyState } from "../../../shared/components/EmptyState";
import { ErrorBanner } from "../../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../../shared/components/LoadingBlock";
import { Modal } from "../../../shared/components/Modal";
import { PageHeader } from "../../../shared/components/PageHeader";
import { useToast } from "../../../shared/feedback/toast-context";
import {
  canCopyImages,
  copyImageToClipboard,
  copyText,
  downloadDataUrl,
  shareFiles,
} from "./clipboard";
import { useTemplateImages } from "./images";
import { campaignDateTime, campaignHandled, nextPendingIndex } from "./model";
import { WhatsappBubble } from "./WhatsappBubble";

type ListFilter = CampaignRecipientStatus | "all";
const filters: Array<[ListFilter, string]> = [
  ["pending", "Pendentes"],
  ["sent", "Enviadas"],
  ["skipped", "Puladas"],
  ["all", "Todas"],
];

function StatusIcon({ status }: { status: CampaignRecipientStatus }) {
  if (status === "sent")
    return (
      <CheckCircle2
        size={18}
        className="recipient-icon sent"
        aria-hidden="true"
      />
    );
  if (status === "skipped")
    return (
      <SkipForward
        size={18}
        className="recipient-icon skipped"
        aria-hidden="true"
      />
    );
  return <span className="recipient-icon pending" aria-hidden="true" />;
}

/**
 * Envio da campanha, um cliente por vez: copiar a imagem, abrir a conversa já
 * com o texto e, ao voltar para o CRM, confirmar o envio e seguir para o próximo.
 */
export function CampaignSenderPage() {
  const { campaignId = "" } = useParams();
  const { can, canEdit } = useAuthorization();
  const toast = useToast();
  const canSend = canEdit("communications") && can("communications.campaigns");
  const [campaign, setCampaign] = useState<WhatsappCampaignDetail | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filter, setFilter] = useState<ListFilter>("pending");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingReturn, setAwaitingReturn] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { images, error: imageError } = useTemplateImages(
    campaign?.images.map((image) => image.id) ?? [],
  );

  useEffect(() => {
    let active = true;
    api
      .whatsappCampaign(campaignId)
      .then((data) => {
        if (!active) return;
        setCampaign(data);
        setCurrentIndex(Math.max(0, nextPendingIndex(data.recipients)));
        if (!data.recipients.some((item) => item.status === "pending"))
          setFilter("all");
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [campaignId]);

  // Quem abriu o WhatsApp volta para a aba do CRM: aí perguntamos se enviou.
  useEffect(() => {
    if (!awaitingReturn) return;
    function onReturn() {
      if (document.visibilityState !== "visible") return;
      setAwaitingReturn(false);
      setConfirming(true);
    }
    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, [awaitingReturn]);

  if (error)
    return (
      <>
        <PageHeader
          title="Campanha"
          description="Não foi possível abrir a campanha."
          back={campaignsBack}
        />
        <ErrorBanner error={error} />
      </>
    );
  if (!campaign) return <LoadingBlock />;

  const recipient = campaign.recipients[currentIndex];
  const handled = campaignHandled(campaign);
  const pending = campaign.total - handled;
  const imageList = campaign.images.map((image) => ({
    ...image,
    dataUrl: images[image.id] ?? null,
  }));
  const readyImages = imageList.flatMap((image) =>
    image.dataUrl ? [{ dataUrl: image.dataUrl, fileName: image.fileName }] : [],
  );
  const shareable =
    readyImages.length === imageList.length && readyImages.length > 0
      ? shareFiles(readyImages)
      : null;
  // Com uma imagem só, um clique copia a imagem e abre a conversa: basta colar e enviar.
  const combinedImage =
    canSend && canCopyImages() && imageList.length === 1 && !imageError
      ? imageList[0]
      : null;
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const listed = campaign.recipients
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        (filter === "all" || item.status === filter) &&
        (!term || item.patientName.toLocaleLowerCase("pt-BR").includes(term)),
    );

  async function setStatus(
    target: WhatsappCampaignRecipient,
    status: CampaignRecipientStatus,
  ) {
    if (!campaign) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await api.setCampaignRecipientStatus(
        campaign.id,
        target.id,
        status,
      );
      const recipients = campaign.recipients.map((item) =>
        item.id === result.recipient.id ? result.recipient : item,
      );
      setCampaign({ ...result.campaign, recipients });
      setConfirming(false);
      setCopied(null);
      if (status !== "pending") {
        const next = nextPendingIndex(recipients, currentIndex);
        if (next >= 0) setCurrentIndex(next);
        toast.success(
          status === "sent"
            ? `Envio para ${target.patientName} registrado.`
            : `${target.patientName} ficou para depois.`,
        );
      }
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyImage(imageId: string, dataUrl: string) {
    setActionError("");
    try {
      await copyImageToClipboard(dataUrl);
      setCopied(imageId);
    } catch (cause) {
      setActionError((cause as Error).message);
    }
  }

  async function share() {
    if (!recipient || !shareable) return;
    try {
      await navigator.share({ files: shareable, text: recipient.message });
      setConfirming(true);
    } catch (cause) {
      if ((cause as Error).name !== "AbortError")
        setActionError((cause as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={`Mensagem “${campaign.templateTitle}” · criada em ${campaignDateTime.format(new Date(campaign.createdAt))} por ${campaign.createdByName}`}
        back={campaignsBack}
      />
      <section className="campaign-progress" aria-label="Progresso da campanha">
        <progress max={campaign.total} value={handled} aria-label="Progresso" />
        <dl>
          <div>
            <dt>Enviadas</dt>
            <dd>{campaign.sent}</dd>
          </div>
          <div>
            <dt>Puladas</dt>
            <dd>{campaign.skipped}</dd>
          </div>
          <div>
            <dt>Faltam</dt>
            <dd>{pending}</dd>
          </div>
        </dl>
      </section>
      <div className="campaign-sender">
        <section
          className="panel recipient-panel"
          aria-label="Clientes da campanha"
        >
          <div className="panel-head">
            <h2>Clientes</h2>
            <span className="list-count">{campaign.total}</span>
          </div>
          <div className="recipient-tools">
            <label className="campaign-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar cliente na campanha"
                placeholder="Buscar cliente"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div
              className="campaign-segmented compact"
              role="group"
              aria-label="Filtrar clientes"
            >
              {filters.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="text-button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {listed.length === 0 ? (
            <p className="recipient-empty">Nenhum cliente neste filtro.</p>
          ) : (
            <ul className="recipient-list">
              {listed.map(({ item, index }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`recipient-row ${item.status}`}
                    aria-current={index === currentIndex ? "true" : undefined}
                    onClick={() => {
                      setCurrentIndex(index);
                      setCopied(null);
                      setActionError("");
                    }}
                  >
                    <StatusIcon status={item.status} />
                    <span>
                      <strong>{item.patientName}</strong>
                      <small>
                        {formatPhone(item.phone)} ·{" "}
                        {campaignRecipientStatusLabels[item.status]}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel sender-card" aria-label="Envio atual">
          {campaign.completedAt && pending === 0 && (
            <div className="campaign-done" role="status">
              <PartyPopper size={28} aria-hidden="true" />
              <div>
                <strong>Campanha concluída!</strong>
                <span>
                  {campaign.sent} enviadas
                  {campaign.skipped > 0 && ` e ${campaign.skipped} puladas`}.
                  Você ainda pode reabrir um cliente pela lista.
                </span>
              </div>
            </div>
          )}
          {!recipient ? (
            <EmptyState
              icon={MessageCircle}
              title="Escolha um cliente"
              copy="Selecione alguém na lista para preparar a conversa."
            />
          ) : (
            <>
              <div className="sender-head">
                <span className="wa-avatar large" aria-hidden="true">
                  {recipient.patientName.trim().charAt(0).toUpperCase()}
                </span>
                <div>
                  <h2>{recipient.patientName}</h2>
                  <p className="panel-context">
                    Cliente {currentIndex + 1} de {campaign.total}
                  </p>
                  <span className="sender-phone">
                    {formatPhone(recipient.phone)}
                  </span>
                </div>
                <span
                  className={`status-pill ${recipient.status === "sent" ? "completed" : recipient.status === "skipped" ? "cancelled" : "in_progress"}`}
                >
                  {campaignRecipientStatusLabels[recipient.status]}
                </span>
              </div>

              <div className="sender-body">
                <div className="sender-steps">
                  {recipient.status === "pending" ? (
                    <ol>
                      {imageList.length > 0 && !combinedImage && (
                        <li>
                          <strong>Copie a imagem</strong>
                          <span className="step-hint">
                            {canCopyImages()
                              ? "Copie e cole na conversa (Ctrl+V): o texto vira a legenda."
                              : "Baixe e anexe na conversa pelo clipe do WhatsApp."}
                          </span>
                          <div className="sender-images">
                            {imageList.map((image) => (
                              <div key={image.id} className="sender-image">
                                {image.dataUrl ? (
                                  <img
                                    src={image.dataUrl}
                                    alt={image.fileName}
                                  />
                                ) : (
                                  <span
                                    className="wa-image-placeholder"
                                    aria-hidden="true"
                                  />
                                )}
                                <div className="sender-image-actions">
                                  {canCopyImages() && (
                                    <button
                                      type="button"
                                      className="secondary-button button-sm"
                                      disabled={!image.dataUrl}
                                      onClick={() =>
                                        image.dataUrl &&
                                        void copyImage(image.id, image.dataUrl)
                                      }
                                    >
                                      {copied === image.id ? (
                                        <Check size={15} aria-hidden="true" />
                                      ) : (
                                        <Copy size={15} aria-hidden="true" />
                                      )}
                                      {copied === image.id
                                        ? "Copiada"
                                        : "Copiar"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="icon-button"
                                    aria-label={`Baixar ${image.fileName}`}
                                    disabled={!image.dataUrl}
                                    onClick={() =>
                                      image.dataUrl &&
                                      downloadDataUrl(
                                        image.dataUrl,
                                        image.fileName,
                                      )
                                    }
                                  >
                                    <Download size={15} aria-hidden="true" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          {imageError && (
                            <p className="form-error">{imageError}</p>
                          )}
                        </li>
                      )}
                      <li>
                        <strong>Abra a conversa</strong>
                        <span className="step-hint">
                          {combinedImage
                            ? `A imagem é copiada e o WhatsApp abre com o texto pronto para ${recipient.patientName.split(" ")[0]}. Na conversa, cole (Ctrl+V) e envie: o texto vira a legenda.`
                            : `O WhatsApp abre com o texto pronto para ${recipient.patientName.split(" ")[0]}.`}
                        </span>
                        <div className="sender-open">
                          {combinedImage ? (
                            combinedImage.dataUrl ? (
                              <a
                                className="whatsapp-button"
                                href={whatsappLink(
                                  recipient.phone,
                                  recipient.message,
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => {
                                  // A cópia começa ainda dentro do clique, antes de a aba trocar.
                                  void copyImage(
                                    combinedImage.id,
                                    combinedImage.dataUrl ?? "",
                                  );
                                  setAwaitingReturn(true);
                                }}
                              >
                                <MessageCircle size={18} aria-hidden="true" />
                                Copiar imagem e abrir conversa
                              </a>
                            ) : (
                              <button
                                type="button"
                                className="whatsapp-button"
                                disabled
                              >
                                <MessageCircle size={18} aria-hidden="true" />
                                Preparando imagem…
                              </button>
                            )
                          ) : canSend ? (
                            <a
                              className="whatsapp-button"
                              href={whatsappLink(
                                recipient.phone,
                                recipient.message,
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setAwaitingReturn(true)}
                            >
                              <MessageCircle size={18} aria-hidden="true" />
                              Abrir conversa no WhatsApp
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() =>
                              void copyText(recipient.message)
                                .then(() => toast.success("Texto copiado."))
                                .catch((cause: Error) =>
                                  setActionError(cause.message),
                                )
                            }
                          >
                            <Copy size={16} aria-hidden="true" />
                            Copiar texto
                          </button>
                          {combinedImage?.dataUrl && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() =>
                                combinedImage.dataUrl &&
                                downloadDataUrl(
                                  combinedImage.dataUrl,
                                  combinedImage.fileName,
                                )
                              }
                            >
                              <Download size={16} aria-hidden="true" />
                              Baixar imagem
                            </button>
                          )}
                          {canSend && shareable && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => void share()}
                            >
                              <Share2 size={16} aria-hidden="true" />
                              Compartilhar imagem e texto
                            </button>
                          )}
                        </div>
                      </li>
                      {canSend && (
                        <li>
                          <strong>Confirme o envio</strong>
                          <span className="step-hint">
                            Marque depois de enviar para seguir para o próximo.
                          </span>
                          <div className="sender-confirm">
                            <button
                              type="button"
                              className="primary-button"
                              disabled={busy}
                              onClick={() => void setStatus(recipient, "sent")}
                            >
                              <Check size={16} aria-hidden="true" />
                              Marcar como enviada
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={busy}
                              onClick={() =>
                                void setStatus(recipient, "skipped")
                              }
                            >
                              <SkipForward size={16} aria-hidden="true" />
                              Pular
                            </button>
                          </div>
                        </li>
                      )}
                    </ol>
                  ) : (
                    <div className="sender-handled">
                      <p>
                        {recipient.status === "sent" ? "Enviada" : "Pulada"}
                        {recipient.handledByName &&
                          ` por ${recipient.handledByName}`}
                        {recipient.handledAt &&
                          ` em ${campaignDateTime.format(new Date(recipient.handledAt))}`}
                        .
                      </p>
                      {canSend && (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => void setStatus(recipient, "pending")}
                        >
                          <Undo2 size={16} aria-hidden="true" />
                          Voltar para pendente
                        </button>
                      )}
                    </div>
                  )}
                  {actionError && !confirming && (
                    <p className="form-error" role="alert">
                      {actionError}
                    </p>
                  )}
                </div>
                <WhatsappBubble
                  contactName={recipient.patientName}
                  text={recipient.message}
                  images={imageList.map((image) => ({
                    key: image.id,
                    fileName: image.fileName,
                    dataUrl: image.dataUrl,
                  }))}
                />
              </div>
            </>
          )}
        </section>
      </div>
      {confirming && recipient && (
        <Modal
          title={`Enviou para ${recipient.patientName}?`}
          subtitle="Confirme só se a mensagem foi enviada. O registro não confirma a entrega."
          busy={busy}
          onClose={() => setConfirming(false)}
        >
          {actionError && <ErrorBanner error={actionError} />}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Ainda não
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void setStatus(recipient, "skipped")}
            >
              Pular cliente
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void setStatus(recipient, "sent")}
            >
              Sim, enviada
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

const campaignsBack = { to: "/comunicacoes", label: "Voltar às campanhas" };
