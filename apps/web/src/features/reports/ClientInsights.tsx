import type { ClientReport, RetentionReport } from "@crm/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency } from "../../shared/lib/formatting";
import { formatCompetence } from "../finance/index";
import { formatRate } from "./model";

export function ClientInsights({ from, to }: { from: string; to: string }) {
  const { can } = useAuthorization();
  const canRetention = can("reports.retention");
  const canClients = can("reports.clients");
  const [retention, setRetention] = useState<RetentionReport | null>(null);
  const [retentionError, setRetentionError] = useState("");
  const [clients, setClients] = useState<ClientReport | null>(null);
  const [clientsError, setClientsError] = useState("");

  useEffect(() => {
    let active = true;
    if (canRetention)
      api
        .retentionReport(from, to)
        .then((data) => active && setRetention(data))
        .catch((cause: Error) => active && setRetentionError(cause.message));
    if (canClients)
      api
        .clientReport(from, to)
        .then((data) => active && setClients(data))
        .catch((cause: Error) => active && setClientsError(cause.message));
    return () => {
      active = false;
    };
  }, [from, to, canRetention, canClients]);

  const clientsBody = (content: (report: ClientReport) => ReactNode) =>
    clientsError ? (
      <ErrorBanner error={clientsError} />
    ) : clients ? (
      content(clients)
    ) : (
      <LoadingBlock />
    );

  return (
    <section className="client-insights">
      {canRetention && (
        <section className="panel report-table retention-report">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Clientes</span>
              <h2>Retenção mês a mês</h2>
            </div>
          </div>
          {retentionError ? (
            <ErrorBanner error={retentionError} />
          ) : !retention ? (
            <LoadingBlock />
          ) : retention.months.length === 0 ? (
            <EmptyState
              title="Sem meses"
              copy="Nenhum mês do período pode ser analisado."
            />
          ) : (
            <>
              <div className="forecast-scroll retention-scroll">
                <table className="forecast-table">
                  <thead>
                    <tr>
                      <th scope="col">Mês</th>
                      <th scope="col">Ativos</th>
                      <th scope="col">Novos</th>
                      <th scope="col">Perdidos</th>
                      <th scope="col">Retenção</th>
                      <th scope="col">Planos cancelados</th>
                      <th scope="col">Valor cancelado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retention.months.map((item) => (
                      <tr key={item.month}>
                        <th scope="row">{formatCompetence(item.month)}</th>
                        <td>{item.activeClients}</td>
                        <td>{item.newClients}</td>
                        <td>{item.lostClients}</td>
                        <td>{formatRate(item.retentionRate)}</td>
                        <td>{item.cancelledPlans}</td>
                        <td>
                          {currency.format(item.cancelledValueInCents / 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="retention-summary">
                No período: {retention.totals.newClients} novos ·{" "}
                {retention.totals.lostClients} perdidos ·{" "}
                {retention.totals.cancelledPlans} planos cancelados (
                {currency.format(retention.totals.cancelledValueInCents / 100)}
                ). Retenção = ativos do mês anterior que continuaram ativos.
              </p>
            </>
          )}
        </section>
      )}
      {canClients && (
        <div className="report-grid client-rankings">
          <section className="panel report-table">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Ranking</span>
                <h2>Mais sessões concluídas</h2>
              </div>
            </div>
            {clientsBody((report) =>
              report.topBySessions.length === 0 ? (
                <EmptyState
                  title="Sem sessões"
                  copy="Nenhum cliente com sessão concluída no período."
                />
              ) : (
                <div className="report-rows ranking-rows">
                  {report.topBySessions.map((item, index) => (
                    <div key={item.patientId}>
                      <strong>
                        {index + 1}. {item.patientName}
                      </strong>
                      <b>
                        {item.completedSessions}{" "}
                        {item.completedSessions === 1 ? "sessão" : "sessões"}
                      </b>
                    </div>
                  ))}
                </div>
              ),
            )}
          </section>
          <section className="panel report-table">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Ranking</span>
                <h2>Mais recebimentos</h2>
              </div>
            </div>
            {clientsBody((report) =>
              report.topByRevenue.length === 0 ? (
                <EmptyState
                  title="Sem recebimentos"
                  copy="Nenhum recebimento de cliente no período."
                />
              ) : (
                <div className="report-rows ranking-rows">
                  {report.topByRevenue.map((item, index) => (
                    <div key={item.patientId}>
                      <strong>
                        {index + 1}. {item.patientName}
                      </strong>
                      <b>{currency.format(item.receivedInCents / 100)}</b>
                    </div>
                  ))}
                </div>
              ),
            )}
          </section>
          <section className="panel report-table source-report">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Perfil</span>
                <h2>Faixa etária</h2>
              </div>
            </div>
            {clientsBody((report) =>
              report.activeClients === 0 ? (
                <EmptyState
                  title="Sem clientes ativos"
                  copy="Nenhum cliente ativo no período."
                />
              ) : (
                <>
                  <div className="report-rows age-rows">
                    {report.ageDistribution.map((item) => (
                      <div key={item.band}>
                        <strong>{item.label}</strong>
                        <span>
                          {Math.round(
                            (item.clients / report.activeClients) * 100,
                          )}
                          %
                        </span>
                        <b>{item.clients}</b>
                      </div>
                    ))}
                  </div>
                  <p className="retention-summary">
                    {report.activeClients} clientes ativos no período, com a
                    idade na data final.
                  </p>
                </>
              ),
            )}
          </section>
        </div>
      )}
    </section>
  );
}
