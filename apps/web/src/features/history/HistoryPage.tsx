import {
  type AdminAuditEvent,
  type AuditHistoryFilters,
  type HistoryActor,
  appModuleLabels,
  auditHistoryQuerySchema,
  historyActions,
} from "@crm/contracts";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { formatAuditEvent } from "../../audit-history";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { AuditFields } from "./AuditFields";
import { HistoryDetailsModal } from "./HistoryDetailsModal";

export function HistoryPage() {
  const emptyFilters = {
    search: "",
    module: "",
    action: "",
    actorUserId: "",
    from: "",
    to: "",
  };
  const [draft, setDraft] = useState(emptyFilters);
  const [request, setRequest] = useState({
    cursor: undefined as string | undefined,
    page: 1,
    trail: [undefined] as (string | undefined)[],
    filters: {} as AuditHistoryFilters,
  });
  const [items, setItems] = useState<AdminAuditEvent[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [actors, setActors] = useState<HistoryActor[]>([]);
  const [actorsError, setActorsError] = useState(false);
  const [actorsAttempt, setActorsAttempt] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<AdminAuditEvent | null>(
    null,
  );
  const detailsTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let active = true;
    api
      .auditHistory(request.cursor, request.filters)
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setPageNumber(request.page);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request, attempt]);

  useEffect(() => {
    let active = true;
    api
      .historyActors()
      .then((values) => {
        if (active) {
          setActors(Array.isArray(values) ? values : []);
          setActorsError(false);
        }
      })
      .catch(() => {
        if (active) setActorsError(true);
      });
    return () => {
      active = false;
    };
  }, [actorsAttempt]);

  function applyFilters(values: typeof draft) {
    const parsed = auditHistoryQuerySchema.safeParse(
      Object.fromEntries(Object.entries(values).filter(([, value]) => value)),
    );
    if (!parsed.success) {
      setFilterError(
        parsed.error.issues[0]?.message ?? "Verifique os filtros.",
      );
      return;
    }
    const filters: AuditHistoryFilters = parsed.data;
    setFilterError("");
    setError("");
    setLoading(true);
    setItems(null);
    setNextCursor(null);
    setPageNumber(1);
    setSelectedEvent(null);
    setRequest({ cursor: undefined, page: 1, trail: [undefined], filters });
  }

  function navigatePage(direction: "previous" | "next") {
    setLoading(true);
    setError("");
    setSelectedEvent(null);
    if (direction === "next" && nextCursor) {
      setRequest({
        ...request,
        cursor: nextCursor,
        page: pageNumber + 1,
        trail: [...request.trail.slice(0, pageNumber), nextCursor],
      });
    } else {
      setRequest({
        ...request,
        cursor: request.trail[pageNumber - 2],
        page: pageNumber - 1,
      });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Atividades da clínica"
        title="Histórico"
        description="Consulte as atividades de todos os módulos. Use a pesquisa e os filtros para encontrar uma alteração."
      />
      <form
        className="panel history-filters"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters(draft);
        }}
      >
        <label>
          Pesquisar
          <input
            type="search"
            maxLength={160}
            value={draft.search}
            placeholder="Ex.: pagamento, etiqueta ou comissão"
            onChange={(event) =>
              setDraft({ ...draft, search: event.target.value })
            }
          />
        </label>
        <label>
          Área
          <select
            value={draft.module}
            onChange={(event) =>
              setDraft({ ...draft, module: event.target.value, action: "" })
            }
          >
            <option value="">Todas as áreas</option>
            {Object.entries(appModuleLabels)
              .filter(([module]) => module !== "history")
              .map(([module, label]) => (
                <option key={module} value={module}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label>
          Tipo de atividade
          <select
            value={draft.action}
            onChange={(event) =>
              setDraft({ ...draft, action: event.target.value })
            }
          >
            <option value="">Todos os tipos</option>
            {historyActions
              .filter((item) => !draft.module || item.module === draft.module)
              .map((item) => (
                <option key={item.action} value={item.action}>
                  {item.label}
                </option>
              ))}
          </select>
        </label>
        <label>
          Responsável
          <select
            value={draft.actorUserId}
            onChange={(event) =>
              setDraft({ ...draft, actorUserId: event.target.value })
            }
          >
            <option value="">Todos os responsáveis</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={draft.from}
            onChange={(event) =>
              setDraft({ ...draft, from: event.target.value })
            }
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
        </label>
        <div className="history-filter-actions">
          <button type="submit" className="primary-button">
            Pesquisar e filtrar
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setDraft(emptyFilters);
              applyFilters(emptyFilters);
            }}
          >
            Limpar filtros
          </button>
        </div>
        {filterError && <ErrorBanner error={filterError} />}
        {actorsError && (
          <p className="muted-copy">
            Não foi possível carregar os responsáveis.{" "}
            <button
              type="button"
              className="secondary-button button-sm"
              onClick={() => setActorsAttempt((value) => value + 1)}
            >
              Tentar carregar responsáveis
            </button>
          </p>
        )}
      </form>
      <section
        className="panel admin-audit"
        aria-label="Atividades do sistema"
        aria-busy={loading}
      >
        {items?.map((item) => {
          const summary = formatAuditEvent(item);
          return (
            <article className="audit-entry" key={item.id}>
              <div>
                <h2>{summary.title}</h2>
                <p className="audit-category">{summary.category}</p>
                <p className="audit-byline">
                  Quem realizou: {summary.actor} · Quando:{" "}
                  <time dateTime={item.createdAt}>{summary.date}</time>
                </p>
                {summary.details.length > 0 && (
                  <AuditFields fields={summary.details} />
                )}
              </div>
              {item.detailsRestricted ? (
                <p className="muted-copy">
                  Detalhes disponíveis para quem tem acesso aos Prontuários.
                </p>
              ) : (
                <button
                  type="button"
                  className="secondary-button button-sm"
                  onClick={(event) => {
                    detailsTrigger.current = event.currentTarget;
                    setSelectedEvent(item);
                  }}
                >
                  Ver detalhes
                </button>
              )}
            </article>
          );
        })}
        {items?.length === 0 && !loading && (
          <p className="muted-copy">
            Nenhum registro encontrado. Tente alterar a pesquisa ou os filtros.
          </p>
        )}
        {loading && <LoadingBlock />}
        {error && (
          <>
            <ErrorBanner error={error} />
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setLoading(true);
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
          </>
        )}
        <nav className="history-pagination" aria-label="Paginação do histórico">
          <button
            type="button"
            className="secondary-button"
            disabled={pageNumber === 1 || loading || Boolean(error)}
            onClick={() => navigatePage("previous")}
          >
            Anterior
          </button>
          <p role="status">
            Página {pageNumber} · {items?.length ?? 0} registros
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={!nextCursor || loading || Boolean(error)}
            onClick={() => navigatePage("next")}
          >
            Próxima
          </button>
        </nav>
      </section>
      {selectedEvent && (
        <HistoryDetailsModal
          event={selectedEvent}
          onClose={() => {
            setSelectedEvent(null);
            detailsTrigger.current?.focus();
          }}
        />
      )}
    </>
  );
}
