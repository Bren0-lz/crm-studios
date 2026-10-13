import type { SalesReport } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import {
  currency,
  formatIsoDate,
  localIsoDate,
  shortDate,
} from "../../shared/lib/formatting";

export function SalesInsights() {
  const { can } = useAuthorization();
  const [month, setMonth] = useState(localIsoDate().slice(0, 7));
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const currentMovements =
    report?.sales.filter(
      (item) =>
        new Date(item.occurredAt)
          .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
          .slice(0, 7) === month,
    ) ?? [];

  useEffect(() => {
    let active = true;
    api
      .salesReport(month)
      .then((data) => active && setReport(data))
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month]);

  async function exportXlsx() {
    setExporting(true);
    setError("");
    try {
      const blob = await api.salesReportXlsx(month);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `vendas-${month}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="panel sales-report">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Vendas e clientes</span>
          <h2>Comparação mensal</h2>
        </div>
        <div className="sales-report-actions">
          <label>
            Mês{" "}
            <input
              type="month"
              value={month}
              max={localIsoDate().slice(0, 7)}
              onChange={(event) => {
                setLoading(true);
                setReport(null);
                setError("");
                setMonth(event.target.value);
              }}
            />
          </label>
          {can("reports.sales", "reports.export") && (
            <button
              type="button"
              className="secondary-button"
              disabled={!report || exporting || loading}
              onClick={() => void exportXlsx()}
            >
              {exporting ? "Exportando…" : "Exportar Excel detalhado"}
            </button>
          )}
        </div>
      </div>
      {error && <ErrorBanner error={error} />}
      {loading ? (
        <LoadingBlock />
      ) : report ? (
        <>
          <p className="sales-period">
            {formatIsoDate(report.current.from)} a{" "}
            {formatIsoDate(report.current.to)}
            {" · "}Comparado com {formatIsoDate(report.previousComparable.from)}{" "}
            a {formatIsoDate(report.previousComparable.to)}.{" "}
            {report.current.attendedPatients} clientes atendidos neste mês.
          </p>
          <div className="sales-metrics">
            <article>
              <span>Vendido no mês</span>
              <strong>
                {currency.format(report.current.netSalesInCents / 100)}
              </strong>
              <small>
                {report.changePercent === null
                  ? "Sem vendas no período anterior"
                  : `${report.changePercent > 0 ? "+" : ""}${report.changePercent}% frente ao mês anterior`}
              </small>
              <small>
                Antes dos cancelamentos:{" "}
                {currency.format(report.current.grossSalesInCents / 100)}
                {" · "}Cancelado:{" "}
                {currency.format(report.current.cancelledSalesInCents / 100)}
              </small>
            </article>
            <article>
              <span>Dinheiro recebido</span>
              <strong>
                {currency.format(report.current.receivedInCents / 100)}
              </strong>
              <small>Pagamentos registrados, após estornos</small>
            </article>
            <article>
              <span>Clientes sem retorno</span>
              <strong>{report.patientsWithoutReturn.length}</strong>
              <small>
                Atendidos no mês anterior, sem consulta concluída neste mês
              </small>
            </article>
          </div>
          <details className="report-disclosure sales-details">
            <summary>Ver vendas e clientes do mês</summary>
            <div className="sales-detail-grid">
              <div>
                <h3>Movimentos deste mês</h3>
                {currentMovements.length === 0 ? (
                  <p>Nenhuma venda ou cancelamento.</p>
                ) : (
                  <div className="sales-detail-list">
                    {currentMovements.slice(0, 12).map((item) => (
                      <div key={item.id}>
                        <span>
                          <strong>{item.itemName}</strong>
                          <small>
                            {item.patientName} ·{" "}
                            {item.kind === "sale" ? "Venda" : "Cancelamento"}
                          </small>
                        </span>
                        <b>{currency.format(item.amountInCents / 100)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3>Clientes sem retorno</h3>
                {report.patientsWithoutReturn.length === 0 ? (
                  <p>Nenhum cliente nessa situação.</p>
                ) : (
                  <div className="sales-detail-list">
                    {report.patientsWithoutReturn.slice(0, 12).map((item) => (
                      <div key={item.patientId}>
                        <span>
                          <strong>{item.patientName}</strong>
                          <small>
                            Último atendimento:{" "}
                            {shortDate.format(new Date(item.lastCompletedAt))}
                          </small>
                        </span>
                        <small>
                          {item.nextAppointmentAt
                            ? `Agendado: ${shortDate.format(new Date(item.nextAppointmentAt))}`
                            : "Sem agendamento"}
                        </small>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </details>
          <p className="sales-help">
            A planilha traz cada venda, pagamento e cliente sem retorno dos dois
            períodos comparados.
          </p>
        </>
      ) : null}
    </section>
  );
}
