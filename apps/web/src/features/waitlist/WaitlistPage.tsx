import {
  formatPhone,
  groupWaitlistItemKey,
  waitlistDemand,
  waitlistItemKey,
  waitlistKindLabels,
  waitlistPosition,
  waitlistStatusLabels,
  withPrefix,
  type GroupWaitlistItem,
  type WaitlistEntry,
  type WaitlistOptions,
} from "@crm/contracts";
import { Hourglass, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { WaitlistContactModal } from "../groups";
import { ActionModal } from "../../shared/components/ActionModal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { useToast } from "../../shared/feedback/toast-context";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { shortDate } from "../../shared/lib/formatting";
import {
  daysWaiting,
  filterGroupWaitlist,
  filterWaitlist,
  groupOfferOpen,
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

/**
 * Lista de espera: quem aguarda turma de um serviço ou reposição de um produto, e a espera das
 * turmas cheias (RE14, matrículas `waitlisted`), com a oferta da vaga e a saída da espera.
 */
export function WaitlistPage() {
  const { can, canEdit, canView } = useAuthorization();
  const toast = useToast();
  const canManage = canEdit("waitlist") && can("waitlist.manage");
  // Espera da turma: oferecer (contato da vaga, como no alerta) e remover seguem as de Turmas.
  const canOffer = canManage && canView("groups") && canView("patients");
  const canRemoveFromGroup =
    canManage && canEdit("groups") && can("groups.cancel_enrollment");
  const [entries, setEntries] = useState<WaitlistEntry[] | null>(null);
  const [groupItems, setGroupItems] = useState<GroupWaitlistItem[] | null>(
    null,
  );
  const [offering, setOffering] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [options, setOptions] = useState<WaitlistOptions | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);
  const [filters, setFilters] = useState(initialFilters);
  const listRef = useRef<HTMLElement>(null);
  const version = useDataVersion("waitlist");
  useEffect(() => {
    let alive = true;
    Promise.all([api.waitlist(), api.groupWaitlist(), api.waitlistOptions()])
      .then(([entryData, groupData, optionData]) => {
        if (!alive) return;
        setEntries(entryData);
        setGroupItems(groupData);
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
    const [entryData, groupData] = await Promise.all([
      api.waitlist(),
      api.groupWaitlist(),
    ]);
    setEntries(entryData);
    setGroupItems(groupData);
    setAdding(false);
    setManaging(null);
    setOffering(null);
    setRemoving(null);
    toast.success(message);
  }

  const all = entries ?? [];
  const groupAll = groupItems ?? [];
  const demand = waitlistDemand(all, groupAll);
  const maxTotal = demand[0]?.total ?? 0;
  const inQueue = demand.reduce((sum, item) => sum + item.total, 0);
  const waiting = demand.reduce((sum, item) => sum + item.waiting, 0);
  const contacted = demand.reduce((sum, item) => sum + item.contacted, 0);
  const oldest = demand.reduce<string | null>(
    (min, item) => (!min || item.oldestSince < min ? item.oldestSince : min),
    null,
  );
  const visible = filterWaitlist(all, filters);
  const visibleGroups = filterGroupWaitlist(groupAll, filters);
  const visibleCount = visible.length + visibleGroups.length;
  const itemOptions = [
    ...new Map([
      ...all.map((entry): [string, string] => [
        waitlistItemKey(entry),
        `${entry.itemName} (${waitlistKindLabels[entry.kind].toLowerCase()})`,
      ]),
      ...groupAll.map((item): [string, string] => [
        groupWaitlistItemKey(item),
        `${item.group.serviceName} (${waitlistKindLabels.service.toLowerCase()})`,
      ]),
    ]),
  ].sort((left, right) => left[1].localeCompare(right[1], "pt-BR"));
  const filtered =
    filters.search !== initialFilters.search ||
    filters.item !== initialFilters.item ||
    filters.status !== initialFilters.status;
  const managed = all.find((entry) => entry.id === managing);
  const offered = groupAll.find((item) => item.enrollment.id === offering);
  const removed = groupAll.find((item) => item.enrollment.id === removing);

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
      {!entries || !groupItems ? (
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
                  {visibleCount === 1
                    ? "1 entrada"
                    : `${visibleCount} entradas`}{" "}
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
            {!visibleCount ? (
              <EmptyState
                title={
                  all.length || groupAll.length
                    ? "Nenhuma entrada encontrada"
                    : "Lista vazia"
                }
                copy={
                  all.length || groupAll.length
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
                    {visibleGroups.map((item) => {
                      const { enrollment, group } = item;
                      const offerOpen = groupOfferOpen(item);
                      const offer = canOffer && offerOpen;
                      return (
                        <tr key={`turma-${enrollment.id}`}>
                          <th scope="row">
                            <span className="waitlist-item">
                              <strong>{enrollment.patientName}</strong>
                            </span>
                          </th>
                          <td>
                            <span className="waitlist-item">
                              <span>{group.name}</span>
                              <small>
                                Espera da turma · {group.serviceName}
                              </small>
                            </span>
                          </td>
                          <td className="numeric-value">
                            <span className="waitlist-cell-label">
                              Posição{" "}
                            </span>
                            {enrollment.queuePosition
                              ? `${enrollment.queuePosition}º`
                              : "—"}
                          </td>
                          <td className="numeric-value">
                            <span className="waitlist-cell-label">
                              Na lista há{" "}
                            </span>
                            {waitingLabel(daysWaiting(enrollment.enrolledAt))}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${statusPillClass.waiting}`}
                            >
                              {waitlistStatusLabels.waiting}
                            </span>
                          </td>
                          <td className="waitlist-notes">
                            Na espera da turma desde{" "}
                            {shortDate.format(new Date(enrollment.enrolledAt))}
                            {offerOpen
                              ? " · vaga aberta"
                              : " · aguardando vaga"}
                          </td>
                          <td>
                            {(offer || canRemoveFromGroup) && (
                              <span className="waitlist-row-actions">
                                {offer && (
                                  <button
                                    type="button"
                                    className="secondary-button button-sm"
                                    aria-label={`Oferecer a vaga a ${enrollment.patientName}`}
                                    onClick={() => setOffering(enrollment.id)}
                                  >
                                    Oferecer a vaga
                                  </button>
                                )}
                                {canRemoveFromGroup && (
                                  <button
                                    type="button"
                                    className="danger-button button-sm"
                                    aria-label={`Remover ${enrollment.patientName} da espera da turma`}
                                    onClick={() => setRemoving(enrollment.id)}
                                  >
                                    Remover da espera
                                  </button>
                                )}
                              </span>
                            )}
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
      {offered && (
        <WaitlistContactModal
          enrollment={offered.enrollment}
          group={offered.group}
          canConfirm={can("groups.enroll")}
          onClose={() => setOffering(null)}
          onConfirmed={() =>
            reload("Matrícula confirmada após aceite do cliente.")
          }
        />
      )}
      {removed && (
        <ActionModal
          eyebrow="Lista de espera"
          title="Remover da espera da turma?"
          subtitle={`${removed.enrollment.patientName} sai da espera da ${withPrefix("turma", removed.group.name)}; quem está atrás sobe uma posição.`}
          confirmLabel="Remover da espera"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await api.cancelGroupEnrollment(removed.enrollment.id);
            await reload(
              `${removed.enrollment.patientName} saiu da espera da ${withPrefix("turma", removed.group.name)}.`,
            );
          }}
        />
      )}
    </>
  );
}
