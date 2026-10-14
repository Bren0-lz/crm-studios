import type { DreReport } from "@crm/contracts";
import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, localIsoDate } from "../../shared/lib/formatting";
import { dreGroupLabels } from "../finance/index";

export function DreSection() {
  const { can } = useAuthorization();
  const [open, setOpen] = useState(false),
    [filter, setFilter] = useState({
      from: `${localIsoDate().slice(0, 7)}-01`,
      to: localIsoDate(),
    }),
    [report, setReport] = useState<DreReport | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [printed, setPrinted] = useState<DreReport | null>(null);
  async function load() {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      setReport(await api.dreReport(filter.from, filter.to));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportReport(print = false) {
    if (!report) return;
    setBusy(true);
    setError("");
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
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function table(data: DreReport) {
    return (
      <div className="table-scroll">
        <table className="dre-table">
          <caption>
            DRE por competência · {data.from} a {data.to}
          </caption>
          <thead>
            <tr>
              <th scope="col">Composição</th>
              {data.months.map((item) => (
                <th scope="col" key={item.month}>
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
                    -m.expenses[key as keyof typeof m.expenses],
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
    <section className="panel">
      <details
        onToggle={(event) => {
          if (event.currentTarget.open && !open) {
            setOpen(true);
            void load();
          }
        }}
      >
        <summary className="panel-head">DRE por competência</summary>
        {open && (
          <div className="inventory-body">
            <p className="muted-copy">
              Composição mensal por competência, incluindo valores ainda não
              pagos. O caixa apresenta as movimentações de pagamento e estorno.
            </p>
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void load();
              }}
            >
              <label>
                De
                <input
                  type="date"
                  required
                  value={filter.from}
                  onChange={(event) =>
                    setFilter({ ...filter, from: event.target.value })
                  }
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  required
                  min={filter.from}
                  value={filter.to}
                  onChange={(event) =>
                    setFilter({ ...filter, to: event.target.value })
                  }
                />
              </label>
              <button className="primary-button" disabled={busy}>
                Consultar
              </button>
            </form>
            {error && <ErrorBanner error={error} />}
            {busy && <LoadingBlock />}
            {report && (
              <>
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
        )}
      </details>
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
