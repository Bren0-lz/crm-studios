import {
  formatPhone,
  whatsappLink,
  type AutoCampaignItem,
  type AutoCampaignItemStatus,
  type AutoCampaignQueue,
  type AutoCampaignSkipReason,
} from "@crm/contracts";
import {
  Check,
  Copy,
  MessageCircle,
  RefreshCw,
  Search,
  Settings2,
  SkipForward,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../../../api";
import { useAuthorization } from "../../../authorization-context";
import { EmptyState } from "../../../shared/components/EmptyState";
import { ErrorBanner } from "../../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../../shared/components/LoadingBlock";
import { useToast } from "../../../shared/feedback/toast-context";
import { useDataVersion } from "../../../shared/hooks/useDataVersion";
import { shortDate } from "../../../shared/lib/formatting";
import { copyText } from "../campaigns/clipboard";
import { AutoCampaignSkipModal } from "./AutoCampaignSkipModal";
import {
  autoCampaignStatusLabels,
  autoCampaignStatusPill,
  skippedReason,
} from "./model";

/** A fila se recalcula no servidor: confere de novo a cada 5 minutos e ao voltar à aba. */
const REFRESH_MS = 5 * 60 * 1000;

type StatusFilter = AutoCampaignItemStatus | "all";
const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "pending", label: "Pendentes" },
  { value: "sent", label: "Enviadas" },
  { value: "skipped", label: "Não enviadas" },
  { value: "all", label: "Todas" },
];

