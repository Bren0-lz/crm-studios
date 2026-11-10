import {
  eventParticipantStatus,
  eventParticipantStatusLabels,
  eventParticipantStatuses,
  formatPhone,
  type CommercialEventDetail,
  type EventParticipant,
  type EventParticipantStatus,
} from "@crm/contracts";
import { Download, FileDown, Search, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { useToast } from "../../shared/feedback/toast-context";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { EventContactModal } from "./EventContactModal";
import { EventConvertModal } from "./EventConvertModal";
import { EventParticipantModal } from "./EventParticipantModal";
import { EventImportModal } from "./EventImportModal";
import {
  eventExportFileName,
  eventMoment,
  eventPhone,
  matchesEventParticipant,
} from "./model";

/** Cor do status: neutro até o contato, verde quando virou cliente. */
const statusTone: Record<EventParticipantStatus, string> = {
  not_contacted: "",
  contacted: "scheduled",
  interested: "in_progress",
  evaluation: "confirmed",
  client: "completed",
};

type State =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; event: CommercialEventDetail; timezone: string };

function ContactStatus({
  participant,
  timezone,
}: {
  participant: EventParticipant;
  timezone: string;
}) {
  if (participant.contactedAt)
    return (
      <span className="status-pill completed">
        Contato feito em {eventMoment(participant.contactedAt, timezone)}
      </span>
    );
  if (participant.lastContactAt)
    return (
      <span className="status-pill scheduled">
        Sem resposta em {eventMoment(participant.lastContactAt, timezone)}
      </span>
    );
  return <span className="status-pill">Contato não feito</span>;
}

