import type {
  MessageTemplate,
  PatientOption,
  WhatsappCampaign,
} from "@crm/contracts";
import { ArrowRight, Megaphone, MessageSquareText, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../api";
import { useAuthorization } from "../../../authorization-context";
import { EmptyState } from "../../../shared/components/EmptyState";
import { ErrorBanner } from "../../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../../shared/components/LoadingBlock";
import {
  campaignDateTime,
  campaignHandled,
  campaignPath,
  campaignPromotionLabel,
} from "./model";
import { NewCampaignModal } from "./NewCampaignModal";

function CampaignRow({ campaign }: { campaign: WhatsappCampaign }) {
  const navigate = useNavigate();
  const handled = campaignHandled(campaign);
  const done = Boolean(campaign.completedAt);
  return (
    <li className="campaign-row">
      <div className="campaign-row-main">
        <span className="campaign-row-tags">
          <span className={`status-pill ${done ? "completed" : "in_progress"}`}>
            {done ? "Concluída" : "Em andamento"}
          </span>
          {campaign.promotion && (
            <span className="status-pill scheduled">Promocional</span>
          )}
        </span>
        <h3>{campaign.name}</h3>
        <small>
          {campaign.promotion &&
            `Promoção válida ${campaignPromotionLabel(campaign.promotion)} · `}
          {campaign.templateTitle} · criada em{" "}
          {campaignDateTime.format(new Date(campaign.createdAt))} por{" "}
          {campaign.createdByName}
        </small>
      </div>
      <div className="campaign-row-progress">
        <progress
          max={campaign.total}
          value={handled}
          aria-label={`Progresso de ${campaign.name}`}
        />
        <span className="campaign-row-numbers">
          <strong>{campaign.sent}</strong> de {campaign.total} enviadas
          {campaign.skipped > 0 && ` · ${campaign.skipped} puladas`}
        </span>
      </div>
      <button
        type="button"
        className={done ? "secondary-button" : "primary-button"}
        onClick={() => void navigate(campaignPath(campaign.id))}
        aria-label={`${done ? "Ver" : "Continuar"} campanha ${campaign.name}`}
      >
        {done ? "Ver" : "Continuar"}
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

/** Aba "Campanhas": lista com o progresso de cada envio e a criação de novas. */
export function CampaignsTab({
  templateToUse,
  onTemplateUsed,
  onOpenTemplates,
}: {
  /** Mensagem escolhida em "Usar em campanha" (abre a criação já com ela). */
  templateToUse?: MessageTemplate | null;
  onTemplateUsed: () => void;
  onOpenTemplates: () => void;
}) {
  const navigate = useNavigate();
  const { can, canEdit } = useAuthorization();
  const canSend = canEdit("communications") && can("communications.campaigns");
  const [campaigns, setCampaigns] = useState<WhatsappCampaign[] | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      api.whatsappCampaigns(),
      api.messageTemplates(),
      api.patientOptions(),
    ])
      .then(([campaignData, templateData, patientData]) => {
        if (!active) return;
        setCampaigns(campaignData);
        setTemplates(templateData);
        setPatients(patientData);
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);

  const activeTemplates = templates.filter((template) => !template.archivedAt);
  const modalOpen = creating || Boolean(templateToUse && campaigns);
  const inProgress = (campaigns ?? []).filter((item) => !item.completedAt);
  const finished = (campaigns ?? []).filter((item) => item.completedAt);
  const newButton = canSend && activeTemplates.length > 0 && (
    <button
      type="button"
      className="primary-button"
      onClick={() => setCreating(true)}
    >
      <Plus size={17} aria-hidden="true" />
      Nova campanha
    </button>
  );

  return (
    <section className="panel campaign-panel" aria-label="Campanhas">
      <div className="panel-head">
        <div>
          <h2>Campanhas</h2>
        </div>
        {newButton}
      </div>
      {error && (
        <div className="campaign-panel-body">
          <ErrorBanner error={error} />
        </div>
      )}
      {!campaigns && !error ? (
        <LoadingBlock />
      ) : !campaigns ? null : activeTemplates.length === 0 &&
        campaigns.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="Comece pelas mensagens padrão"
          copy="Cadastre o texto e as imagens da campanha em “Mensagens padrão”; depois volte aqui para escolher os clientes."
          action={
            <button
              type="button"
              className="primary-button"
              onClick={onOpenTemplates}
            >
              Ir para mensagens padrão
            </button>
          }
        />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Nenhuma campanha ainda"
          copy="Escolha uma mensagem padrão e os clientes: o sistema prepara cada conversa e acompanha quem já recebeu."
          action={newButton || undefined}
        />
      ) : (
        <>
          {inProgress.length > 0 && (
            <div className="campaign-group">
              <h3 className="campaign-group-title">Em andamento</h3>
              <ul className="campaign-list">
                {inProgress.map((campaign) => (
                  <CampaignRow key={campaign.id} campaign={campaign} />
                ))}
              </ul>
            </div>
          )}
          {finished.length > 0 && (
            <div className="campaign-group">
              <h3 className="campaign-group-title">Concluídas</h3>
              <ul className="campaign-list">
                {finished.map((campaign) => (
                  <CampaignRow key={campaign.id} campaign={campaign} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {modalOpen && (
        <NewCampaignModal
          templates={templates}
          patients={patients}
          initialTemplateId={templateToUse?.id}
          onClose={() => {
            setCreating(false);
            onTemplateUsed();
          }}
          onCreated={(campaign) => {
            onTemplateUsed();
            void navigate(campaignPath(campaign.id));
          }}
        />
      )}
    </section>
  );
}
