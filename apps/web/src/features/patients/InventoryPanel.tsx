import type {
  InventoryWorkspace,
  PatientTab,
  PatientOption,
} from "@crm/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { allBranches, api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { EmptyState } from "../../shared/components/EmptyState";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency } from "../../shared/lib/formatting";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { PatientTabModal } from "../sales";

/**
 * Comandas do cliente (QM9). Produtos e estoque ficam na aba "Estoque" do Financeiro;
 * aqui só se abrem e consultam comandas, que vendem os produtos cadastrados lá.
 * Na ficha (`patient`) o painel já vem aberto; na lista de clientes fica recolhido.
 */
export function InventoryPanel({
  patient,
}: {
  /** Ficha do cliente: lista só as comandas dele e a nova já vem com ele. */
  patient?: PatientOption | undefined;
}) {
  const patientId = patient?.id;
  const { can } = useAuthorization();
  const [opened, setOpened] = useState(Boolean(patientId)),
    [data, setData] = useState<InventoryWorkspace | null>(null),
    [error, setError] = useState("");
  // `null`: modal fechado; `{}`: comanda nova; `{ tab }`: comanda existente.
  const [modal, setModal] = useState<{ tab?: PatientTab } | null>(null);
  async function load() {
    setData(await api.inventoryWorkspace(allBranches));
  }
  const version = useDataVersion("inventory");
  // Comandas: recarrega em silêncio quando uma mutação muda o domínio (QC6).
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    api
      .inventoryWorkspace()
      .then((workspace) => {
        if (alive) setData(workspace);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [opened, version]);
  if (!can("patients.inventory_view")) return null;
  const tabs =
    data?.tabs.filter((tab) => !patientId || tab.patientId === patientId) ?? [];
  const body = (
    <div className="inventory-body">
      {error && <ErrorBanner error={error} />}
      {!data ? (
        !error && <LoadingBlock />
      ) : (
        <>
          {can("patients.tabs_create") && (
            <div className="page-actions">
              <button className="primary-button" onClick={() => setModal({})}>
                Abrir comanda
              </button>
            </div>
          )}
          {!tabs.length ? (
            <EmptyState
              title="Nenhuma comanda"
              copy="Abra uma comanda para registrar produtos e serviços do cliente."
            />
          ) : (
            tabs.map((tab) => (
              <div className="table-row" key={tab.id}>
                <strong>{tab.patientName}</strong>
                <span>
                  {tab.status === "open"
                    ? "Aberta"
                    : tab.status === "closed"
                      ? "Fechada"
                      : "Cancelada"}
                </span>
                <span className="numeric-value">
                  {currency.format(tab.totalInCents / 100)}
                </span>
                <button
                  className="secondary-button"
                  aria-label={`Ver comanda de ${tab.patientName}`}
                  onClick={() => setModal({ tab })}
                >
                  Ver comanda
                </button>
              </div>
            ))
          )}
        </>
      )}
      {modal && data && (
        <PatientTabModal
          tab={
            modal.tab &&
            (data.tabs.find((item) => item.id === modal.tab?.id) ?? modal.tab)
          }
          products={data.products}
          fixedPatient={patient}
          onOpened={(tab) => setModal({ tab })}
          onClose={() => setModal(null)}
          onChanged={load}
        />
      )}
    </div>
  );
  return patientId ? (
    <CommandsSection>{body}</CommandsSection>
  ) : (
    <section className="panel">
      <details
        onToggle={(event) => {
          if (event.currentTarget.open) setOpened(true);
        }}
      >
        <summary className="panel-head">Comandas</summary>
        {opened && body}
      </details>
    </section>
  );
}

function CommandsSection({ children }: { children: ReactNode }) {
  return (
    <section className="panel" aria-label="Comandas do cliente">
      <div className="panel-head">
        <h2>Comandas</h2>
      </div>
      {children}
    </section>
  );
}
