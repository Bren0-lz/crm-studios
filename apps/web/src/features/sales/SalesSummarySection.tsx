import type { InventoryWorkspace } from "@crm/contracts";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency } from "../../shared/lib/formatting";
import { monthPeriod, summarizeProductSales, type SalesPeriod } from "./model";

type PeriodChoice = "current" | "previous" | "custom";

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
  return (
    <>
      <section className="panel" aria-label="Resumo de vendas">
        <div className="panel-head">
          <h2>Resumo</h2>
        </div>
        <div className="list-toolbar sales-toolbar">
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
        <div className="metric-grid finance-metrics sales-metrics">
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
          <h2>Produtos mais vendidos</h2>
        </div>
        {!summary.topProducts.length ? (
          <EmptyState
            icon={BarChart3}
            title="Sem vendas no período"
            copy="Os produtos vendidos no período aparecem aqui, do maior para o menor faturamento."
          />
        ) : (
          <div className="table-scroll sales-table">
            <table className="dre-table">
              <caption>Produtos vendidos no período</caption>
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col" className="numeric-value">
                    Quantidade
                  </th>
                  <th scope="col" className="numeric-value">
                    Receita
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.topProducts.map((item) => (
                  <tr key={item.productId}>
                    <th scope="row">{item.productName}</th>
                    <td className="numeric-value">{item.quantity}</td>
                    <td className="numeric-value">
                      {money(item.revenueInCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
