import type { InventoryWorkspace } from "@crm/contracts";
import { ClipboardList, Plus } from "lucide-react";
import { useState } from "react";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, shortDate } from "../../shared/lib/formatting";
import { PatientTabModal } from "./PatientTabModal";
import { saleItemsLabel } from "./model";

/** Sub-aba "Comandas abertas": comandas em aberto de todos os clientes. */
export function OpenTabsSection({
  workspace,
  onChanged,
}: {
  workspace: InventoryWorkspace;
  onChanged: () => Promise<void>;
}) {
  const { can } = useAuthorization();
  // `null`: modal fechado; `{}`: comanda nova; `{ id }`: comanda existente.
  const [modal, setModal] = useState<{ id?: string } | null>(null);
  const tabs = workspace.tabs
    .filter((tab) => tab.status === "open")
    .sort((left, right) => right.openedAt.localeCompare(left.openedAt));
  const selectedTab = workspace.tabs.find((item) => item.id === modal?.id);
  return (
    <section className="panel" aria-label="Comandas abertas">
      <div className="panel-head">
        <h2>Comandas abertas</h2>
        {can("patients.tabs_create") && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setModal({})}
          >
            <Plus size={18} /> Abrir comanda
          </button>
        )}
      </div>
      {!tabs.length ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma comanda aberta"
          copy="Comandas abertas para juntar produtos e serviços antes de cobrar aparecem aqui."
        />
      ) : (
        <div className="table-scroll sales-table">
          <table className="dre-table">
            <caption>Comandas em aberto</caption>
            <thead>
              <tr>
                <th scope="col">Aberta em</th>
                <th scope="col">Cliente</th>
                <th scope="col">Itens</th>
                <th scope="col" className="numeric-value">
                  Total
                </th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tabs.map((tab) => (
                <tr key={tab.id}>
                  <td>{shortDate.format(new Date(tab.openedAt))}</td>
                  <th scope="row">{tab.patientName}</th>
                  <td>
                    {[
                      saleItemsLabel(tab),
                      ...(tab.services ?? []).map((item) => item.serviceName),
                    ]
                      .filter(Boolean)
                      .join(", ") || "Sem itens"}
                  </td>
                  <td className="numeric-value">
                    {currency.format(tab.totalInCents / 100)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`Continuar comanda de ${tab.patientName}`}
                      onClick={() => setModal({ id: tab.id })}
                    >
                      Continuar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <PatientTabModal
          tab={selectedTab}
          products={workspace.products}
          onOpened={(tab) => setModal({ id: tab.id })}
          onClose={() => setModal(null)}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}
