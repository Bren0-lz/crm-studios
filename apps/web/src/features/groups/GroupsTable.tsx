import {
  type GroupWorkspace,
  type PatientPlan,
  type Service,
  saoPauloToday,
} from "@crm/contracts";
import { ChevronDown, Search, UsersRound } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import {
  currency,
  groupSlotLabel,
  shortDate,
} from "../../shared/lib/formatting";
import {
  type GroupTableFilters,
  emptyGroupTableFilters,
  filterGroupRows,
  groupRevenueOverview,
  hasGroupTableFilters,
} from "./model";

const money = (cents: number) => currency.format(cents / 100);
/** "AAAA-MM-DD" → "05 de jan.", ao meio-dia UTC para não mudar de dia com o fuso. */
const isoDayLabel = (date: string) =>
  shortDate.format(new Date(`${date}T12:00:00Z`));

/** Opções únicas (id + nome) tiradas das próprias turmas, em ordem alfabética. */
function uniqueOptions(entries: { id: string; name: string }[]) {
  const byId = new Map(entries.map((entry) => [entry.id, entry.name]));
  return [...byId]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Tabela das turmas com filtros: horários, ocupação e faturamento mensal. */
export function GroupsTable({
  id,
  workspace,
  services,
  weekDayNames,
  showRevenue,
  onOpen,
  emptyAction,
}: {
  id: string;
  workspace: GroupWorkspace;
  services: Service[];
  weekDayNames: string[];
  /** Valores dos planos só para quem consulta planos. */
  showRevenue: boolean;
  onOpen: (group: GroupWorkspace["groups"][number]) => void;
  /** Ação do estado vazio (ex.: "Criar primeira turma"). */
  emptyAction?: ReactNode;
}) {
  const [filters, setFilters] = useState<GroupTableFilters>(
    emptyGroupTableFilters,
  );
  const updateFilter = <K extends keyof GroupTableFilters>(
    key: K,
    value: GroupTableFilters[K],
  ) => setFilters((current) => ({ ...current, [key]: value }));
  const [plans, setPlans] = useState<PatientPlan[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Turmas com a lista de matriculados aberta logo abaixo da linha.
  const [expanded, setExpanded] = useState<string[]>([]);
  const toggleMembers = (groupId: string) =>
    setExpanded((current) =>
      current.includes(groupId)
        ? current.filter((item) => item !== groupId)
        : [...current, groupId],
    );
  useEffect(() => {
    if (!showRevenue) return;
    let active = true;
    api.plans().then(
      (data) => {
        if (active) setPlans(data);
      },
      (cause: unknown) => {
        if (active) setError((cause as Error).message);
      },
    );
    return () => {
      active = false;
    };
  }, [showRevenue, attempt]);
  const revenueReady = showRevenue && plans !== null;
  const allRows = groupRevenueOverview(
    workspace.groups,
    workspace.enrollments,
    plans ?? [],
    services,
    saoPauloToday(),
  );
  const rows = filterGroupRows(allRows, filters);
  const filtered = hasGroupTableFilters(filters);
  const professionalOptions = uniqueOptions(
    workspace.groups.map((group) => ({
      id: group.professionalId,
      name: group.professionalName,
    })),
  );
  const serviceOptions = uniqueOptions(
    workspace.groups.map((group) => ({
      id: group.serviceId,
      name: group.serviceName,
    })),
  );
  const columns = revenueReady ? 7 : 5;
  const total = (pick: (row: (typeof rows)[number]) => number) =>
    rows.reduce((sum, row) => sum + pick(row), 0);
  return (
    <section
      className="panel groups-wide"
      id={id}
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`}>Turmas</h2>
      <p className="group-panel-copy">
        Horários, ocupação e faturamento mensal de cada turma.
      </p>
      {workspace.groups.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Nenhuma turma cadastrada"
          copy="Crie a primeira turma para matricular clientes e controlar a ocupação."
          action={emptyAction}
        />
      ) : (
        <>
          <div
            className="groups-filters"
            role="search"
            aria-label="Filtrar turmas"
          >
            <label className="search-box groups-filters-search">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar turma ou profissional"
                placeholder="Buscar turma ou profissional"
                value={filters.search}
                onChange={(event) => updateFilter("search", event.target.value)}
              />
            </label>
            <label className="filter-group">
              <span className="filter-label">Profissional</span>
              <select
                value={filters.professionalId}
                onChange={(event) =>
                  updateFilter("professionalId", event.target.value)
                }
              >
                <option value="">Todos</option>
                {professionalOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-group">
              <span className="filter-label">Serviço</span>
              <select
                value={filters.serviceId}
                onChange={(event) =>
                  updateFilter("serviceId", event.target.value)
                }
              >
                <option value="">Todos</option>
                {serviceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-group">
              <span className="filter-label">Dia da semana</span>
              <select
                value={filters.weekday}
                onChange={(event) =>
                  updateFilter("weekday", event.target.value)
                }
              >
                <option value="">Todos</option>
                {weekDayNames.map((name, weekday) => (
                  <option key={name} value={String(weekday)}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-group">
              <span className="filter-label">Ocupação</span>
              <select
                value={filters.occupancy}
                onChange={(event) =>
                  updateFilter(
                    "occupancy",
                    event.target.value as GroupTableFilters["occupancy"],
                  )
                }
              >
                <option value="all">Todas</option>
                <option value="available">Com vagas</option>
                <option value="full">Lotadas</option>
              </select>
            </label>
            {filtered && (
              <button
                type="button"
                className="secondary-button button-sm groups-filters-clear"
                onClick={() => setFilters(emptyGroupTableFilters)}
              >
                Limpar filtros
              </button>
            )}
          </div>
          {error && (
            <div className="groups-overview-error">
              <ErrorBanner error={error} />
              <button
                type="button"
                className="secondary-button button-sm"
                onClick={() => {
                  setError("");
                  setAttempt((value) => value + 1);
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {showRevenue && plans === null && !error ? (
            <LoadingBlock />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="Nenhuma turma encontrada"
              copy="Mude a busca ou os filtros para ver outras turmas."
            />
          ) : (
            <div className="forecast-scroll groups-overview-scroll">
              <table
                className="forecast-table groups-overview-table"
                aria-label="Turmas"
              >
                <thead>
                  <tr>
                    <th scope="col">Turma</th>
                    <th scope="col">Horários</th>
                    <th scope="col">Matriculados</th>
                    <th scope="col">Vagas disponíveis</th>
                    {revenueReady && (
                      <>
                        <th scope="col">Faturamento atual</th>
                        <th scope="col">Potencial (turma cheia)</th>
                      </>
                    )}
                    <th scope="col">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const open = expanded.includes(row.group.id);
                    const membersId = `${id}-${row.group.id}-members`;
                    return (
                      <Fragment key={row.group.id}>
                        <tr>
                          <th scope="row">
                            <strong>{row.group.name}</strong>
                            <small>{row.group.professionalName}</small>
                          </th>
                          <td className="groups-overview-schedule">
                            {(row.group.weeklySlots ?? []).length
                              ? row.group.weeklySlots
                                  .map((slot) =>
                                    groupSlotLabel(slot, weekDayNames),
                                  )
                                  .join(", ")
                              : "Horários ainda não definidos"}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="text-button groups-overview-members-toggle"
                              aria-expanded={open}
                              aria-controls={membersId}
                              aria-label={`${open ? "Ocultar" : "Ver"} matriculados de ${row.group.name}: ${row.enrolled} de ${row.group.capacity}`}
                              onClick={() => toggleMembers(row.group.id)}
                            >
                              {row.enrolled} de {row.group.capacity}
                              <ChevronDown size={16} aria-hidden="true" />
                            </button>
                          </td>
                          <td>{row.freeSeats}</td>
                          {revenueReady && (
                            <>
                              <td>{money(row.currentInCents)}</td>
                              <td>{money(row.potentialInCents)}</td>
                            </>
                          )}
                          <td>
                            <button
                              type="button"
                              className="secondary-button button-sm"
                              onClick={() => onOpen(row.group)}
                            >
                              Abrir turma
                            </button>
                          </td>
                        </tr>
                        {open && (
                          <tr
                            id={membersId}
                            className="groups-overview-members-row"
                          >
                            <td colSpan={columns}>
                              {row.members.length === 0 ? (
                                <p>Nenhum cliente matriculado.</p>
                              ) : (
                                <ul
                                  className="groups-overview-members"
                                  aria-label={`Matriculados de ${row.group.name}`}
                                >
                                  {row.members.map((member) => (
                                    <li key={member.enrollment.id}>
                                      <strong>
                                        {member.enrollment.patientName}
                                      </strong>
                                      <small>
                                        Desde{" "}
                                        {isoDayLabel(
                                          member.enrollment.startsOn,
                                        )}
                                        {revenueReady &&
                                          ` · ${
                                            member.monthlyInCents === null
                                              ? "Sem plano ativo"
                                              : `${money(member.monthlyInCents)}/mês`
                                          }`}
                                      </small>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td />
                    <td>
                      {total((row) => row.enrolled)} de{" "}
                      {total((row) => row.group.capacity)}
                    </td>
                    <td>{total((row) => row.freeSeats)}</td>
                    {revenueReady && (
                      <>
                        <td>{money(total((row) => row.currentInCents))}</td>
                        <td>{money(total((row) => row.potentialInCents))}</td>
                      </>
                    )}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {revenueReady && rows.length > 0 && (
            <p className="group-panel-copy groups-overview-note">
              Valores por mês. O faturamento atual soma, para cada matriculado,
              o valor por sessão do plano ativo que cobre o serviço da turma
              multiplicado pelos encontros do mês (horários semanais × 4). O
              potencial acrescenta as vagas disponíveis pelo valor médio dos
              matriculados com plano (sem nenhum, pelo preço avulso do serviço).
            </p>
          )}
        </>
      )}
    </section>
  );
}
