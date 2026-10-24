import type { InventoryWorkspace } from "@crm/contracts";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, shortDate } from "../../shared/lib/formatting";
import { monthPeriod, summarizeProductSales, type SalesPeriod } from "./model";

type PeriodChoice = "current" | "previous" | "custom";

const periodDate = (iso: string) =>
  iso ? shortDate.format(new Date(`${iso}T12:00:00`)) : "…";

/** Sub-aba "Resumo": indicadores e produtos mais vendidos no período. */
export function SalesSummarySection({
  workspace,
}: {
  workspace: InventoryWorkspace;
}) {
  const [choice, setChoice] = useState<PeriodChoice>("current");
  const [custom, setCustom] = useState<SalesPeriod>(() => monthPeriod());
  const period =
    choice === "current"
      ? monthPeriod()
      : choice === "previous"
        ? monthPeriod(new Date(), -1)
        : custom;
  const summary = summarizeProductSales(workspace.tabs, period);
  const money = (cents: number) => currency.format(cents / 100);
  const share = (cents: number) =>
    summary.totalInCents ? Math.round((cents / summary.totalInCents) * 100) : 0;
  const productCount = summary.topProducts.length;
  return (
    <>
      <section className="panel" aria-label="Resumo de vendas">
        <div className="panel-head sales-summary-head">
          <div>
            <h2>Resumo</h2>
            <p className="panel-context">
              {periodDate(period.from)} a {periodDate(period.to)}
            </p>
          </div>
          <div className="sales-summary-filters">
            <label>
              Período
              <select
                value={choice}
                onChange={(event) =>
                  setChoice(event.target.value as PeriodChoice)
                }
              >
                <option value="current">Mês atual</option>
                <option value="previous">Mês anterior</option>
                <option value="custom">Personalizado</option>
              </select>
            </label>
            {choice === "custom" && (
              <>
                <label>
                  De
                  <input
                    type="date"
                    value={custom.from}
                    onChange={(event) =>
                      setCustom({ ...custom, from: event.target.value })
                    }
                  />
                </label>
                <label>
                  Até
                  <input
                    type="date"
                    value={custom.to}
                    onChange={(event) =>
                      setCustom({ ...custom, to: event.target.value })
                    }
                  />
                </label>
              </>
            )}
          </div>
        </div>
        <div className="metric-grid finance-metrics sales-metrics sales-summary-metrics">
          <article className="metric-card accent">
            <span>Total vendido</span>
            <strong>{money(summary.totalInCents)}</strong>
          </article>
          <article className="metric-card">
            <span>Vendas</span>
            <strong>{summary.salesCount}</strong>
          </article>
          <article className="metric-card">
            <span>Itens vendidos</span>
            <strong>{summary.itemsCount}</strong>
          </article>
          <article className="metric-card">
            <span>Ticket médio</span>
            <strong>{money(summary.averageTicketInCents)}</strong>
          </article>
        </div>
      </section>
      <section className="panel" aria-label="Produtos mais vendidos">
        <div className="panel-head">
          <div>
            <h2>Produtos mais vendidos</h2>
            {productCount > 0 && (
              <p className="panel-context">
                {productCount === 1 ? "1 produto" : `${productCount} produtos`}{" "}
                · ordenados por receita
              </p>
            )}
          </div>
        </div>
        {!productCount ? (
          <EmptyState
            icon={BarChart3}
            title="Sem vendas no período"
            copy="Os produtos vendidos no período aparecem aqui, do maior para o menor faturamento."
          />
        ) : (
          <div className="table-scroll sales-table">
            <table className="dre-table sales-ranking">
              <caption className="sr-only">
                Produtos vendidos no período
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="numeric-value sales-rank">
                    #
                  </th>
                  <th scope="col">Produto</th>
                  <th scope="col" className="numeric-value">
                    Quantidade
                  </th>
                  <th scope="col" className="numeric-value">
                    Receita
                  </th>
                  <th scope="col" className="sales-share">
                    Participação
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.topProducts.map((item, index) => {
                  const percent = share(item.revenueInCents);
                  return (
                    <tr key={item.productId}>
                      <td className="numeric-value sales-rank">{index + 1}</td>
                      <th scope="row">{item.productName}</th>
                      <td className="numeric-value">{item.quantity}</td>
                      <td className="numeric-value">
                        {money(item.revenueInCents)}
                      </td>
                      <td className="sales-share">
                        <span className="sales-share-cell">
                          <meter
                            min={0}
                            max={100}
                            value={percent}
                            aria-hidden="true"
                          />
                          <span>{percent}%</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
