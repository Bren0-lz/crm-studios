import { useEffect, useState } from "react";
import {
  patientFirstName,
  whatsappLink,
  type PatientWithoutReturn,
  type SaleMovement,
  type SalesBreakdownRow,
  type SalesPeriodReport,
} from "@crm/contracts";
import { Download, History, MessageCircle, Search, X } from "lucide-react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { EmptyState } from "../../shared/components/EmptyState";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { TrendBadge } from "../../shared/components/TrendBadge";
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
  plural,
  saleMargin,
  saleTypeLabels,
  salesChartPoints,
  salesDay,
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
  const [buyerHistory, setBuyerHistory] = useState<{
    patientId: string;
    patientName: string;
  } | null>(null);
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
  const summary = report?.summary;
  return (
    <section className="panel reports-sales">
      <div className="panel-head">
        <div>
          <h2>Vendas</h2>
          <p className="panel-context">
            O que foi vendido no período: planos, serviços avulsos e produtos. O
            dinheiro recebido fica no Financeiro.
          </p>
        </div>
        {can("reports.sales_export") && (
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
      {report && summary && (
        <div className="reports-body">
          <div className="reports-kpis sales-kpis">
            <article>
              <span>Vendido líquido</span>
              <strong>{money(summary.netSalesInCents)}</strong>
              <TrendBadge
                changePercent={report.changePercent}
                changeInCents={report.changeInCents}
                hasCurrentValue={summary.netSalesInCents !== 0}
                comparison="em relação ao período anterior"
              />
              <small>
                {money(summary.grossSalesInCents)} em vendas
                {summary.cancelledInPeriodSalesInCents
                  ? ` · ${money(summary.cancelledInPeriodSalesInCents)} cancelados`
                  : ""}
                {summary.customerDiscountInCents
                  ? ` · ${money(summary.customerDiscountInCents)} em descontos a clientes`
                  : ""}
              </small>
            </article>
            <article>
              <span>Vendas</span>
              <strong>{summary.salesCount}</strong>
              <small>
                Valor médio de {money(summary.averageTicketInCents)} por venda
              </small>
            </article>
            <article>
              <span>Clientes compradores</span>
              <strong>{summary.buyers}</strong>
              <small>
                {plural(summary.newBuyers, "comprou", "compraram")} pela
                primeira vez · {summary.buyers - summary.newBuyers} já{" "}
                {summary.buyers - summary.newBuyers === 1 ? "era" : "eram"}{" "}
                clientes
              </small>
            </article>
            <article>
              <span>Vendas já pagas</span>
              <strong>{money(summary.payment.paidInCents)}</strong>
              <small>
                {money(summary.payment.openInCents)} em aberto
                {summary.payment.overdueInCents
                  ? ` · ${money(summary.payment.overdueInCents)} em atraso`
                  : ""}
                {summary.settlementDiscountInCents
                  ? ` · ${money(summary.settlementDiscountInCents)} em descontos na baixa`
                  : ""}
              </small>
            </article>
          </div>
          {summary.cancelledPriorSalesInCents > 0 && (
            <p className="panel-context sales-prior-cancellations">
              {money(summary.cancelledPriorSalesInCents)} em cancelamentos de
              vendas de períodos anteriores. Eles não entram no vendido líquido
              deste período; veja quais são em &ldquo;Ver movimentos do
              período&rdquo;.
            </p>
          )}
          {!summary.salesCount && !report.sales.length ? (
            <EmptyState
              title="Sem vendas no período"
              copy="Não houve vendas nem cancelamentos entre as datas selecionadas."
            />
          ) : (
            <>
              <div className="reports-chart-heading">
                <h3>Evolução no período</h3>
                <span className="panel-context">{chart?.grouping}</span>
              </div>
              <ReportChart
                title="Vendas líquidas no período"
                points={chart!.points}
                series={[
                  {
                    label: "Vendas líquidas",
                    format: money,
                    axisFormat: compactMoney,
                  },
                ]}
              />
              <SalesBreakdownTable
                title="Por tipo"
                caption="Vendas por tipo no período"
                rows={summary.byType}
                firstColumn="Tipo"
              />
              <SalesBreakdownTable
                title="Por item"
                caption="Vendas por item no período"
                rows={summary.byItem}
                firstColumn="Item"
                withCost
              />
              <div className="reports-chart-heading">
                <h3>Maiores compradores</h3>
              </div>
              {!summary.topBuyers.length ? (
                <EmptyState title="Nenhuma venda no período." copy="" />
              ) : (
                <div className="table-scroll">
                  <table className="dre-table">
                    <caption>Clientes que mais compraram no período</caption>
                    <thead>
                      <tr>
                        <th scope="col">Cliente</th>
                        <th scope="col" className="numeric-value">
                          Vendas
                        </th>
                        <th scope="col" className="numeric-value">
                          Líquido
                        </th>
                        <th scope="col" className="table-actions-head">
                          Histórico
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.topBuyers.map((item) => (
                        <tr key={item.patientId}>
                          <th scope="row">
                            {item.patientName}
                            {item.firstPurchase && (
                              <small className="reports-cell-detail">
                                Primeira compra
                              </small>
                            )}
                          </th>
                          <td className="numeric-value">{item.salesCount}</td>
                          <td className="numeric-value">
                            {money(item.netInCents)}
                          </td>
                          <td className="table-actions">
                            <button
                              type="button"
                              className="secondary-button button-sm"
                              aria-label={`Ver compras de ${item.patientName}`}
                              onClick={() =>
                                setBuyerHistory({
                                  patientId: item.patientId,
                                  patientName: item.patientName,
                                })
                              }
                            >
                              <History size={16} aria-hidden="true" />
                              Compras
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
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
                          {item.kind === "sale"
                            ? "Venda"
                            : priorCancellation(item, report)
                              ? `Cancelamento · venda de ${shortDate.format(new Date(item.saleOccurredAt!))}`
                              : "Cancelamento"}
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
            A planilha traz cada venda, os totais por item, os maiores
            compradores e os clientes sem retorno do período selecionado.
          </p>
        </div>
      )}
      {buyerHistory && (
        <PatientSalesHistoryModal
          patientId={buyerHistory.patientId}
          patientName={buyerHistory.patientName}
          onClose={() => setBuyerHistory(null)}
        />
      )}
    </section>
  );
}

/** Cancelamento de uma venda feita antes do período (fica fora do líquido). */
function priorCancellation(item: SaleMovement, report: SalesPeriodReport) {
  if (!item.saleOccurredAt) return false;
  return salesDay(item.saleOccurredAt) < report.from;
}

function SalesBreakdownTable({
  title,
  caption,
  rows,
  firstColumn,
  withCost = false,
}: {
  title: string;
  caption: string;
  rows: SalesBreakdownRow[];
  firstColumn: string;
  withCost?: boolean;
}) {
  const showCost =
    withCost && rows.some((row) => row.costInCents !== undefined);
  return (
    <>
      <div className="reports-chart-heading">
        <h3>{title}</h3>
      </div>
      {!rows.length ? (
        <EmptyState title="Nenhuma venda no período." copy="" />
      ) : (
        <div className="table-scroll">
          <table className="dre-table">
            <caption>{caption}</caption>
            <thead>
              <tr>
                <th scope="col">{firstColumn}</th>
                <th scope="col" className="numeric-value">
                  Vendas
                </th>
                <th scope="col" className="numeric-value">
                  Qtd.
                </th>
                <th scope="col" className="numeric-value">
                  Bruto
                </th>
                <th scope="col" className="numeric-value">
                  Cancelado
                </th>
                <th scope="col" className="numeric-value">
                  Líquido
                </th>
                {showCost && (
                  <>
                    <th scope="col" className="numeric-value">
                      Custo
                    </th>
                    <th scope="col" className="numeric-value">
                      Margem
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    {row.label}
                    {withCost && (
                      <small className="reports-cell-detail">
                        {saleTypeLabels[row.sourceType]}
                        {row.customerDiscountInCents
                          ? ` · desconto do cliente ${money(row.customerDiscountInCents)}`
                          : ""}
                      </small>
                    )}
                  </th>
                  <td className="numeric-value">{row.salesCount}</td>
                  <td className="numeric-value">{row.quantity}</td>
                  <td className="numeric-value">{money(row.grossInCents)}</td>
                  <td className="numeric-value">
                    {money(row.cancelledInCents)}
                  </td>
                  <td className="numeric-value">{money(row.netInCents)}</td>
                  {showCost && (
                    <>
                      <td className="numeric-value">
                        {row.costInCents === undefined
                          ? "—"
                          : money(row.costInCents)}
                      </td>
                      <td className="numeric-value">{saleMargin(row)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
