import type { InventoryWorkspace, PatientTab } from "@crm/contracts";
import { ReceiptText } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, shortDate } from "../../shared/lib/formatting";
import { PatientTabModal } from "./PatientTabModal";
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

/** Sub-aba "Vendas realizadas": comandas fechadas com produtos, filtradas por período. */
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
  return (
    <section className="panel" aria-label="Vendas realizadas">
      <div className="panel-head">
        <h2>Vendas realizadas</h2>
      </div>
      <div className="list-toolbar sales-toolbar">
        <label>
          De
          <input
            type="date"
            value={period.from}
            onChange={(event) =>
              setPeriod({ ...period, from: event.target.value })
            }
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={period.to}
            onChange={(event) =>
              setPeriod({ ...period, to: event.target.value })
            }
          />
        </label>
        <label>
          Cliente
          <input
            type="search"
            placeholder="Buscar pelo nome"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {!sales.length ? (
        <EmptyState
          icon={ReceiptText}
          title="Nenhuma venda no período"
          copy="As vendas de produtos registradas aparecem aqui."
        />
      ) : (
        <div className="table-scroll sales-table">
          <table className="dre-table">
            <caption>Vendas de produtos no período</caption>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Cliente</th>
                <th scope="col">Produtos</th>
                <th scope="col">Situação</th>
                <th scope="col" className="numeric-value">
                  Total
                </th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sales.map((tab) => (
                <tr key={tab.id}>
                  <td>
                    {shortDate.format(new Date(tab.closedAt ?? tab.openedAt))}
                  </td>
                  <th scope="row">{tab.patientName}</th>
                  <td>{saleItemsLabel(tab)}</td>
                  <td>
                    <span className={`status-pill ${statusClass(tab)}`}>
                      {saleStatusLabel(tab)}
                    </span>
                  </td>
                  <td className="numeric-value">
                    {currency.format(productsTotalInCents(tab) / 100)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`Ver venda de ${tab.patientName}`}
                      onClick={() => setSelected(tab.id)}
                    >
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
        <PatientTabModal
          tab={selectedTab}
          products={workspace.products}
          onClose={() => setSelected(null)}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}
