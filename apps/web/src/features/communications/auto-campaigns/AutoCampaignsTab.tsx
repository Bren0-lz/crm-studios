import {
  autoCampaignStepLabel,
  autoCampaignTriggerLabels,
  type AutoCampaign,
  type AutoCampaignSummary,
} from "@crm/contracts";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
        <div className="plans-grid">
          {campaigns.map((campaign) => {
            const summary = summaries.find(
              (item) => item.campaignId === campaign.id,
            );
            return (
              <article className="plan-card" key={campaign.id}>
                <div className="plan-card-head">
                  <span className="status-pill open">
                    {autoCampaignTriggerLabels[campaign.trigger]}
                  </span>
                  <span
                    className={`status-pill ${campaign.active ? "completed" : "cancelled"}`}
                  >
                    {campaign.active ? "Ativa" : "Pausada"}
                  </span>
                </div>
                <h3>{campaign.name}</h3>
                <ul className="auto-campaign-step-summary">
                  {campaign.steps.map((step) => (
                    <li key={step.id}>
                      <strong>
                        {autoCampaignStepLabel(campaign.trigger, step.offset)}
                      </strong>
                      <span>{step.message}</span>
                    </li>
                  ))}
                </ul>
                {summary && campaign.active && (
                  <div className="plan-meta">
                    <span>Hoje</span>
                    <strong>
                      {summary.pending} pendentes · {summary.sent} enviadas ·{" "}
                      {summary.skipped} não enviadas
                    </strong>
                  </div>
                )}
                {canManage && (
                  <div className="page-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`Editar ${campaign.name}`}
                      onClick={() => setEditing({ campaign })}
                    >
                      <Pencil size={15} aria-hidden="true" />
                      Editar
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`Excluir ${campaign.name}`}
                      onClick={() => setDeleting(campaign)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Excluir
                    </button>
                  </div>
                )}
              </article>
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
