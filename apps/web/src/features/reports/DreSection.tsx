import type { DreReport } from "@crm/contracts";
import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, formatIsoDate } from "../../shared/lib/formatting";
import { ReportChart } from "./ReportChart";
import { useReportQuery, type ReportPeriod } from "./useReportQuery";
import { dreGroupLabels } from "../finance/index";

export function DreSection({ period }: { period: ReportPeriod }) {
  const { can } = useAuthorization();
  const {
    data: report,
    error: queryError,
    loading,
  } = useReportQuery(period, api.dreReport);
  const [exporting, setBusy] = useState(false);
  const [exportError, setExportError] = useState({ period, message: "" });
  const [printed, setPrinted] = useState<DreReport | null>(null);
  const busy = exporting || loading;
  const error =
    queryError || (exportError.period === period ? exportError.message : "");
  async function exportReport(print = false) {
    if (!report) return;
    setBusy(true);
    setExportError({ period, message: "" });
    try {
      const data = await api.dreReport(report.from, report.to, undefined, true);
      if (print) {
        setPrinted(data);
        requestAnimationFrame(() => {
          window.print();
          setPrinted(null);
        });
      } else {
        const rows = [
          [
            "Competência",
            "Receita de serviços",
            "Receita de produtos",
            "Outras receitas",
            ...Object.values(dreGroupLabels),
            "Resultado",
          ],
          ...data.months.map((month) => [
            month.month,
            month.serviceRevenueInCents / 100,
            month.productRevenueInCents / 100,
            month.otherRevenueInCents / 100,
            ...Object.keys(dreGroupLabels).map(
              (key) => month.expenses[key as keyof typeof month.expenses] / 100,
            ),
            month.resultInCents / 100,
          ]),
        ];
        const blob = new Blob(
            [
              "\ufeff" +
                rows
                  .map((row) =>
                    row
                      .map(
                        (value) => `"${String(value).replaceAll('"', '""')}"`,
                      )
                      .join(";"),
                  )
                  .join("\r\n"),
            ],
            { type: "text/csv;charset=utf-8" },
          ),
          url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = `dre-${data.from}-${data.to}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (cause) {
      setExportError({ period, message: (cause as Error).message });
    } finally {
      setBusy(false);
    }
  }
  function table(data: DreReport) {
    return (
      <div className="table-scroll">
        <table className="dre-table">
          <caption>
            DRE por competência · {formatIsoDate(data.from)} a{" "}
            {formatIsoDate(data.to)}
          </caption>
          <thead>
            <tr>
              <th scope="col">Composição</th>
              {data.months.map((item) => (
                <th scope="col" className="numeric-value" key={item.month}>
                  {item.month.split("-").reverse().join("/")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              [
                "Receita de serviços",
                (m: DreReport["months"][number]) => m.serviceRevenueInCents,
              ],
              [
                "Receita de produtos",
                (m: DreReport["months"][number]) => m.productRevenueInCents,
              ],
              [
                "Outras receitas",
                (m: DreReport["months"][number]) => m.otherRevenueInCents,
              ],
              ...Object.entries(dreGroupLabels)
                .filter(([key]) => !key.endsWith("revenue"))
                .map(([key, label]) => [
                  label,
                  (m: DreReport["months"][number]) =>
                    -m.expenses[key as keyof typeof m.expenses] || 0,
                ]),
              [
                "Resultado",
                (m: DreReport["months"][number]) => m.resultInCents,
              ],
            ].map(([label, value]) => (
              <tr key={label as string}>
                <th scope="row">{label as string}</th>
                {data.months.map((month) => (
                  <td className="numeric-value" key={month.month}>
                    {currency.format(
                      (value as (m: typeof month) => number)(month) / 100,
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <section className="panel reports-dre">
      <div className="panel-head">
        <div>
          <h2>DRE por competência</h2>
          <p className="panel-context">
            Composição dos meses abrangidos pelo período, incluindo valores
            ainda não pagos. O caixa apresenta os pagamentos e os estornos.
          </p>
        </div>
      </div>
      <div className="reports-body">
        {error && <ErrorBanner error={error} />}
        {loading && <LoadingBlock />}
        {report && (
          <>
            <div className="reports-kpis">
              <article>
                <span>Receitas</span>
                <strong>
                  {currency.format(report.totals.revenueInCents / 100)}
                </strong>
                <small>Por competência</small>
              </article>
              <article>
                <span>Despesas</span>
                <strong>
                  {currency.format(report.totals.expensesInCents / 100)}
                </strong>
                <small>Por competência</small>
              </article>
              <article>
                <span>Resultado</span>
                <strong>
                  {currency.format(report.totals.resultInCents / 100)}
                </strong>
                <small>Receitas menos despesas</small>
              </article>
            </div>
            {(report.totals.revenueInCents !== 0 ||
              report.totals.expensesInCents !== 0) && (
              <ReportChart
                title="Resultado por competência"
                bars
                points={report.months.map((item) => ({
                  label: item.month.split("-").reverse().join("/"),
                  values: [
                    item.serviceRevenueInCents +
                      item.productRevenueInCents +
                      item.otherRevenueInCents,
                    item.serviceRevenueInCents +
                      item.productRevenueInCents +
                      item.otherRevenueInCents -
                      item.resultInCents,
                    item.resultInCents,
                  ],
                }))}
                series={[
                  {
                    label: "Receitas",
                    format: (v) => currency.format(v / 100),
                  },
                  {
                    label: "Despesas",
                    format: (v) => currency.format(v / 100),
                  },
                  {
                    label: "Resultado",
                    format: (v) => currency.format(v / 100),
                  },
                ]}
              />
            )}
            {report.totals.revenueInCents === 0 &&
            report.totals.expensesInCents === 0 ? (
              <EmptyState
                title="Nenhum lançamento no período"
                copy="Classifique os lançamentos no Financeiro para compor o resultado."
              />
            ) : (
              table(report)
            )}
            {can("reports.export") && (
              <div className="page-actions">
                <button
                  disabled={busy}
                  className="secondary-button"
                  onClick={() => void exportReport()}
                >
                  Exportar DRE
                </button>
                <button
                  disabled={busy}
                  className="secondary-button"
                  onClick={() => void exportReport(true)}
                >
                  Imprimir DRE
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {printed &&
        createPortal(
          <div className="clinical-print-sheet">
            <h1>Demonstrativo de resultados</h1>
            {table(printed)}
          </div>,
          document.body,
        )}
    </section>
  );
}
