import type { InventoryWorkspace, PatientOption } from "@crm/contracts";
import { patientFirstName } from "@crm/contracts";
import { ClipboardList, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PatientPicker } from "../../PatientPicker";
import { EmptyState } from "../../shared/components/EmptyState";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useToast } from "../../shared/feedback/toast-context";
import { currency, shortDate } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
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
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = useFormDirty({ patientId, notes }, opening);
  useEffect(() => {
    if (!opening) return;
    let alive = true;
    api
      .patientOptions()
      .then((items) => {
        if (alive) setPatients(items);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [opening]);
  const tabs = workspace.tabs
    .filter((tab) => tab.status === "open")
    .sort((left, right) => right.openedAt.localeCompare(left.openedAt));
  const selectedTab = workspace.tabs.find((item) => item.id === selected);
  function startOpening() {
    setPatientId("");
    setNotes("");
    setError("");
    setOpening(true);
  }
  async function openTab(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const tab = await api.openPatientTab({ patientId, notes });
      toast.success(`Comanda de ${patientFirstName(tab.patientName)} aberta.`);
      await onChanged();
      setOpening(false);
      setSelected(tab.id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Comandas abertas">
      <div className="panel-head">
        <h2>Comandas abertas</h2>
        {can("patients.tabs_create") && (
          <button
            type="button"
            className="secondary-button"
            onClick={startOpening}
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
                      onClick={() => setSelected(tab.id)}
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
      {opening && (
        <Modal
          title="Abrir comanda"
          subtitle="Selecione o cliente para agrupar produtos e serviços."
          busy={busy}
          dirty={dirty}
          onClose={() => setOpening(false)}
        >
          <form className="clinical-form" onSubmit={openTab}>
            {error && <p className="form-error">{error}</p>}
            <PatientPicker
              patients={patients}
              value={patientId}
              onChange={setPatientId}
              required
            />
            <label>
              Observações
              <textarea
                maxLength={500}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
              <button className="primary-button" disabled={busy || !patientId}>
                Abrir comanda
              </button>
            </div>
          </form>
        </Modal>
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
