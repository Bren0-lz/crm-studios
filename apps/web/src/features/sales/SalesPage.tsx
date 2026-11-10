import type { InventoryWorkspace } from "@crm/contracts";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { allBranches, api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { salesTabFromParam, salesTabLabels, type SalesTab } from "./model";
import { InventorySection } from "./InventorySection";
import { NewSaleSection } from "./NewSaleSection";
import { ProductCatalogsSection } from "./ProductCatalogsSection";
import { SalesHistorySection } from "./SalesHistorySection";
import { SalesSuppliersSection } from "./SalesSuppliersSection";
import { SalesSummarySection } from "./SalesSummarySection";

/**
 * Vendas de produtos: registro em uma etapa, histórico, resumo e os cadastros de
 * produtos (estoque, categorias e marcas) e de fornecedores (permissão própria).
 */
export function SalesPage() {
  const { can } = useAuthorization();
  const canSell =
    can("patients.tabs_create") &&
    can("patients.tabs_items") &&
    can("patients.tabs_close");
  const tabs: SalesTab[] = [
    ...(canSell ? (["new"] as const) : []),
    "history",
    "summary",
    "inventory",
    "catalogs",
    ...(can("patients.suppliers_manage") ? (["suppliers"] as const) : []),
  ];
  const [searchParams] = useSearchParams();
  const requested = salesTabFromParam(searchParams.get("aba"));
  const [tab, setTab] = useState<SalesTab>(
    requested && tabs.includes(requested) ? requested : tabs[0]!,
  );
  const [data, setData] = useState<InventoryWorkspace | null>(null);
  const [error, setError] = useState("");
  const canView = can("patients.inventory_view");
  async function reload() {
    setData(await api.inventoryWorkspace(allBranches));
  }
  // Recarrega em silêncio quando uma venda ou ajuste muda o estoque (QC6).
  const version = useDataVersion("inventory");
  useEffect(() => {
    if (!canView) return;
    let alive = true;
    api
      .inventoryWorkspace(allBranches)
      .then((workspace) => {
        if (alive) setData(workspace);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [canView, version]);
  return (
    <>
      <PageHeader
        title="Vendas de produtos"
        description="Registre vendas, cadastre produtos e controle o estoque."
      />
      {!canView ? (
        <section className="panel">
          <EmptyState
            title="Sem acesso às vendas"
            copy="Peça a um administrador a permissão para consultar estoque e comandas."
          />
        </section>
      ) : (
        <>
          {error && <ErrorBanner error={error} />}
          <section className="finance-controls">
            <div
              className="activity-tabs finance-tabs"
              role="group"
              aria-label="Seções de vendas"
            >
              {tabs.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`tab-button ${tab === key ? "active" : ""}`}
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                >
                  {salesTabLabels[key]}
                </button>
              ))}
            </div>
          </section>
          {tab === "inventory" ? (
            <InventorySection
              onSell={canSell ? () => setTab("new") : undefined}
            />
          ) : tab === "catalogs" ? (
            <ProductCatalogsSection />
          ) : tab === "suppliers" ? (
            <SalesSuppliersSection />
          ) : !data ? (
            !error && <LoadingBlock />
          ) : tab === "new" ? (
            <NewSaleSection workspace={data} />
          ) : tab === "history" ? (
            <SalesHistorySection workspace={data} onChanged={reload} />
          ) : (
            <SalesSummarySection workspace={data} />
          )}
        </>
      )}
    </>
  );
}
