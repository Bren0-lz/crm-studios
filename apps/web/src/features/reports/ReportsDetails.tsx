import type { ManagementReport } from "@crm/contracts";
import { useState, type ReactNode } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency } from "../../shared/lib/formatting";
import { useReportQuery, type ReportPeriod } from "./useReportQuery";
import { ProfitTables } from "./ProfitTables";
import { ReportBreakdown } from "./ReportBreakdown";
import { ReportTabs } from "./ReportTabs";
import { SalesInsights } from "./SalesInsights";

export function ReportsDetails({ period }: { period: ReportPeriod }) {
  const { can, canView } = useAuthorization();
  const canManagement = can("reports.management");
  const canAgenda =
    canView("agenda") &&
    (canManagement || can("reports.clients") || can("reports.retention"));
  const {
    data: report,
    loading,
    error: loadError,
  } = useReportQuery(period, api.managementReport, canManagement);
  const { data: satisfaction, error: satisfactionError } = useReportQuery(
    period,
    api.satisfaction,
    canAgenda,
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState({ period, message: "" });
  const filter = period;
  const error =
    loadError || (exportError.period === period ? exportError.message : "");
  async function exportCsv() {
    setExporting(true);
    setExportError({ period, message: "" });
    try {
      const blob = await api.managementReportCsv(filter.from, filter.to);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `relatorio-${filter.from}-${filter.to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError({ period, message: (cause as Error).message });
    } finally {
      setExporting(false);
    }
  }

  const canSales = can("reports.sales");
  const views = [
    { key: "sales" as const, label: "Vendas", visible: canSales },
    {
      key: "indicators" as const,
      label: "Indicadores",
      visible: canManagement || canAgenda,
    },
    {
      key: "profitability" as const,
      label: "Rentabilidade",
      visible: canManagement,
    },
    {
      key: "performance" as const,
      label: "Equipe e origens",
      visible: canManagement,
    },
  ].filter((view) => view.visible);
  const managementBody = (
    content: (data: ManagementReport) => ReactNode,
    showError = true,
  ) =>
    loading ? (
      <LoadingBlock />
    ) : report ? (
      content(report)
    ) : showError && loadError ? (
      <ErrorBanner error={loadError} />
    ) : null;

  return (
    <ReportTabs sub label="Seções da visão geral" tabs={views}>
      {(view) =>
        view === "sales" ? (
          <SalesInsights period={period} mode="overview" />
        ) : view === "indicators" ? (
          <section className="reports-management">
            <div className="reports-section-heading">
              <div>
                <h2>Indicadores da clínica</h2>
                <p className="panel-context">
                  Satisfação, experimentais, atendimentos, caixa e operação.
                </p>
              </div>
              {can("reports.management", "reports.export") && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!report || exporting}
                  onClick={() => void exportCsv()}
                >
                  {exporting ? "Exportando…" : "Exportar CSV"}
                </button>
              )}
            </div>
            {error && <ErrorBanner error={error} />}
            <section className="report-metrics">
              {canAgenda && (
                <article>
                  <span>Satisfação (NPS)</span>
                  {satisfaction ? (
                    <>
                      <strong>
                        {satisfaction.summary.nps === null
                          ? "—"
                          : satisfaction.summary.nps}
                      </strong>
                      <small>
                        {satisfaction.summary.total} respostas ·{" "}
                        {satisfaction.summary.promoters} promotores ·{" "}
                        {satisfaction.summary.passives} neutros ·{" "}
                        {satisfaction.summary.detractors} detratores
                      </small>
                    </>
                  ) : (
                    <small>
                      {satisfactionError ||
                        "Carregando pesquisas de satisfação…"}
                    </small>
                  )}
                </article>
              )}
              {canManagement && (
                <article>
                  <span>Experimentais</span>
                  {report ? (
                    <>
                      <strong>
                        {report.trials.completed
                          ? `${report.trials.conversionRate}%`
                          : "—"}
                      </strong>
                      <small>
                        {report.trials.completed
                          ? `${report.trials.scheduled} agendadas · ${report.trials.completed} concluídas · ${report.trials.converted} viraram plano em até 30 dias`
                          : `${report.trials.scheduled} agendadas · nenhuma concluída no período`}
                      </small>
                    </>
                  ) : (
                    <small>
                      {loading
                        ? "Carregando experimentais…"
                        : "Não foi possível carregar as experimentais."}
                    </small>
                  )}
                </article>
              )}
            </section>
            {canManagement &&
              managementBody(
                (data) => (
                  <>
                    <section className="report-metrics">
                      <article>
                        <span>Atendimentos</span>
                        <strong>{data.appointments.total}</strong>
                        <small>
                          {data.appointments.attendanceRate}% de presença
                        </small>
                      </article>
                      <article>
                        <span>Sessões disponíveis</span>
                        <strong>{data.plans.availableSessions}</strong>
                        <small>{data.plans.active} planos ativos</small>
                      </article>
                      <article>
                        <span>Recebido no período</span>
                        <strong>
                          {currency.format(
                            data.finance.paidInPeriodInCents / 100,
                          )}
                        </strong>
                        <small>
                          {currency.format(data.finance.overdueInCents / 100)}{" "}
                          em atraso
                        </small>
                      </article>
                      <article>
                        <span>Conversão comercial</span>
                        <strong>{data.commercial.conversionRate}%</strong>
                        <small>
                          {data.commercial.leadsCreated} leads · média de{" "}
                          {data.commercial.averageFirstResponseMinutes} min para
                          resposta
                        </small>
                      </article>
                    </section>
                    <section className="dre-section">
                      <div className="panel dre-card">
                        <div className="panel-head">
                          <div>
                            <h2>DRE básica por caixa</h2>
                          </div>
                          <strong
                            className={
                              data.profitability.dre.netResultInCents >= 0
                                ? "positive"
                                : "negative"
                            }
                          >
                            {currency.format(
                              data.profitability.dre.netResultInCents / 100,
                            )}
                          </strong>
                        </div>
                        <div className="dre-lines">
                          <div>
                            <span>Receita de serviços</span>
                            <strong>
                              {currency.format(
                                data.profitability.dre.serviceRevenueInCents /
                                  100,
                              )}
                            </strong>
                          </div>
                          <div>
                            <span>Receita de produtos</span>
                            <strong>
                              {currency.format(
                                data.profitability.dre.productRevenueInCents /
                                  100,
                              )}
                            </strong>
                          </div>
                          <div className="dre-total">
                            <span>Receita bruta</span>
                            <strong>
                              {currency.format(
                                data.profitability.dre.grossRevenueInCents /
                                  100,
                              )}
                            </strong>
                          </div>
                          <div>
                            <span>(−) Custo dos produtos</span>
                            <strong>
                              {currency.format(
                                data.profitability.dre.productCostInCents / 100,
                              )}
                            </strong>
                          </div>
                          <div>
                            <span>(−) Despesas operacionais</span>
                            <strong>
                              {currency.format(
                                data.profitability.dre
                                  .operatingExpensesInCents / 100,
                              )}
                            </strong>
                          </div>
                          <div>
                            <span>(−) Comissões</span>
                            <strong>
                              {currency.format(
                                data.profitability.dre.commissionsInCents / 100,
                              )}
                            </strong>
                          </div>
                          <div className="dre-total">
                            <span>Resultado líquido</span>
                            <strong>
                              {currency.format(
                                data.profitability.dre.netResultInCents / 100,
                              )}{" "}
                              · {data.profitability.dre.netMargin}%
                            </strong>
                          </div>
                        </div>
                      </div>
                      <div className="panel operation-card">
                        <div className="panel-head">
                          <div>
                            <h2>Indicadores operacionais</h2>
                          </div>
                        </div>
                        <div className="operation-metrics">
                          <article>
                            <strong>
                              {
                                data.profitability.operational
                                  .groupOccupancyRate
                              }
                              %
                            </strong>
                            <span>Ocupação das turmas</span>
                            <small>
                              {data.profitability.operational.activeGroupSeats}/
                              {
                                data.profitability.operational
                                  .totalGroupCapacity
                              }{" "}
                              vagas
                            </small>
                          </article>
                          <article>
                            <strong>
                              {data.profitability.operational.waitlistCount}
                            </strong>
                            <span>Em lista de espera</span>
                          </article>
                          <article>
                            <strong>
                              {data.profitability.operational.lowStockCount}
                            </strong>
                            <span>Produtos com estoque baixo</span>
                          </article>
                          <article>
                            <strong>
                              {data.profitability.operational.productUnitsSold}
                            </strong>
                            <span>Unidades vendidas</span>
                          </article>
                          <article>
                            <strong>
                              {currency.format(
                                data.profitability.operational
                                  .averageReceiptInCents / 100,
                              )}
                            </strong>
                            <span>Ticket médio recebido</span>
                          </article>
                        </div>
                      </div>
                    </section>
                  </>
                ),
                false,
              )}
          </section>
        ) : view === "profitability" ? (
          managementBody((data) => <ProfitTables report={data} />)
        ) : (
          managementBody((data) => (
            <>
              <div className="report-grid">
                <ReportBreakdown
                  title="Por profissional"
                  items={data.byProfessional}
                  empty="Sem atendimentos de profissionais no período."
                />
                <ReportBreakdown
                  title="Por serviço"
                  items={data.byService}
                  empty="Sem serviços realizados no período."
                />
                <section className="panel report-table source-report">
                  <div className="panel-head">
                    <div>
                      <h2>Conversão por origem</h2>
                    </div>
                  </div>
                  {data.bySource.length === 0 ? (
                    <EmptyState
                      title="Sem leads"
                      copy="Nenhum lead foi criado no período."
                    />
                  ) : (
                    <div className="table-scroll">
                      <table className="dre-table">
                        <caption>Conversão por origem no período</caption>
                        <thead>
                          <tr>
                            <th scope="col">Origem</th>
                            <th scope="col" className="numeric-value">
                              Leads
                            </th>
                            <th scope="col" className="numeric-value">
                              Ganhos
                            </th>
                            <th scope="col" className="numeric-value">
                              Conversão
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.bySource.map((item) => (
                            <tr key={item.source}>
                              <th scope="row">{item.source}</th>
                              <td className="numeric-value">{item.leads}</td>
                              <td className="numeric-value">{item.won}</td>
                              <td className="numeric-value">
                                {item.conversionRate}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
              <p className="report-definition">
                Presença = concluídos ÷ (concluídos + faltas não justificadas).
                Conversão = ganhos atuais ÷ leads criados no período
                selecionado.
              </p>
            </>
          ))
        )
      }
    </ReportTabs>
  );
}
