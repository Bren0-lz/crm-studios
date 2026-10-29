import type { ClinicCatalogEntry, InventoryWorkspace } from "@crm/contracts";
import { BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency, shortDate } from "../../shared/lib/formatting";
import {
  monthPeriod,
  rankSoldItems,
  soldItemLines,
  soldItemOptions,
  soldItemsViewLabels,
  summarizeProductSales,
  type SalesPeriod,
  type SoldItemsFilter,
  type SoldItemsView,
} from "./model";

type PeriodChoice = "current" | "previous" | "custom";

const periodDate = (iso: string) =>
  iso ? shortDate.format(new Date(`${iso}T12:00:00`)) : "…";

/** Sub-aba "Resumo": indicadores, produtos mais vendidos e ranking por tipo e tamanho. */
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
  const [categories, setCategories] = useState<ClinicCatalogEntry[] | null>(
    null,
  );
  const [categoriesError, setCategoriesError] = useState("");
  const [view, setView] = useState<SoldItemsView>("item");
  const [filter, setFilter] = useState<SoldItemsFilter>({ type: "", size: "" });
  useEffect(() => {
    let alive = true;
    api
      .clinicCatalog("product_category")
      .then((items) => {
        if (alive) setCategories(items);
      })
      .catch((cause: Error) => {
        if (alive) {
          setCategories([]);
          setCategoriesError(cause.message);
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  const lines = soldItemLines(
    workspace.tabs,
    period,
    workspace.products,
    categories ?? [],
  );
  const ranking = rankSoldItems(lines, view, filter);
  const typeOptions = soldItemOptions(lines, "type");
  const sizeOptions = soldItemOptions(lines, "size");
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
      <section className="panel" aria-label="Mais vendidos por tipo e tamanho">
        <div className="panel-head sales-summary-head">
          <div>
            <h2>Mais vendidos por tipo e tamanho</h2>
            <p className="panel-context">
              {soldItemsViewLabels[view]} · ordenados por quantidade
            </p>
          </div>
          <div className="sales-summary-filters">
            <label>
              Ver por
              <select
                value={view}
                onChange={(event) =>
                  setView(event.target.value as SoldItemsView)
                }
              >
                {(Object.keys(soldItemsViewLabels) as SoldItemsView[]).map(
                  (key) => (
                    <option key={key} value={key}>
                      {soldItemsViewLabels[key]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Tipo de item
              <select
                value={filter.type}
                onChange={(event) =>
                  setFilter({ ...filter, type: event.target.value })
                }
              >
                <option value="">Todos</option>
                {typeOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tamanho
              <select
                value={filter.size}
                onChange={(event) =>
                  setFilter({ ...filter, size: event.target.value })
                }
              >
                <option value="">Todos</option>
                {sizeOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {categoriesError && (
          <div className="sales-ranking-body">
            <ErrorBanner error={categoriesError} />
          </div>
        )}
        {!categories ? (
          <div className="sales-ranking-body">
            <LoadingBlock />
          </div>
        ) : !ranking.length ? (
          <EmptyState
            icon={BarChart3}
            title="Sem vendas no período"
            copy="Os itens vendidos aparecem aqui agrupados por tipo e tamanho, do mais para o menos vendido."
          />
        ) : (
          <div className="table-scroll sales-table">
            <table className="dre-table sales-ranking">
              <caption className="sr-only">
                Itens mais vendidos por tipo e tamanho
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="numeric-value sales-rank">
                    #
                  </th>
                  {view !== "size" && <th scope="col">Tipo</th>}
                  {view === "item" && <th scope="col">Produto</th>}
                  {view !== "type" && <th scope="col">Tamanho</th>}
                  <th scope="col" className="numeric-value">
                    Quantidade
                  </th>
                  <th scope="col" className="numeric-value">
                    Receita
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row, index) => (
                  <tr key={row.key}>
                    <td className="numeric-value sales-rank">{index + 1}</td>
                    {view === "type" && <th scope="row">{row.typeName}</th>}
                    {view === "item" && (
                      <>
                        <td>{row.typeName}</td>
                        <th scope="row">{row.productName}</th>
                        <td>{row.sizeLabel}</td>
                      </>
                    )}
                    {view === "size" && <th scope="row">{row.sizeLabel}</th>}
                    <td className="numeric-value">{row.quantity}</td>
                    <td className="numeric-value">
                      {money(row.revenueInCents)}
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
