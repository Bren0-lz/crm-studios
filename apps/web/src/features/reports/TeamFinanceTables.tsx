import type { ManagementReport, TeamFinanceReport } from "@crm/contracts";
import { currency } from "../../shared/lib/formatting";
import { EmptyState } from "../../shared/components/EmptyState";

const money = (value: number) => currency.format(value / 100);
const competenceLabel = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const competences = (months: string[]) =>
  months
    .map((month) => competenceLabel.format(new Date(`${month}-01T12:00:00Z`)))
    .join(", ");

function commissionDetail(
  commission: TeamFinanceReport["byProfessional"][number]["commission"],
) {
  return [
    commission.paidInCents ? `pago ${money(commission.paidInCents)}` : "",
    commission.openInCents ? `a pagar ${money(commission.openInCents)}` : "",
    commission.pendingInCents
      ? `previsto ${money(commission.pendingInCents)}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function TeamFinanceTables({
  report,
  team,
}: {
  report: ManagementReport;
  team: TeamFinanceReport;
}) {
  const counts = new Map(report.byProfessional.map((item) => [item.id, item]));
  const professionals = [
    ...team.byProfessional,
    ...report.byProfessional
      .filter((item) => !team.byProfessional.some((row) => row.id === item.id))
      .map((item) => ({
        id: item.id,
        name: item.name,
        completedSessions: 0,
        generatedInCents: 0,
        commission: {
          paidInCents: 0,
          openInCents: 0,
          pendingInCents: 0,
          totalInCents: 0,
        },
      })),
  ];
  const received = new Map(
    report.profitability.byService.map((item) => [
      item.id,
      item.revenueInCents,
    ]),
  );
  const services = [
    ...team.byService,
    ...report.profitability.byService
      .filter(
        (item) =>
          item.revenueInCents > 0 &&
          !team.byService.some((row) => row.id === item.id),
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        completedSessions: 0,
        generatedInCents: 0,
        averageTicketInCents: 0,
      })),
  ];
  const months = competences(team.commissionMonths);

  return (
    <>
      <section className="panel report-table source-report">
        <div className="panel-head">
          <div>
            <h2>Por profissional</h2>
            <p className="panel-context">Comissão de {months}.</p>
          </div>
        </div>
        {!professionals.length ? (
          <EmptyState
            title="Sem movimento"
            copy="Sem atendimentos de profissionais no período."
          />
        ) : (
          <div className="table-scroll">
            <table className="dre-table">
              <caption>Produção e comissão por profissional no período</caption>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col" className="numeric-value">
                    Atendimentos
                  </th>
                  <th scope="col" className="numeric-value">
                    Presença
                  </th>
                  <th scope="col" className="numeric-value">
                    Gerado
                  </th>
                  <th scope="col" className="numeric-value">
                    Comissão
                  </th>
                </tr>
              </thead>
              <tbody>
                {professionals.map((item) => {
                  const count = counts.get(item.id);
                  const detail = commissionDetail(item.commission);
                  return (
                    <tr key={item.id}>
                      <th scope="row">
                        {item.name}
                        <small className="reports-cell-detail">
                          {item.completedSessions} sessões concluídas, com
                          turmas
                          {count?.noShows ? ` · ${count.noShows} faltas` : ""}
                        </small>
                      </th>
                      <td className="numeric-value">
                        {count?.appointments ?? 0}
                      </td>
                      <td className="numeric-value">
                        {count ? `${count.attendanceRate}%` : "—"}
                      </td>
                      <td className="numeric-value">
                        {money(item.generatedInCents)}
                      </td>
                      <td className="numeric-value">
                        {money(item.commission.totalInCents)}
                        {detail && (
                          <small className="reports-cell-detail">
                            {detail}
                          </small>
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
      <section className="panel report-table source-report">
        <div className="panel-head">
          <h2>Por serviço</h2>
        </div>
        {!services.length ? (
          <EmptyState
            title="Sem movimento"
            copy="Sem serviços realizados no período."
          />
        ) : (
          <div className="table-scroll">
            <table className="dre-table">
              <caption>Produção e recebimento por serviço no período</caption>
              <thead>
                <tr>
                  <th scope="col">Serviço</th>
                  <th scope="col" className="numeric-value">
                    Sessões
                  </th>
                  <th scope="col" className="numeric-value">
                    Gerado
                  </th>
                  <th scope="col" className="numeric-value">
                    Recebido
                  </th>
                  <th scope="col" className="numeric-value">
                    Valor médio
                  </th>
                </tr>
              </thead>
              <tbody>
                {services.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">{item.name}</th>
                    <td className="numeric-value">{item.completedSessions}</td>
                    <td className="numeric-value">
                      {money(item.generatedInCents)}
                    </td>
                    <td className="numeric-value">
                      {money(received.get(item.id) ?? 0)}
                    </td>
                    <td className="numeric-value">
                      {money(item.averageTicketInCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel report-table source-report">
        <div className="panel-head">
          <div>
            <h2>Turmas</h2>
            <p className="panel-context">
              Valores mensais pelas matrículas ativas de hoje.
            </p>
          </div>
        </div>
        {!team.byGroup.length ? (
          <EmptyState title="Sem turmas" copy="Nenhuma turma ativa." />
        ) : (
          <div className="table-scroll">
            <table className="dre-table">
              <caption>Rendimento mensal e potencial por turma</caption>
              <thead>
                <tr>
                  <th scope="col">Turma</th>
                  <th scope="col" className="numeric-value">
                    Ocupação
                  </th>
                  <th scope="col" className="numeric-value">
                    Rende por mês
                  </th>
                  <th scope="col" className="numeric-value">
                    Potencial cheia
                  </th>
                  <th scope="col" className="numeric-value">
                    Deixa de render
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.byGroup.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">
                      {item.name}
                      <small className="reports-cell-detail">
                        {item.serviceName} · {item.professionalName} ·{" "}
                        {item.monthlySessions} aulas por mês
                      </small>
                    </th>
                    <td className="numeric-value">
                      {item.activeEnrollments}/{item.capacity}
                      <small className="reports-cell-detail">
                        {item.occupancyRate}%
                      </small>
                    </td>
                    <td className="numeric-value">
                      {money(item.monthlyRevenueInCents)}
                    </td>
                    <td className="numeric-value">
                      {money(item.potentialRevenueInCents)}
                    </td>
                    <td className="numeric-value">
                      {money(item.idleRevenueInCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
