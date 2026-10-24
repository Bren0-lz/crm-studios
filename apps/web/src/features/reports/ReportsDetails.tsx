import type { ManagementReport } from "@crm/contracts";
import { useState, type ReactNode } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useReportQuery, type ReportPeriod } from "./useReportQuery";
import { ClinicIndicators } from "./ClinicIndicators";
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
                <h2>Como a clínica foi no período</h2>
                <p className="panel-context">
                  Dinheiro, atendimentos, turmas e satisfação dos clientes.
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
            <ClinicIndicators
              report={report}
              loading={loading}
              satisfaction={satisfaction}
              satisfactionError={satisfactionError}
              canAgenda={canAgenda}
              canManagement={canManagement}
            />
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
