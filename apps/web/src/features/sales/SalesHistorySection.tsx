import type { InventoryWorkspace, PatientTab } from "@crm/contracts";
import { Eye, ReceiptText, Search } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, shortDate } from "../../shared/lib/formatting";
import { SaleDetailsModal } from "./SaleDetailsModal";
import {
  monthPeriod,
  productSales,
  productsTotalInCents,
  saleItemsLabel,
  saleStatusLabel,
  type SalesPeriod,
} from "./model";

const statusClass = (tab: PatientTab) =>
  tab.status === "cancelled"
    ? "cancelled"
    : tab.paymentStatus === "paid"
      ? "completed"
      : "scheduled";

/** Sub-aba "Vendas realizadas": vendas de produtos filtradas por período. */
export function SalesHistorySection({
  workspace,
  onChanged,
}: {
  workspace: InventoryWorkspace;
  onChanged: () => Promise<void>;
}) {
  const [period, setPeriod] = useState<SalesPeriod>(() => monthPeriod());
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const sales = productSales(workspace.tabs, period, search);
  const selectedTab = workspace.tabs.find((item) => item.id === selected);
  const totalInCents = sales.reduce(
    (sum, tab) => sum + productsTotalInCents(tab),
    0,
  );
  return (
    <section className="panel" aria-label="Vendas realizadas">
      <div className="panel-head">
        <div>
          <h2>Vendas realizadas</h2>
          <p className="panel-context">
            {sales.length === 1 ? "1 venda" : `${sales.length} vendas`} no
            período
          </p>
        </div>
        {sales.length > 0 && (
          <p className="sales-history-total">
            <span>Total no período</span>
            <strong>{currency.format(totalInCents / 100)}</strong>
          </p>
        )}
      </div>
      <div className="list-toolbar sales-toolbar">
        <label className="sales-date-field">
          De
          <input
            type="date"
            value={period.from}
            onChange={(event) =>
              setPeriod({ ...period, from: event.target.value })
            }
          />
        </label>
        <label className="sales-date-field">
          Até
          <input
            type="date"
            value={period.to}
            onChange={(event) =>
              setPeriod({ ...period, to: event.target.value })
            }
          />
        </label>
        <label className="sales-search-field">
          Cliente
          <span className="sales-search-input">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar pelo nome"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>
      </div>
      {!sales.length ? (
        <EmptyState
          icon={ReceiptText}
          title="Nenhuma venda no período"
          copy="As vendas de produtos registradas aparecem aqui."
        />
      ) : (
        <div className="table-scroll">
          <table className="dre-table sales-history-table">
            <caption className="sr-only">Vendas de produtos no período</caption>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Cliente</th>
                <th scope="col">Produtos</th>
                <th scope="col">Situação</th>
                <th scope="col" className="numeric-value">
                  Total
                </th>
                <th scope="col" className="table-actions-head">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sales.map((tab) => (
                <tr key={tab.id}>
                  <td className="sales-date-cell">
                    {shortDate.format(new Date(tab.closedAt ?? tab.openedAt))}
                  </td>
                  <th scope="row">{tab.patientName}</th>
                  <td className="sales-items-cell">{saleItemsLabel(tab)}</td>
                  <td>
                    <span className={`status-pill ${statusClass(tab)}`}>
                      {saleStatusLabel(tab)}
                    </span>
                  </td>
                  <td className="numeric-value">
                    {currency.format(productsTotalInCents(tab) / 100)}
                  </td>
                  <td className="table-actions-cell">
                    <button
                      type="button"
                      className="secondary-button button-sm"
                      aria-label={`Ver venda de ${tab.patientName}`}
                      onClick={() => setSelected(tab.id)}
                    >
                      <Eye size={15} aria-hidden="true" />
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedTab && (
        <SaleDetailsModal
          sale={selectedTab}
          onClose={() => setSelected(null)}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}
