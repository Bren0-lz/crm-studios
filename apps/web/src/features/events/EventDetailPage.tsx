import {
  formatPhone,
  type CommercialEventDetail,
  type EventParticipant,
} from "@crm/contracts";
import { FileDown, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
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
import { eventMoment, eventPhone } from "./model";

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
  const [state, setState] = useState<State>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [contact, setContact] = useState<EventParticipant | null>(null);
  const [converting, setConverting] = useState<EventParticipant | null>(null);
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
          canAdd && (
            <div className="page-actions">
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
            </div>
          )
        }
      />
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
              </p>
            )}
          </div>
        </div>
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
          ) : (
            <ul className="events-list" aria-label="Lista de participantes">
              {event.participants.map((participant) => (
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
                      <ContactStatus
                        participant={participant}
                        timezone={timezone}
                      />
                      {participant.convertedPatientId && (
                        <span className="status-pill completed">Cliente</span>
                      )}
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