export function EventDetailPage() {
  const { id = "" } = useParams();
  const { can } = useAuthorization();
  const canAdd = can("crm.create");
  const canContact = can("crm.contacts_create");
  // Mesma permissão da conversão no CRM comercial.
  const canConvert = can("crm.convert", "patients.create");
  // Mesma permissão de editar o evento.
  const canRemove = can("events.manage");
  const [state, setState] = useState<State>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [contact, setContact] = useState<EventParticipant | null>(null);
  const [converting, setConverting] = useState<EventParticipant | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    EventParticipantStatus | ""
  >("");
  const [removing, setRemoving] = useState<EventParticipant | null>(null);
  // Mutações em /leads atualizam a versão "crm": participantes e indicadores recarregam.
  const version = useDataVersion("crm");
  const toast = useToast();
  useEffect(() => {
    let active = true;
    Promise.all([api.event(id), api.clinicBranding()])
      .then(([event, branding]) => {
        if (active)
          setState({ status: "ready", event, timezone: branding.timezone });
      })
      .catch((cause: unknown) => {
        if (active)
          setState({
            status: "error",
            error:
              cause instanceof Error
                ? cause.message
                : "Não foi possível carregar o evento.",
          });
      });
    return () => {
      active = false;
    };
  }, [id, version, retry]);
  const event = state.status === "ready" ? state.event : null;
  const participants = useMemo(
    () =>
      (event?.participants ?? []).map((participant) => ({
        participant,
        status: eventParticipantStatus(participant),
      })),
    [event],
  );
  const visible = participants.filter(
    (item) =>
      (!statusFilter || item.status === statusFilter) &&
      matchesEventParticipant(item.participant, search),
  );
  const filtering = Boolean(search.trim() || statusFilter);
  async function exportParticipants() {
    if (!event) return;
    setExporting(true);
    setExportError("");
    try {
      const blob = await api.eventParticipantsXlsx(event.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = eventExportFileName(event.name);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível exportar os participantes.",
      );
    } finally {
      setExporting(false);
    }
  }
  const timezone = state.status === "ready" ? state.timezone : "";
  const indicators = event
    ? [
        ["Contatados", event.indicators.contacted],
        ["Interessados", event.indicators.interested],
        ["Avaliações marcadas", event.indicators.evaluations],
        ["Convertidos em cliente", event.indicators.converted],
      ]
    : [];
  return (
    <>
      <PageHeader
        title={event?.name ?? "Evento"}
        description={
          event
            ? [eventMoment(event.startsAt, timezone), event.location]
                .filter(Boolean)
                .join(" · ")
            : "Participantes e contatos do evento."
        }
        back={{ to: "/eventos", label: "Voltar para Eventos" }}
        action={
          <div className="page-actions">
            <button
              className="secondary-button"
              disabled={!event || exporting}
              onClick={() => void exportParticipants()}
            >
              <Download size={18} aria-hidden="true" />
              {exporting ? "Exportando..." : "Exportar participantes"}
            </button>
            {canAdd && (
              <>
                <button
                  className="secondary-button"
                  disabled={!event}
                  onClick={() => setImporting(true)}
                >
                  <FileDown size={18} aria-hidden="true" />
                  Importar participantes
                </button>
                <button
                  className="primary-button"
                  disabled={!event}
                  onClick={() => setAdding(true)}
                >
                  <UserPlus size={18} aria-hidden="true" />
                  Adicionar participante
                </button>
              </>
            )}
          </div>
        }
      />
      {exportError && <ErrorBanner error={exportError} />}
      {event && (
        <div className="metric-grid events-indicators" aria-label="Indicadores">
          {indicators.map(([label, value]) => (
            <article className="metric-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      )}
      <section className="panel" aria-label="Participantes">
        <div className="panel-head">
          <div>
            <h2>Participantes</h2>
            {event && (
              <p className="panel-context">
                {event.participants.length} participante(s)
                {filtering && ` · ${visible.length} exibido(s)`}
              </p>
            )}
          </div>
        </div>
        {event && event.participants.length > 0 && (
          <div className="list-toolbar events-toolbar">
            <label className="search-box">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar participante"
                placeholder="Buscar por nome, telefone ou e-mail"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="events-filter">
              Status
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as EventParticipantStatus | "")
                }
              >
                <option value="">Todos</option>
                {eventParticipantStatuses.map((status) => (
                  <option key={status} value={status}>
                    {eventParticipantStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {state.status === "loading" && <LoadingBlock />}
        {state.status === "error" && (
          <div className="events-content">
            <ErrorBanner error={state.error} />
            <button
              className="secondary-button"
              onClick={() => {
                setState({ status: "loading" });
                setRetry((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}
        {event &&
          (event.participants.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum participante"
              copy="Os participantes do evento aparecerão aqui após o cadastro."
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nenhum participante encontrado"
              copy="Mude a busca ou o filtro de status."
            />
          ) : (
            <ul className="events-list" aria-label="Lista de participantes">
              {visible.map(({ participant, status }) => (
                <li key={participant.id}>
                  <div className="events-summary">
                    <h3>{participant.fullName || "Participante sem nome"}</h3>
                    <dl className="events-participant-contacts">
                      <div>
                        <dt>Telefone</dt>
                        <dd>{eventPhone(participant.phone)}</dd>
                      </div>
                      <div>
                        <dt>WhatsApp</dt>
                        <dd>
                          {participant.whatsapp
                            ? formatPhone(participant.whatsapp)
                            : "Não informado"}
                        </dd>
                      </div>
                      <div>
                        <dt>E-mail</dt>
                        <dd>{participant.email || "Não informado"}</dd>
                      </div>
                    </dl>
                    <div className="events-participant-status">
                      <span
                        className={`status-pill ${statusTone[status]}`.trim()}
                      >
                        {eventParticipantStatusLabels[status]}
                      </span>
                      <ContactStatus
                        participant={participant}
                        timezone={timezone}
                      />
                    </div>
                  </div>
                  <div className="events-actions">
                    {canConvert && !participant.convertedPatientId && (
                      <button
                        className="secondary-button button-sm"
                        aria-label={`${participant.fullName} se tornou cliente`}
                        onClick={() => setConverting(participant)}
                      >
                        Se tornou cliente
                      </button>
                    )}
                    {canContact && (
                      <button
                        className="secondary-button button-sm"
                        aria-label={`Registrar contato com ${participant.fullName}`}
                        onClick={() => setContact(participant)}
                      >
                        Registrar contato
                      </button>
                    )}
                    {canRemove && (
                      <button
                        className="secondary-button button-sm"
                        aria-label={`Remover ${participant.fullName || "participante sem nome"} do evento`}
                        onClick={() => setRemoving(participant)}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </section>
      {adding && event && canAdd && (
        <EventParticipantModal
          event={event}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            toast.success("Participante adicionado.");
          }}
        />
      )}
      {importing && event && canAdd && (
        <EventImportModal
          event={event}
          onClose={() => setImporting(false)}
          onImported={() => toast.success("Participantes importados.")}
        />
      )}
      {contact && canContact && (
        <EventContactModal
          participant={contact}
          timezone={timezone}
          canConvert={canConvert}
          onClose={() => setContact(null)}
          onSaved={() => {
            setContact(null);
            toast.success("Contato registrado.");
          }}
          onConverted={() => toast.success("Cliente cadastrado.")}
        />
      )}
      {removing && event && canRemove && (
        <ActionModal
          eyebrow="Eventos"
          title="Remover participante"
          subtitle={`${removing.fullName || "Participante sem nome"} · ${event.name}`}
          effect="O participante sai deste evento e continua no funil comercial como lead, com os contatos já registrados."
          confirmLabel="Remover participante"
          danger
          onConfirm={async () => {
            await api.removeEventParticipant(event.id, removing.id);
            setRemoving(null);
            toast.success("Participante removido do evento.");
          }}
          onClose={() => setRemoving(null)}
        />
      )}
      {converting && canConvert && (
        <EventConvertModal
          participant={converting}
          onClose={() => setConverting(null)}
          onConverted={() => {
            setConverting(null);
            toast.success("Cliente cadastrado.");
          }}
        />
      )}
    </>
  );
}
