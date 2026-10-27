import { useEffect, useState } from "react";
import {
  patientFirstName,
  whatsappLink,
  type PatientWithoutReturn,
} from "@crm/contracts";
import { Download, History, MessageCircle, Search, X } from "lucide-react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { EmptyState } from "../../shared/components/EmptyState";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import {
  currency,
  formatIsoDate,
  shortDate,
} from "../../shared/lib/formatting";
import { PatientSalesHistoryModal } from "./PatientSalesHistoryModal";
import { ReportChart } from "./ReportChart";
import {
  compactMoney,
  contractedKey,
  contractedOptions,
  matchesContracted,
  matchesNoReturnSchedule,
  noReturnScheduleFilterLabels,
  salesChartPoints,
  searchPatientsWithoutReturn,
  type NoReturnScheduleFilter,
} from "./model";
import { useReportQuery, type ReportPeriod } from "./useReportQuery";

const money = (value: number) => currency.format(value / 100);
export function SalesInsights({
  period,
  mode,
  focusNoReturn = false,
}: {
  period: ReportPeriod;
  mode: "overview" | "clients";
  focusNoReturn?: boolean;
}) {
  const { can } = useAuthorization();
  const {
    data: report,
    error,
    loading,
  } = useReportQuery(period, api.salesPeriodReport);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState({ period, message: "" });
  const [historyOf, setHistoryOf] = useState<PatientWithoutReturn | null>(null);
  const [search, setSearch] = useState("");
  const [schedule, setSchedule] = useState<NoReturnScheduleFilter>("all");
  const [contracted, setContracted] = useState("");
  useEffect(() => {
    if (focusNoReturn && report)
      document
        .getElementById("sales-no-return")
        ?.scrollIntoView?.({ block: "start" });
  }, [focusNoReturn, report]);
  async function exportXlsx() {
    setExporting(true);
    setExportError({ period, message: "" });
    try {
      const blob = await api.salesPeriodReportXlsx(period.from, period.to);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `vendas-${period.from}-${period.to}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError({ period, message: (cause as Error).message });
    } finally {
      setExporting(false);
    }
  }
  if (mode === "clients") {
    const options = report
      ? contractedOptions(report.patientsWithoutReturn)
      : [];
    // Item que sumiu da lista (outro período) deixa de filtrar.
    const contractedFilter = options.some((group) =>
      group.items.some((item) => contractedKey(item) === contracted),
    )
      ? contracted
      : "";
    const searched = report
      ? searchPatientsWithoutReturn(
          report.patientsWithoutReturn,
          search,
        ).filter((item) => matchesContracted(item, contractedFilter))
      : [];
    const visible = searched.filter((item) =>
      matchesNoReturnSchedule(item, schedule),
    );
    const filtered =
      Boolean(search.trim()) || Boolean(contractedFilter) || schedule !== "all";
    return (
      <section className="panel" id="sales-no-return">
        <div className="panel-head">
          <div>
            <h2>Clientes sem retorno</h2>
            <p className="panel-context">
              Acompanhamento dos clientes que ainda não voltaram no período.
            </p>
          </div>
          {report && (
            <span className="status-pill">
              {report.patientsWithoutReturn.length} clientes
            </span>
          )}
        </div>
        {error && <ErrorBanner error={error} />}
        {loading && <LoadingBlock />}
        {report && (
          <div className="reports-body">
            <p className="muted-copy">
              Atendidos de {formatIsoDate(report.returnReference.from)} a{" "}
              {formatIsoDate(report.returnReference.to)}, sem atendimento
              concluído de {formatIsoDate(report.from)} a{" "}
              {formatIsoDate(report.to)}. Próximo agendamento considera as datas
              a partir de hoje.
            </p>
            {!report.patientsWithoutReturn.length ? (
              <EmptyState
                title="Nenhum cliente nessa situação."
                copy="Todos os clientes do intervalo de referência retornaram ou não houve atendimentos."
              />
            ) : (
              <>
                <div
                  className="no-return-filters"
                  role="search"
                  aria-label="Filtros dos clientes sem retorno"
                >
                  <label className="filter-group">
                    <span className="filter-label">Cliente</span>
                    <span className="search-box">
                      <Search size={18} aria-hidden="true" />
                      <input
                        type="search"
                        placeholder="Buscar por nome"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </span>
                  </label>
                  <label className="filter-group">
                    <span className="filter-label">Já contratou</span>
                    <select
                      value={contractedFilter}
                      disabled={!options.length}
                      onChange={(event) => setContracted(event.target.value)}
                    >
                      <option value="">
                        {options.length
                          ? "Qualquer item"
                          : "Nenhuma contratação registrada"}
                      </option>
                      {options.map((group) => (
                        <optgroup key={group.sourceType} label={group.label}>
                          {group.items.map((item) => (
                            <option
                              key={contractedKey(item)}
                              value={contractedKey(item)}
                            >
                              {item.itemName}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <div className="filter-group">
                    <span className="filter-label" id="no-return-schedule">
                      Próximo agendamento
                    </span>
                    <div
                      className="segmented"
                      role="group"
                      aria-labelledby="no-return-schedule"
                    >
                      {(
                        Object.keys(
                          noReturnScheduleFilterLabels,
                        ) as NoReturnScheduleFilter[]
                      ).map((filter) => (
                        <button
                          type="button"
                          key={filter}
                          className="segment-button"
                          aria-pressed={schedule === filter}
                          onClick={() => setSchedule(filter)}
                        >
                          {noReturnScheduleFilterLabels[filter]}
                          <small>
                            {
                              searched.filter((item) =>
                                matchesNoReturnSchedule(item, filter),
                              ).length
                            }
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="no-return-summary">
                    <span aria-live="polite">
                      Mostrando <strong>{visible.length}</strong> de{" "}
                      {report.patientsWithoutReturn.length} clientes
                    </span>
                    {filtered && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setSearch("");
                          setContracted("");
                          setSchedule("all");
                        }}
                      >
                        <X size={15} aria-hidden="true" />
                        Limpar filtros
                      </button>
                    )}
                  </div>
                </div>
                {!visible.length ? (
                  <EmptyState
                    title="Nenhum cliente encontrado."
                    copy="Mude a busca, o item contratado ou o filtro de agendamento para ver outros clientes."
                  />
                ) : (
                  <div className="table-scroll">
                    <table className="dre-table">
                      <caption>Clientes sem retorno no período</caption>
                      <thead>
                        <tr>
                          <th scope="col">Cliente</th>
                          <th scope="col">Último atendimento</th>
                          <th scope="col">Próximo agendamento</th>
                          <th scope="col" className="table-actions-head">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((item) => (
                          <tr key={item.patientId}>
                            <th scope="row">{item.patientName}</th>
                            <td>
                              {shortDate.format(new Date(item.lastCompletedAt))}
                            </td>
                            <td>
                              {item.nextAppointmentAt
                                ? shortDate.format(
                                    new Date(item.nextAppointmentAt),
                                  )
                                : "Sem agendamento"}
                            </td>
                            <td>
                              <div className="table-actions">
                                <button
                                  type="button"
                                  className="secondary-button button-sm"
                                  aria-label={`Histórico de ${item.patientName}`}
                                  onClick={() => setHistoryOf(item)}
                                >
                                  <History size={15} aria-hidden="true" />
                                  Histórico
                                </button>
                                {(item.whatsapp || item.phone) && (
                                  <a
                                    className="whatsapp-button button-sm"
                                    aria-label={`WhatsApp de ${item.patientName}`}
                                    href={whatsappLink(
                                      item.whatsapp || item.phone!,
                                      `Olá, ${patientFirstName(item.patientName)}! Tudo bem?`,
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <MessageCircle
                                      size={15}
                                      aria-hidden="true"
                                    />
                                    WhatsApp
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {historyOf && (
          <PatientSalesHistoryModal
            patientId={historyOf.patientId}
            patientName={historyOf.patientName}
            onClose={() => setHistoryOf(null)}
          />
        )}
      </section>
    );
  }
  const chart = report ? salesChartPoints(report) : null;
  return (
    <section className="panel reports-sales">
      <div className="panel-head">
        <div>
          <h2>Vendas e recebimentos</h2>
          <p className="panel-context">
            Vendas realizadas e pagamentos registrados no período selecionado.
          </p>
        </div>
        {can("reports.sales", "reports.export") && (
          <button
            type="button"
            className="secondary-button"
            disabled={!report || exporting}
            onClick={() => void exportXlsx()}
          >
            <Download size={16} aria-hidden="true" />
            {exporting ? "Exportando…" : "Exportar Excel detalhado"}
          </button>
        )}
      </div>
      {error && <ErrorBanner error={error} />}
      {exportError.period === period && exportError.message && (
        <ErrorBanner error={exportError.message} />
      )}
      {loading && <LoadingBlock />}
      {report && (
        <div className="reports-body">
          <div className="reports-kpis">
            <article>
              <span>Vendido líquido</span>
              <strong>{money(report.summary.netSalesInCents)}</strong>
              <small>
                {money(report.summary.grossSalesInCents)} em vendas ·{" "}
                {money(report.summary.cancelledSalesInCents)} em estornos
                {report.summary.customerDiscountInCents
                  ? ` · ${money(report.summary.customerDiscountInCents)} em descontos a clientes`
                  : ""}
              </small>
            </article>
            <article>
              <span>Dinheiro recebido</span>
              <strong>{money(report.summary.receivedInCents)}</strong>
              <small>Pagamentos registrados, após estornos</small>
            </article>
            <article>
              <span>Clientes atendidos</span>
              <strong>{report.summary.attendedPatients}</strong>
              <small>Clientes com atendimento concluído</small>
            </article>
          </div>
          <div className="reports-chart-heading">
            <h3>Evolução no período</h3>
            <span className="panel-context">{chart?.grouping}</span>
          </div>
          {!report.sales.length && !report.payments.length ? (
            <EmptyState
              title="Sem movimentações no período"
              copy="Não houve vendas, cancelamentos ou recebimentos entre as datas selecionadas."
            />
          ) : (
            <ReportChart
              title="Vendas líquidas e recebimentos no período"
              points={chart!.points}
              series={[
                {
                  label: "Vendas líquidas",
                  format: money,
                  axisFormat: compactMoney,
                },
                {
                  label: "Recebimentos",
                  format: money,
                  axisFormat: compactMoney,
                },
              ]}
            />
          )}
          <details className="report-data-disclosure">
            <summary>Ver movimentos do período</summary>
            {!report.sales.length ? (
              <EmptyState title="Nenhuma venda ou cancelamento." copy="" />
            ) : (
              <div className="table-scroll">
                <table className="dre-table">
                  <caption>Movimentos do período</caption>
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Item / cliente</th>
                      <th scope="col">Movimento</th>
                      <th scope="col" className="numeric-value">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sales.map((item) => (
                      <tr key={item.id}>
                        <td>{shortDate.format(new Date(item.occurredAt))}</td>
                        <th scope="row">
                          {item.itemName}
                          <small className="reports-cell-detail">
                            {item.patientName}
                            {item.customerDiscountInCents
                              ? ` · desconto do cliente ${money(item.customerDiscountInCents)}`
                              : ""}
                          </small>
                        </th>
                        <td>
                          {item.kind === "sale" ? "Venda" : "Cancelamento"}
                        </td>
                        <td className="numeric-value">
                          {money(item.amountInCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>
          <p className="muted-copy">
            A planilha traz cada venda, pagamento e cliente sem retorno
            referentes ao período selecionado.
          </p>
        </div>
      )}
    </section>
  );
}
