import type { Branch, CommercialEvent, Service } from "@crm/contracts";
import { CalendarDays, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { PageHeader } from "../../shared/components/PageHeader";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { useToast } from "../../shared/feedback/toast-context";
import { EventModal } from "./EventModal";

type State =
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "ready";
      events: CommercialEvent[];
      branches: Branch[];
      services: Service[];
      timezone: string;
    };
export function EventsPage() {
  const { can } = useAuthorization();
  const canManage = can("events.manage");
  const [state, setState] = useState<State>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const [modal, setModal] = useState<CommercialEvent | "new" | null>(null);
  const [deleting, setDeleting] = useState<CommercialEvent | null>(null);
  const [serviceId, setServiceId] = useState("");
  const version = useDataVersion("crm");
  const toast = useToast();
  useEffect(() => {
    let active = true;
    Promise.all([
      api.events(serviceId ? { serviceId } : {}),
      api.branches(),
      api.services(),
      api.clinicBranding(),
    ])
      .then(([events, branches, services, branding]) => {
        if (active)
          setState({
            status: "ready",
            events,
            branches,
            services: [...services].sort((a, b) =>
              a.name.localeCompare(b.name, "pt-BR"),
            ),
            timezone: branding.timezone,
          });
      })
      .catch((cause: unknown) => {
        if (active)
          setState({
            status: "error",
            error:
              cause instanceof Error
                ? cause.message
                : "Não foi possível carregar os eventos.",
          });
      });
    return () => {
      active = false;
    };
  }, [version, retry, serviceId]);
  // A atualização da lista não desmonta um formulário que ainda está aberto.
  const [options, setOptions] = useState<{
    branches: Branch[];
    services: Service[];
    timezone: string;
  } | null>(null);
  function open(value: CommercialEvent | "new") {
    if (state.status !== "ready") return;
    setOptions({
      branches: state.branches,
      services: state.services,
      timezone: state.timezone,
    });
    setModal(value);
  }
  const services = state.status === "ready" ? state.services : [];
  return (
    <>
      <PageHeader
        title="Eventos"
        description="Organize os eventos comerciais da clínica."
        action={
          canManage && (
            <button
              className="primary-button"
              disabled={state.status !== "ready"}
              onClick={() => open("new")}
            >
              <Plus size={18} aria-hidden="true" />
              Novo evento
            </button>
          )
        }
      />
      <section className="panel" aria-label="Lista de eventos">
        <div className="panel-head">
          <div>
            <h2>Eventos cadastrados</h2>
            {state.status === "ready" && (
              <p className="panel-context">{state.events.length} evento(s)</p>
            )}
          </div>
        </div>
        {(services.length > 0 || serviceId) && (
          <div className="list-toolbar">
            <label className="events-filter">
              Serviço
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                <option value="">Todos os serviços</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
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
        {state.status === "ready" &&
          (state.events.length === 0 ? (
            serviceId ? (
              <EmptyState
                icon={CalendarDays}
                title="Nenhum evento com este serviço"
                copy="Escolha outro serviço ou veja todos os eventos."
              />
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Nenhum evento cadastrado"
                copy="Os eventos comerciais aparecerão aqui após o cadastro."
              />
            )
          ) : (
            <ul className="events-list">
              {[...state.events]
                .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
                .map((event) => (
                  <li key={event.id}>
                    <div className="events-summary">
                      <h3>{event.name}</h3>
                      <p>
                        <time dateTime={event.startsAt}>
                          {new Intl.DateTimeFormat("pt-BR", {
                            timeZone: state.timezone,
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(event.startsAt))}
                        </time>
                        {event.location && ` · ${event.location}`}
                      </p>
                      <p className="muted-copy">
                        {event.branchId
                          ? (state.branches.find(
                              (branch) => branch.id === event.branchId,
                            )?.name ?? "Unidade vinculada")
                          : "Toda a rede"}
                        {event.serviceName && ` · ${event.serviceName}`} ·{" "}
                        {event.participantCount} participante(s)
                        {event.attendeeCount !== undefined &&
                          ` · Público estimado: ${event.attendeeCount}`}
                      </p>
                      {event.notes && (
                        <p className="events-notes">{event.notes}</p>
                      )}
                    </div>
                    <div className="events-actions">
                      <Link
                        className="secondary-button button-sm"
                        to={`/eventos/${event.id}`}
                        aria-label={`Ver participantes de ${event.name}`}
                      >
                        Participantes
                      </Link>
                      {canManage && (
                        <button
                          className="secondary-button button-sm"
                          aria-label={`Editar ${event.name}`}
                          onClick={() => open(event)}
                        >
                          Editar
                        </button>
                      )}
                      {canManage && (
                        <button
                          className="secondary-button button-sm"
                          aria-label={`Excluir ${event.name}`}
                          onClick={() => setDeleting(event)}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
          ))}
      </section>
      {modal && options && canManage && (
        <EventModal
          {...options}
          event={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            toast.success("Evento salvo.");
          }}
        />
      )}
      {deleting && canManage && (
        <ActionModal
          eyebrow="Eventos"
          title="Excluir evento"
          subtitle={deleting.name}
          effect={`O evento sai da lista. ${
            deleting.participantCount === 1
              ? "O participante continua"
              : `Os ${deleting.participantCount} participantes continuam`
          } no funil comercial como lead, sem o evento.`}
          confirmLabel="Excluir evento"
          danger
          onConfirm={async () => {
            await api.deleteEvent(deleting.id);
            setDeleting(null);
            toast.success("Evento excluído.");
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
