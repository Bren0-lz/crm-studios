import {
  formatPhone,
  waitlistDemand,
  waitlistItemKey,
  waitlistKindLabels,
  waitlistPosition,
  waitlistStatusLabels,
  type WaitlistEntry,
  type WaitlistOptions,
} from "@crm/contracts";
import { Hourglass, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { useToast } from "../../shared/feedback/toast-context";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import {
  daysWaiting,
  filterWaitlist,
  statusFilterLabels,
  statusPillClass,
  waitingLabel,
  type WaitlistStatusFilter,
} from "./model";
import { WaitlistEntryModal } from "./WaitlistEntryModal";
import { WaitlistManageModal } from "./WaitlistManageModal";

const initialFilters = {
  search: "",
  item: "",
  status: "queue" as WaitlistStatusFilter,
};

/** Lista de espera: quem aguarda turma de um serviço ou reposição de um produto. */
export function WaitlistPage() {
  const { can, canEdit } = useAuthorization();
  const toast = useToast();
  const canManage = canEdit("waitlist") && can("waitlist.manage");
  const [entries, setEntries] = useState<WaitlistEntry[] | null>(null);
  const [options, setOptions] = useState<WaitlistOptions | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);
  const [filters, setFilters] = useState(initialFilters);
  const listRef = useRef<HTMLElement>(null);
  const version = useDataVersion("waitlist");
  useEffect(() => {
    let alive = true;
    Promise.all([api.waitlist(), api.waitlistOptions()])
      .then(([entryData, optionData]) => {
        if (!alive) return;
        setEntries(entryData);
        setOptions(optionData);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [version]);
  async function reload(message: string) {
    setEntries(await api.waitlist());
    setAdding(false);
    setManaging(null);
    toast.success(message);
  }

  const all = entries ?? [];
  const demand = waitlistDemand(all);
  const maxTotal = demand[0]?.total ?? 0;
  const inQueue = demand.reduce((sum, item) => sum + item.total, 0);
  const waiting = demand.reduce((sum, item) => sum + item.waiting, 0);
  const contacted = demand.reduce((sum, item) => sum + item.contacted, 0);
  const oldest = demand.reduce<string | null>(
    (min, item) => (!min || item.oldestSince < min ? item.oldestSince : min),
    null,
  );
  const visible = filterWaitlist(all, filters);
  const itemOptions = [
    ...new Map(
      all.map((entry) => [
        waitlistItemKey(entry),
        `${entry.itemName} (${waitlistKindLabels[entry.kind].toLowerCase()})`,
      ]),
    ),
  ].sort((left, right) => left[1].localeCompare(right[1], "pt-BR"));
  const filtered =
    filters.search !== initialFilters.search ||
    filters.item !== initialFilters.item ||
    filters.status !== initialFilters.status;
  const managed = all.find((entry) => entry.id === managing);

  function showQueue(key: string) {
    setFilters({ ...initialFilters, item: key });
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <PageHeader
        title="Lista de espera"
        description="Clientes aguardando turma de um serviço ou reposição de um produto."
        action={
          canManage && (
            <button
              type="button"
              className="primary-button"
              disabled={!options}
              onClick={() => setAdding(true)}
            >
              <Plus size={18} /> Adicionar à lista
            </button>
          )
        }
      />
      {error && <ErrorBanner error={error} />}
      {!entries ? (
        !error && <LoadingBlock />
      ) : (
        <>
          <section className="panel" aria-label="Maior procura">
            <div className="panel-head">
              <div>
                <h2>Maior procura</h2>
                <p className="panel-context">
                  {inQueue === 1 ? "1 cliente" : `${inQueue} clientes`} na fila
                  {demand.length > 0 &&
                    ` · ${demand.length === 1 ? "1 item" : `${demand.length} itens`}`}
                </p>
              </div>
            </div>
            {!demand.length ? (
              <EmptyState
                icon={Hourglass}
                title="Ninguém na lista de espera"
                copy="Quando um cliente aguardar turma ou reposição, a procura de cada item aparece aqui, da maior fila para a menor."
              />
            ) : (
              <>
                <div className="metric-grid finance-metrics waitlist-metrics">
                  <article className="metric-card accent">
                    <span>Na fila</span>
                    <strong>{inQueue}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Aguardando aviso</span>
                    <strong>{waiting}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Já avisados</span>
                    <strong>{contacted}</strong>
                  </article>
                  <article className="metric-card">
                    <span>Espera mais longa</span>
                    <strong>{waitingLabel(daysWaiting(oldest!))}</strong>
                  </article>
                </div>
                <div className="table-scroll waitlist-table">
                  <table className="dre-table waitlist-demand">
                    <caption className="sr-only">
                      Itens com fila de espera, da maior para a menor
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className="numeric-value waitlist-rank">
                          #
                        </th>
                        <th scope="col">Item</th>
                        <th scope="col" className="numeric-value">
                          Na fila
                        </th>
                        <th scope="col" className="waitlist-share">
                          Procura
                        </th>
                        <th
                          scope="col"
                          className="numeric-value waitlist-oldest"
                        >
                          Espera mais longa
                        </th>
                        <th scope="col">
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {demand.map((item, index) => (
                        <tr key={item.key}>
                          <td className="numeric-value waitlist-rank">
                            {index + 1}
                          </td>
                          <th scope="row">
                            <span className="waitlist-item">
                              <strong>{item.itemName}</strong>
                              <small>
                                {waitlistKindLabels[item.kind]}
                                {item.contacted > 0 &&
                                  ` · ${item.contacted} ${item.contacted === 1 ? "avisado" : "avisados"}`}
                              </small>
                            </span>
                          </th>
                          <td className="numeric-value">{item.total}</td>
                          <td className="waitlist-share">
                            <meter
                              min={0}
                              max={maxTotal}
                              value={item.total}
                              aria-label={`${item.total} de ${maxTotal}`}
                            />
                          </td>
                          <td className="numeric-value waitlist-oldest">
                            {waitingLabel(daysWaiting(item.oldestSince))}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="secondary-button button-sm"
                              aria-label={`Ver fila de ${item.itemName}`}
                              onClick={() => showQueue(item.key)}
                            >
                              Ver fila
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section
            ref={listRef}
            className="panel"
            aria-label="Clientes na lista de espera"
          >
            <div className="panel-head">
              <div>
                <h2>Clientes na lista</h2>
                <p className="panel-context">
                  {visible.length === 1
                    ? "1 entrada"
                    : `${visible.length} entradas`}{" "}
                  · {statusFilterLabels[filters.status].toLowerCase()}
                </p>
              </div>
            </div>
            <div className="list-toolbar waitlist-toolbar">
              <label className="waitlist-search">
                Cliente
                <span className="waitlist-search-input">
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="Buscar pelo nome"
                    value={filters.search}
                    onChange={(event) =>
                      setFilters({ ...filters, search: event.target.value })
                    }
                  />
                </span>
              </label>
              <label>
                Item
                <select
                  value={filters.item}
                  onChange={(event) =>
                    setFilters({ ...filters, item: event.target.value })
                  }
                >
                  <option value="">Todos os itens</option>
                  {itemOptions.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Situação
                <select
                  value={filters.status}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      status: event.target.value as WaitlistStatusFilter,
                    })
                  }
                >
                  {(
                    Object.keys(statusFilterLabels) as WaitlistStatusFilter[]
                  ).map((key) => (
                    <option key={key} value={key}>
                      {statusFilterLabels[key]}
                    </option>
                  ))}
                </select>
              </label>
              {filtered && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setFilters(initialFilters)}
                >
                  Limpar filtros
                </button>
              )}
            </div>
            {!visible.length ? (
              <EmptyState
                title={
                  all.length ? "Nenhuma entrada encontrada" : "Lista vazia"
                }
                copy={
                  all.length
                    ? "Ajuste a busca ou os filtros para ver outras entradas."
                    : 'Use "Adicionar à lista" para registrar quem aguarda uma turma ou um produto.'
                }
              />
            ) : (
              <div className="table-scroll waitlist-table">
                <table className="dre-table waitlist-clients">
                  <caption className="sr-only">
                    Clientes na lista de espera
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Cliente</th>
                      <th scope="col">Aguardando</th>
                      <th scope="col" className="numeric-value">
                        Posição
                      </th>
                      <th scope="col" className="numeric-value">
                        Na lista há
                      </th>
                      <th scope="col">Situação</th>
                      <th scope="col">Observações</th>
                      <th scope="col">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((entry) => {
                      const position = waitlistPosition(entry, all);
                      return (
                        <tr key={entry.id}>
                          <th scope="row">
                            <span className="waitlist-item">
                              <strong>{entry.patientName}</strong>
                              {entry.patientPhone && (
                                <small>{formatPhone(entry.patientPhone)}</small>
                              )}
                            </span>
                          </th>
                          <td>
                            <span className="waitlist-item">
                              <span>{entry.itemName}</span>
                              <small>{waitlistKindLabels[entry.kind]}</small>
                            </span>
                          </td>
                          <td className="numeric-value">
                            <span className="waitlist-cell-label">
                              Posição{" "}
                            </span>
                            {position ? `${position}º` : "—"}
                          </td>
                          <td className="numeric-value">
                            <span className="waitlist-cell-label">
                              Na lista há{" "}
                            </span>
                            {waitingLabel(daysWaiting(entry.createdAt))}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${statusPillClass[entry.status]}`}
                            >
                              {waitlistStatusLabels[entry.status]}
                            </span>
                          </td>
                          <td
                            className={`waitlist-notes${entry.notes ? "" : " is-empty"}`}
                          >
                            {entry.notes || "—"}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="secondary-button button-sm"
                              aria-label={`Abrir entrada de ${entry.patientName}`}
                              onClick={() => setManaging(entry.id)}
                            >
                              {canManage ? "Atualizar" : "Ver"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {adding && options && (
        <WaitlistEntryModal
          options={options}
          onClose={() => setAdding(false)}
          onSaved={(entry) =>
            reload(
              `${entry.patientName} entrou na lista de espera de ${entry.itemName}.`,
            )
          }
        />
      )}
      {managed && (
        <WaitlistManageModal
          entry={managed}
          position={waitlistPosition(managed, all)}
          canManage={canManage}
          onClose={() => setManaging(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}
