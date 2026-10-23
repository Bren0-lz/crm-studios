import {
  type GroupWorkspace,
  type PatientPlan,
  type Service,
  saoPauloToday,
} from "@crm/contracts";
import { UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency, groupSlotLabel } from "../../shared/lib/formatting";
import { groupRevenueOverview } from "./model";

const money = (cents: number) => currency.format(cents / 100);

/** Visão geral tabelada das turmas: horários, ocupação e faturamento mensal. */
export function GroupsOverviewTab({
  id,
  labelledBy,
  workspace,
  services,
  weekDayNames,
  showRevenue,
}: {
  id: string;
  labelledBy: string;
  workspace: GroupWorkspace;
  services: Service[];
  weekDayNames: string[];
  /** Valores dos planos só para quem consulta planos. */
  showRevenue: boolean;
}) {
  const [plans, setPlans] = useState<PatientPlan[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
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
  const rows = groupRevenueOverview(
    workspace.groups,
    workspace.enrollments,
    plans ?? [],
    services,
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
            <div className="forecast-scroll">
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
                  {rows.map((row) => (
                    <tr key={row.group.id}>
                      <th scope="row">
                        <strong>{row.group.name}</strong>
                        <small>{row.group.professionalName}</small>
                      </th>
                      <td className="groups-overview-schedule">
                        {(row.group.weeklySlots ?? []).length
                          ? row.group.weeklySlots
                              .map((slot) => groupSlotLabel(slot, weekDayNames))
                              .join(", ")
                          : "Horários ainda não definidos"}
                      </td>
                      <td>
                        {row.enrolled} de {row.group.capacity}
                      </td>
                      <td>{row.freeSeats}</td>
                      {revenueReady && (
                        <>
                          <td>{money(row.currentInCents)}</td>
                          <td>{money(row.potentialInCents)}</td>
                        </>
                      )}
                    </tr>
                  ))}
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
