import type {
  InventoryWorkspace,
  PatientTab,
  PatientOption,
} from "@crm/contracts";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { Modal } from "../../shared/components/Modal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { EmptyState } from "../../shared/components/EmptyState";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency } from "../../shared/lib/formatting";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { PatientTabModal } from "./PatientTabModal";

/**
 * Comandas do cliente (QM9). Produtos e estoque ficam na aba "Estoque" do Financeiro;
 * aqui só se abrem e consultam comandas, que vendem os produtos cadastrados lá.
 * Na ficha (`patientId`) o painel já vem aberto; na lista de clientes fica recolhido.
 */
export function InventoryPanel({
  patientId,
}: {
  patientId?: string | undefined;
}) {
  const { can } = useAuthorization();
  const [opened, setOpened] = useState(Boolean(patientId)),
    [data, setData] = useState<InventoryWorkspace | null>(null),
    [error, setError] = useState(""),
    [patients, setPatients] = useState<PatientOption[]>([]);
  const [opening, setOpening] = useState(false),
    [selected, setSelected] = useState<PatientTab | null>(null),
    [busy, setBusy] = useState(false);
  const [client, setClient] = useState(patientId ?? ""),
    [notes, setNotes] = useState("");
  async function load() {
    setData(await api.inventoryWorkspace());
  }
  const version = useDataVersion("inventory");
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    api
      .patientOptions()
      .then((patientData) => {
        if (alive) setPatients(patientData);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [opened]);
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
  async function openTab(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const tab = await api.openPatientTab({ patientId: client, notes });
      await load();
      setOpening(false);
      setSelected(tab);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const tabs =
    data?.tabs.filter((tab) => !patientId || tab.patientId === patientId) ??
    [];
  const body = (
    <div className="inventory-body">
      {error && <ErrorBanner error={error} />}
      {!data ? (
        !error && <LoadingBlock />
      ) : (
        <>
          {can("patients.tabs_create") && (
            <div className="page-actions">
              <button
                className="primary-button"
                onClick={() => setOpening(true)}
              >
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
                  onClick={() => setSelected(tab)}
                >
                  Abrir comanda
                </button>
              </div>
            ))
          )}
        </>
      )}
      {opening && (
        <Modal
          title="Abrir comanda"
          subtitle="Selecione o cliente para agrupar produtos e serviços."
          busy={busy}
          onClose={() => setOpening(false)}
        >
          <form className="clinical-form" onSubmit={openTab}>
            {error && <ErrorBanner error={error} />}
            <label>
              Cliente
              <PatientPicker
                patients={patients}
                value={client}
                onChange={setClient}
                required
              />
            </label>
            <label>
              Observações
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button className="primary-button" disabled={busy}>
                Abrir comanda
              </button>
            </div>
          </form>
        </Modal>
      )}
      {selected && data && (
        <PatientTabModal
          tab={data.tabs.find((item) => item.id === selected.id) ?? selected}
          products={data.products}
          onClose={() => setSelected(null)}
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
