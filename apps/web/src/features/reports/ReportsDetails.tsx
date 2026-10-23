import type { ManagementReport, SatisfactionReport } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency, localIsoDate } from "../../shared/lib/formatting";
import { ClientInsights } from "./ClientInsights";
import { ReportBreakdown } from "./ReportBreakdown";

export function ReportsDetails() {
  const { can, canView } = useAuthorization();
  const canManagement = can("reports.management");
  const canAgenda = canView("agenda");
  const today = localIsoDate();
  const [filter, setFilter] = useState({
    from: `${today.slice(0, 8)}01`,
    to: today,
  });
  const [report, setReport] = useState<ManagementReport | null>(null);
  const [satisfaction, setSatisfaction] = useState<SatisfactionReport | null>(
    null,
  );
  const [satisfactionError, setSatisfactionError] = useState("");
  const [clientPeriod, setClientPeriod] = useState({
    from: `${today.slice(0, 8)}01`,
    to: today,
    version: 0,
  });
  const [loading, setLoading] = useState(canManagement);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  async function loadSatisfaction(from: string, to: string) {
    setSatisfaction(null);
    setSatisfactionError("");
    try {
      setSatisfaction(await api.satisfaction(from, to));
    } catch (cause) {
      setSatisfactionError((cause as Error).message);
    }
  }

  async function load(from = filter.from, to = filter.to) {
    setLoading(true);
    setReport(null);
    setError("");
    setClientPeriod((current) => ({ from, to, version: current.version + 1 }));
    if (canAgenda) void loadSatisfaction(from, to);
    try {
      if (canManagement) setReport(await api.managementReport(from, to));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    const initialTo = localIsoDate();
    const initialFrom = `${initialTo.slice(0, 8)}01`;
    if (canManagement)
      api
        .managementReport(initialFrom, initialTo)
        .then((data) => active && setReport(data))
        .catch((cause: Error) => active && setError(cause.message))
        .finally(() => active && setLoading(false));
    if (canAgenda)
      api
        .satisfaction(initialFrom, initialTo)
        .then((data) => active && setSatisfaction(data))
        .catch((cause: Error) => active && setSatisfactionError(cause.message));
    return () => {
      active = false;
    };
  }, [canManagement, canAgenda]);

  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const blob = await api.managementReportCsv(filter.from, filter.to);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `relatorio-${filter.from}-${filter.to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <details className="report-disclosure report-advanced">
        <summary>Ver outros indicadores da clínica</summary>
        <p>
          Atendimentos, planos, caixa, estoque e resultados por serviço. Escolha
          um período para analisar esses dados.
        </p>
        <section className="report-filter">
          <label>
            De
            <input
              type="date"
              value={filter.from}
              max={filter.to}
              onChange={(event) =>
                setFilter({ ...filter, from: event.target.value })
              }
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={filter.to}
              min={filter.from}
              onChange={(event) =>
                setFilter({ ...filter, to: event.target.value })
              }
            />
          </label>
          <button
            className="primary-button"
            onClick={() => void load()}
            disabled={!filter.from || !filter.to}
          >
            Atualizar
          </button>
          {can("reports.management", "reports.export") && (
            <button
              className="secondary-button"
              disabled={!report || exporting}
              onClick={() => void exportCsv()}
            >
              {exporting ? "Exportando…" : "Exportar CSV"}
            </button>
          )}
        </section>
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
                  {satisfactionError || "Carregando pesquisas de satisfação…"}
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
        <ClientInsights
          key={`${clientPeriod.from}-${clientPeriod.to}-${clientPeriod.version}`}
          from={clientPeriod.from}
          to={clientPeriod.to}
        />
        {loading ? (
          <LoadingBlock />
        ) : report ? (
          <>
            <section className="report-metrics">
              <article>
                <span>Atendimentos</span>
                <strong>{report.appointments.total}</strong>
                <small>{report.appointments.attendanceRate}% de presença</small>
              </article>
              <article>
                <span>Sessões disponíveis</span>
                <strong>{report.plans.availableSessions}</strong>
                <small>{report.plans.active} planos ativos</small>
              </article>
              <article>
                <span>Recebido no período</span>
                <strong>
                  {currency.format(report.finance.paidInPeriodInCents / 100)}
                </strong>
                <small>
                  {currency.format(report.finance.overdueInCents / 100)} em
                  atraso
                </small>
              </article>
              <article>
                <span>Conversão comercial</span>
                <strong>{report.commercial.conversionRate}%</strong>
                <small>
                  {report.commercial.leadsCreated} leads · média de{" "}
                  {report.commercial.averageFirstResponseMinutes} min para
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
                      report.profitability.dre.netResultInCents >= 0
                        ? "positive"
                        : "negative"
                    }
                  >
                    {currency.format(
                      report.profitability.dre.netResultInCents / 100,
                    )}
                  </strong>
                </div>
                <div className="dre-lines">
                  <div>
                    <span>Receita de serviços</span>
                    <strong>
                      {currency.format(
                        report.profitability.dre.serviceRevenueInCents / 100,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Receita de produtos</span>
                    <strong>
                      {currency.format(
                        report.profitability.dre.productRevenueInCents / 100,
                      )}
                    </strong>
                  </div>
                  <div className="dre-total">
                    <span>Receita bruta</span>
                    <strong>
                      {currency.format(
                        report.profitability.dre.grossRevenueInCents / 100,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>(−) Custo dos produtos</span>
                    <strong>
                      {currency.format(
                        report.profitability.dre.productCostInCents / 100,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>(−) Despesas operacionais</span>
                    <strong>
                      {currency.format(
                        report.profitability.dre.operatingExpensesInCents / 100,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>(−) Comissões</span>
                    <strong>
                      {currency.format(
                        report.profitability.dre.commissionsInCents / 100,
                      )}
                    </strong>
                  </div>
                  <div className="dre-total">
                    <span>Resultado líquido</span>
                    <strong>
                      {currency.format(
                        report.profitability.dre.netResultInCents / 100,
                      )}{" "}
                      · {report.profitability.dre.netMargin}%
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
                      {report.profitability.operational.groupOccupancyRate}%
                    </strong>
                    <span>Ocupação das turmas</span>
                    <small>
                      {report.profitability.operational.activeGroupSeats}/
                      {report.profitability.operational.totalGroupCapacity}{" "}
                      vagas
                    </small>
                  </article>
                  <article>
                    <strong>
                      {report.profitability.operational.waitlistCount}
                    </strong>
                    <span>Em lista de espera</span>
                  </article>
                  <article>
                    <strong>
                      {report.profitability.operational.lowStockCount}
                    </strong>
                    <span>Produtos com estoque baixo</span>
                  </article>
                  <article>
                    <strong>
                      {report.profitability.operational.productUnitsSold}
                    </strong>
                    <span>Unidades vendidas</span>
                  </article>
                  <article>
                    <strong>
                      {currency.format(
                        report.profitability.operational.averageReceiptInCents /
                          100,
                      )}
                    </strong>
                    <span>Ticket médio recebido</span>
                  </article>
                </div>
              </div>
            </section>
            <section className="profit-grid">
              <div className="panel profit-table">
                <div className="panel-head">
                  <div>
                    <h2>Rentabilidade por serviço</h2>
                  </div>
                </div>
                {report.profitability.byService.length === 0 ? (
                  <EmptyState
                    title="Sem dados"
                    copy="Não houve produção ou recebimento de serviços no período."
                  />
                ) : (
                  <div className="profit-rows">
                    {report.profitability.byService.map((item) => (
                      <div key={item.id}>
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {item.completedAppointments} atendimentos concluídos
                          </small>
                        </span>
                        <span>
                          {currency.format(item.revenueInCents / 100)} receita
                        </span>
                        <span>
                          {currency.format(item.commissionsInCents / 100)}{" "}
                          comissões
                        </span>
                        <b>
                          {currency.format(item.contributionInCents / 100)} ·{" "}
                          {item.contributionMargin}%
                        </b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="panel profit-table">
                <div className="panel-head">
                  <div>
                    <h2>Rentabilidade por produto</h2>
                  </div>
                </div>
                {report.profitability.byProduct.length === 0 ? (
                  <EmptyState
                    title="Sem vendas"
                    copy="Nenhuma venda de produto foi recebida no período."
                  />
                ) : (
                  <div className="profit-rows">
                    {report.profitability.byProduct.map((item) => (
                      <div key={item.id}>
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.unitsSold} unidades</small>
                        </span>
                        <span>
                          {currency.format(item.revenueInCents / 100)} receita
                        </span>
                        <span>
                          {currency.format(item.costInCents / 100)} custo
                        </span>
                        <b>
                          {currency.format(item.grossProfitInCents / 100)} ·{" "}
                          {item.grossMargin}%
                        </b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
            <div className="report-grid">
              <ReportBreakdown
                title="Por profissional"
                items={report.byProfessional}
                empty="Sem atendimentos de profissionais no período."
              />
              <ReportBreakdown
                title="Por serviço"
                items={report.byService}
                empty="Sem serviços realizados no período."
              />
              <section className="panel report-table source-report">
                <div className="panel-head">
                  <div>
                    <h2>Conversão por origem</h2>
                  </div>
                </div>
                {report.bySource.length === 0 ? (
                  <EmptyState
                    title="Sem leads"
                    copy="Nenhum lead foi criado no período."
                  />
                ) : (
                  <div className="report-rows">
                    {report.bySource.map((item) => (
                      <div key={item.source}>
                        <strong>{item.source}</strong>
                        <span>{item.leads} leads</span>
                        <span>{item.won} ganhos</span>
                        <b>{item.conversionRate}%</b>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <p className="report-definition">
              Presença = concluídos ÷ (concluídos + faltas não justificadas).
              Conversão = ganhos atuais ÷ leads criados no período selecionado.
            </p>
          </>
        ) : null}
      </details>
    </>
  );
}