const timeLabel = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Mensagens das campanhas automáticas para enviar hoje, com filtros e o registro de envio. */
export function AutoCampaignQueuePanel() {
  const { can, canEdit } = useAuthorization();
  const toast = useToast();
  const canHandle =
    canEdit("communications") && can("communications.campaigns");
  const [queue, setQueue] = useState<AutoCampaignQueue | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [opened, setOpened] = useState<string[]>([]);
  const [skipping, setSkipping] = useState<AutoCampaignItem | null>(null);
  const [tick, setTick] = useState(0);
  const version = useDataVersion(
    "communications",
    "agenda",
    "finance",
    "plans",
    "patients",
  );

  useEffect(() => {
    let active = true;
    api
      .autoCampaignQueue()
      .then((data) => {
        if (!active) return;
        setQueue(data);
        setLoadedAt(new Date());
        setError("");
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setRefreshing(false));
    return () => {
      active = false;
    };
  }, [version, tick]);

  useEffect(() => {
    const refresh = () => setTick((value) => value + 1);
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  function load() {
    setRefreshing(true);
    setTick((value) => value + 1);
  }

  async function record(
    item: AutoCampaignItem,
    status: "sent" | "skipped",
    skipReason?: AutoCampaignSkipReason,
    note?: string,
  ) {
    setBusyKey(item.key);
    try {
      await api.recordAutoCampaignDelivery({
        campaignId: item.campaignId,
        stepId: item.stepId,
        patientId: item.patientId,
        occurrenceKey: item.occurrenceKey,
        status,
        ...(skipReason ? { skipReason } : {}),
        ...(note ? { note } : {}),
      });
      toast.success(
        status === "sent"
          ? `Envio para ${item.patientName} registrado.`
          : `Não envio para ${item.patientName} registrado.`,
      );
      setSkipping(null);
    } finally {
      setBusyKey("");
    }
  }

  async function markSent(item: AutoCampaignItem) {
    try {
      await record(item, "sent");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível registrar.",
      );
    }
  }

  async function undo(item: AutoCampaignItem) {
    if (!item.delivery) return;
    setBusyKey(item.key);
    try {
      await api.undoAutoCampaignDelivery(item.delivery.id);
      toast.success(`${item.patientName} voltou para pendente.`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível desfazer.",
      );
    } finally {
      setBusyKey("");
    }
  }

  const items = queue?.items ?? [];
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const byCampaign = items.filter(
    (item) => campaignFilter === "all" || item.campaignId === campaignFilter,
  );
  const visible = byCampaign.filter(
    (item) =>
      (statusFilter === "all" || item.status === statusFilter) &&
      (!term || item.patientName.toLocaleLowerCase("pt-BR").includes(term)),
  );
  const count = (status: StatusFilter) =>
    status === "all"
      ? byCampaign.length
      : byCampaign.filter((item) => item.status === status).length;
  const activeCampaigns = (queue?.campaigns ?? []).filter(
    (campaign) => campaign.active,
  );
  const pending = items.filter((item) => item.status === "pending").length;

  return (
    <section className="panel auto-campaign-queue">
      <div className="panel-head">
        <div>
          <h2>Mensagens para enviar</h2>
          <p className="panel-context">
            {queue
              ? `${pending} ${pending === 1 ? "pendente" : "pendentes"} hoje`
              : "Campanhas automáticas"}
            {loadedAt && ` · Atualizado às ${timeLabel.format(loadedAt)}`}
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={refreshing}
            onClick={load}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {refreshing ? "Atualizando…" : "Atualizar"}
          </button>
          <NavLink
            to="/comunicacoes?aba=automaticas"
            className="secondary-button"
          >
            <Settings2 size={16} aria-hidden="true" />
            Configurar campanhas
          </NavLink>
        </div>
      </div>
      {error && (
        <div className="auto-campaign-block">
          <ErrorBanner error={error} />
        </div>
      )}
      {!queue && !error ? (
        <LoadingBlock />
      ) : !queue ? null : queue.campaigns.length === 0 ? (
        <EmptyState
          title="Nenhuma campanha automática"
          copy="Crie uma campanha (ex.: aniversariantes) e quem se encaixar aparece aqui todos os dias."
          action={
            <NavLink
              to="/comunicacoes?aba=automaticas"
              className="primary-button"
            >
              Criar campanha automática
            </NavLink>
          }
        />
      ) : (
        <>
          <div className="auto-campaign-block auto-campaign-filters">
            {activeCampaigns.length > 1 && (
              <div className="filter-group filter-tags">
                <span className="filter-label" id="auto-campaign-filter">
                  Campanha
                </span>
                <div
                  className="tag-filter-list"
                  role="group"
                  aria-labelledby="auto-campaign-filter"
                >
                  <button
                    type="button"
                    className="tag-filter"
                    aria-pressed={campaignFilter === "all"}
                    onClick={() => setCampaignFilter("all")}
                  >
                    Todas
                    <small>{pending}</small>
                  </button>
                  {activeCampaigns.map((campaign) => (
                    <button
                      type="button"
                      key={campaign.campaignId}
                      className="tag-filter"
                      aria-pressed={campaignFilter === campaign.campaignId}
                      onClick={() => setCampaignFilter(campaign.campaignId)}
                    >
                      {campaign.name}
                      <small>{campaign.pending}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="list-toolbar">
              <label className="campaign-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Buscar cliente"
                  placeholder="Buscar cliente"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div
                className="campaign-segmented"
                role="group"
                aria-label="Situação das mensagens"
              >
                {statusFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className="text-button"
                    aria-pressed={statusFilter === filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                  >
                    {filter.label} ({count(filter.value)})
                  </button>
                ))}
              </div>
            </div>
          </div>
          {visible.length === 0 ? (
            <EmptyState
              title={
                statusFilter === "pending" && !term
                  ? "Tudo enviado por hoje"
                  : "Nenhuma mensagem"
              }
              copy={
                statusFilter === "pending" && !term
                  ? "Não há mensagens pendentes nas campanhas automáticas."
                  : "Nenhuma mensagem com esses filtros."
              }
            />
          ) : (
            <ul className="auto-campaign-list">
              {visible.map((item) => {
                const busy = busyKey === item.key;
                const reason = item.status === "skipped" && skippedReason(item);
                return (
                  <li key={item.key} className="auto-campaign-item">
                    <div className="auto-campaign-item-main">
                      <div className="auto-campaign-item-head">
                        <strong>{item.patientName}</strong>
                        <span
                          className={`status-pill ${autoCampaignStatusPill[item.status]}`}
                        >
                          {autoCampaignStatusLabels[item.status]}
                        </span>
                      </div>
                      <p className="panel-context">
                        {item.campaignName} · {item.stepLabel}
                        {item.phone && ` · ${formatPhone(item.phone)}`}
                      </p>
                      <p>
                        {item.detail}
                        {item.eventDate &&
                          item.trigger !== "low_balance" &&
                          ` · ${shortDate.format(new Date(`${item.eventDate}T12:00:00`))}`}
                      </p>
                      <p className="auto-campaign-message">{item.message}</p>
                      {reason && (
                        <p className="auto-campaign-reason">Motivo: {reason}</p>
                      )}
                      {item.delivery && (
                        <p className="field-hint">
                          {item.delivery.status === "sent"
                            ? "Enviada"
                            : "Registrada"}{" "}
                          por {item.delivery.handledByName} às{" "}
                          {timeLabel.format(new Date(item.delivery.handledAt))}{" "}
                          de{" "}
                          {shortDate.format(new Date(item.delivery.handledAt))}
                        </p>
                      )}
                    </div>
                    <div className="auto-campaign-item-actions">
                      {item.status === "pending" && (
                        <>
                          <a
                            className="whatsapp-button"
                            href={whatsappLink(item.phone, item.message)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              setOpened((current) => [...current, item.key])
                            }
                          >
                            <MessageCircle size={16} aria-hidden="true" />
                            WhatsApp
                          </a>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Copiar mensagem para ${item.patientName}`}
                            onClick={() =>
                              void copyText(item.message)
                                .then(() => toast.success("Texto copiado."))
                                .catch((cause: Error) =>
                                  setError(cause.message),
                                )
                            }
                          >
                            <Copy size={15} aria-hidden="true" />
                          </button>
                        </>
                      )}
                      {canHandle && item.status === "pending" && (
                        <>
                          <button
                            type="button"
                            className={
                              opened.includes(item.key)
                                ? "primary-button"
                                : "secondary-button"
                            }
                            disabled={busy}
                            aria-label={`Marcar enviada para ${item.patientName}`}
                            onClick={() => void markSent(item)}
                          >
                            <Check size={16} aria-hidden="true" />
                            Enviada
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy}
                            aria-label={`Não enviar para ${item.patientName}`}
                            onClick={() => setSkipping(item)}
                          >
                            <SkipForward size={16} aria-hidden="true" />
                            Não enviar
                          </button>
                        </>
                      )}
                      {canHandle && item.delivery && (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          aria-label={`Desfazer registro de ${item.patientName}`}
                          onClick={() => void undo(item)}
                        >
                          <Undo2 size={16} aria-hidden="true" />
                          Desfazer
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {skipping && (
        <AutoCampaignSkipModal
          item={skipping}
          onClose={() => setSkipping(null)}
          onConfirm={(reason, note) =>
            record(skipping, "skipped", reason, note)
          }
        />
      )}
    </section>
  );
}
