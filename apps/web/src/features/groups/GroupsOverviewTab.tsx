import {
  type GroupWorkspace,
  type PatientPlan,
  type PlanTemplate,
  saoPauloToday,
  singlePlanSessionPrices,
} from "@crm/contracts";
import { ChevronDown, UsersRound } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import {
  currency,
  groupSlotLabel,
  shortDate,
} from "../../shared/lib/formatting";
import { groupRevenueOverview } from "./model";

const money = (cents: number) => currency.format(cents / 100);
/** "AAAA-MM-DD" → "05 de jan.", ao meio-dia UTC para não mudar de dia com o fuso. */
const isoDayLabel = (date: string) =>
  shortDate.format(new Date(`${date}T12:00:00Z`));

/** Visão geral tabelada das turmas: horários, ocupação e faturamento mensal. */
export function GroupsOverviewTab({
  id,
  labelledBy,
  workspace,
  weekDayNames,
  showRevenue,
}: {
  id: string;
  labelledBy: string;
  workspace: GroupWorkspace;
  weekDayNames: string[];
  /** Valores dos planos só para quem consulta planos. */
  showRevenue: boolean;
}) {
  const [plans, setPlans] = useState<PatientPlan[] | null>(null);
  // Vagas livres sem matriculado com plano valem a sessão do plano avulso do serviço.
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
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
    Promise.all([api.plans(), api.planTemplates()]).then(
      ([data, models]) => {
        if (!active) return;
        setTemplates(models);
        setPlans(data);
      },
      (cause: unknown) => {
        if (active) setError((cause as Error).message);
      },
    );
    return () => {
      active = false;
    };
  }, [showRevenue, attempt]);
  const rows = groupRevenueOverview(
    workspace.groups,
    workspace.enrollments,
    plans ?? [],
    singlePlanSessionPrices(templates),
    saoPauloToday(),
  );
  const revenueReady = showRevenue && plans !== null;
  const total = (pick: (row: (typeof rows)[number]) => number) =>
    rows.reduce((sum, row) => sum + pick(row), 0);
  return (
    <section
      className="panel groups-wide"
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
    >
      <h2>Visão geral</h2>
      <p className="group-panel-copy">
        Horários, ocupação e faturamento mensal de cada turma.
      </p>
      {workspace.groups.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Nenhuma turma cadastrada"
          copy="As turmas criadas aparecem aqui com ocupação e faturamento."
        />
      ) : (
        <>
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
          ) : (
            <div className="forecast-scroll groups-overview-scroll">
              <table
                className="forecast-table groups-overview-table"
                aria-label="Visão geral das turmas"
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
                        </tr>
                        {open && (
                          <tr
                            id={membersId}
                            className="groups-overview-members-row"
                          >
                            <td colSpan={revenueReady ? 6 : 4}>
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
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {revenueReady && (
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
