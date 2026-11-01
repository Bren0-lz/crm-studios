import {
  autoCampaignStepLabel,
  autoCampaignTriggerLabels,
  type AutoCampaign,
  type AutoCampaignSummary,
  type AutoCampaignTrigger,
} from "@crm/contracts";
import {
  BatteryLow,
  Cake,
  CalendarClock,
  CalendarX,
  CirclePause,
  Gift,
  Hourglass,
  Pencil,
  Plus,
  ThumbsDown,
  Trash2,
  UserMinus,
  UserX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../../../api";
import { useAuthorization } from "../../../authorization-context";
import { EmptyState } from "../../../shared/components/EmptyState";
import { ErrorBanner } from "../../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../../shared/components/LoadingBlock";
import { Modal } from "../../../shared/components/Modal";
import { useToast } from "../../../shared/feedback/toast-context";
import { AutoCampaignEditorModal } from "./AutoCampaignEditorModal";
import { promotionSummary } from "./model";

/** Ícone do evento que dispara a campanha, ao lado do nome do evento no cartão. */
const triggerIcons: Record<AutoCampaignTrigger, LucideIcon> = {
  birthday: Cake,
  appointment_upcoming: CalendarClock,
  plan_expiring: Hourglass,
  low_balance: BatteryLow,
  overdue_payment: Wallet,
  expired_with_balance: CalendarX,
  treatment_paused: CirclePause,
  single_no_return: UserMinus,
  former_client: UserX,
  nps_detractor: ThumbsDown,
};

/** Configuração das campanhas automáticas (a fila do dia fica na página inicial). */
export function AutoCampaignsTab() {
  const { can, canEdit, canView } = useAuthorization();
  const toast = useToast();
  const canManage =
    canEdit("communications") && can("communications.campaigns");
  const [campaigns, setCampaigns] = useState<AutoCampaign[] | null>(null);
  const [summaries, setSummaries] = useState<AutoCampaignSummary[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{
    campaign?: AutoCampaign | undefined;
  } | null>(null);
  const [deleting, setDeleting] = useState<AutoCampaign | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([api.autoCampaigns(), api.autoCampaignQueue()])
      .then(([list, queue]) => {
        if (!active) return;
        setCampaigns(list);
        setSummaries(queue.campaigns);
        setError("");
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [reload]);

  async function confirmDelete(campaign: AutoCampaign) {
    setDeleteBusy(true);
    try {
      await api.deleteAutoCampaign(campaign.id);
      toast.success("Campanha automática excluída.");
      setDeleting(null);
      setReload((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível excluir.",
      );
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Campanhas automáticas</h2>
          <p className="panel-context">
            Quem se encaixa aparece todo dia em{" "}
            <NavLink to="/?aba=campanhas" className="text-link">
              Início › Campanhas automáticas
            </NavLink>
            .
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            className="primary-button"
            onClick={() => setEditing({})}
          >
            <Plus size={17} aria-hidden="true" />
            Nova campanha automática
          </button>
        )}
      </div>
      {error && (
        <div className="auto-campaign-block">
          <ErrorBanner error={error} />
        </div>
      )}
      {!campaigns && !error ? (
        <LoadingBlock />
      ) : !campaigns ? null : campaigns.length === 0 ? (
        <EmptyState
          title="Nenhuma campanha automática"
          copy="Ex.: aniversariantes com uma mensagem 7 dias antes, outra 2 dias antes e outra no dia."
        />
      ) : (
        <div className="auto-campaign-grid">
          {campaigns.map((campaign) => {
            const summary = summaries.find(
              (item) => item.campaignId === campaign.id,
            );
            return (
              <AutoCampaignCard
                key={campaign.id}
                campaign={campaign}
                summary={summary}
                canManage={canManage}
                onEdit={() => setEditing({ campaign })}
                onDelete={() => setDeleting(campaign)}
              />
            );
          })}
        </div>
      )}
      {editing && (
        <AutoCampaignEditorModal
          campaign={editing.campaign}
          canSeeFinance={canView("finance")}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            toast.success(
              editing.campaign
                ? "Campanha automática atualizada."
                : `Campanha “${saved.name}” criada.`,
            );
            setEditing(null);
            setReload((value) => value + 1);
          }}
        />
      )}
      {deleting && (
        <Modal
          eyebrow="Campanhas automáticas"
          title={`Excluir “${deleting.name}”?`}
          subtitle="Ela sai da lista do dia e das notificações. Os envios já registrados deixam de aparecer."
          busy={deleteBusy}
          onClose={() => setDeleting(null)}
        >
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={deleteBusy}
              onClick={() => setDeleting(null)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={deleteBusy}
              onClick={() => void confirmDelete(deleting)}
            >
              {deleteBusy ? "Excluindo…" : "Excluir campanha"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function AutoCampaignCard({
  campaign,
  summary,
  canManage,
  onEdit,
  onDelete,
}: {
  campaign: AutoCampaign;
  summary: AutoCampaignSummary | undefined;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const TriggerIcon = triggerIcons[campaign.trigger];
  const stats =
    summary && campaign.active
      ? [
          { label: "Pendentes", value: summary.pending, tone: "pending" },
          { label: "Enviadas", value: summary.sent, tone: "sent" },
          { label: "Não enviadas", value: summary.skipped, tone: "skipped" },
        ]
      : null;
  return (
    <article
      className={`auto-campaign-card${campaign.active ? "" : " paused"}`}
    >
      <header className="auto-campaign-card-head">
        <div className="auto-campaign-card-title">
          <h3>{campaign.name}</h3>
          <p className="auto-campaign-card-trigger">
            <TriggerIcon size={15} aria-hidden="true" />
            {autoCampaignTriggerLabels[campaign.trigger]}
          </p>
        </div>
        <span
          className={`auto-campaign-state ${campaign.active ? "active" : "paused"}`}
        >
          {campaign.active ? "Ativa" : "Pausada"}
        </span>
      </header>

      <section className="auto-campaign-card-section">
        <h4>
          {campaign.steps.length === 1
            ? "1 mensagem"
            : `${campaign.steps.length} mensagens`}
        </h4>
        <ol className="auto-campaign-timeline">
          {campaign.steps.map((step) => (
            <li key={step.id}>
              <strong>
                {autoCampaignStepLabel(campaign.trigger, step.offset)}
              </strong>
              <span>{step.message}</span>
            </li>
          ))}
        </ol>
      </section>

      {campaign.promotion && (
        <div className="auto-campaign-promo">
          <Gift size={16} aria-hidden="true" />
          <div>
            <strong>Promocional</strong>
            <span>{promotionSummary(campaign.promotion)}</span>
          </div>
        </div>
      )}

      <footer className="auto-campaign-card-foot">
        {stats ? (
          <div className="auto-campaign-today">
            <span>Hoje</span>
            <dl className="auto-campaign-stats" aria-label="Envios de hoje">
              {stats.map((stat) => (
                <div key={stat.label} className={stat.tone}>
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="auto-campaign-card-note">
            {campaign.active
              ? "Ninguém na lista de hoje."
              : "Pausada: não entra na lista do dia."}
          </p>
        )}
        {canManage && (
          <div className="auto-campaign-card-actions">
            <button
              type="button"
              className="secondary-button"
              aria-label={`Editar ${campaign.name}`}
              onClick={onEdit}
            >
              <Pencil size={15} aria-hidden="true" />
              Editar
            </button>
            <button
              type="button"
              className="secondary-button danger-text"
              aria-label={`Excluir ${campaign.name}`}
              onClick={onDelete}
            >
              <Trash2 size={15} aria-hidden="true" />
              Excluir
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}
