import type { PatientTab } from "@crm/contracts";
import { productItemName } from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { Modal } from "../../shared/components/Modal";
import { currency, shortDate } from "../../shared/lib/formatting";
import { saleDate, saleStatusLabel } from "./model";

/** Detalhes de uma venda do histórico: itens, total e cancelamento com estorno do estoque. */
export function SaleDetailsModal({
  sale,
  onClose,
  onChanged,
}: {
  sale: PatientTab;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { can } = useAuthorization();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const total = currency.format(sale.totalInCents / 100);
  return (
    <Modal
      title={`Venda · ${sale.patientName}`}
      subtitle={`${shortDate.format(new Date(`${saleDate(sale)}T12:00:00`))} · ${saleStatusLabel(sale)}`}
      onClose={onClose}
    >
      <div className="clinical-form">
        {error && <ErrorBanner error={error} />}
        {notice && <p role="status">{notice}</p>}
        <ul className="patient-tab-items">
          {sale.items.map((item) => (
            <li key={item.id}>
              <div className="patient-tab-item-main">
                <strong>{productItemName(item)}</strong>
                <span>
                  {item.quantity} ×{" "}
                  {currency.format(item.unitPriceInCents / 100)}
                </span>
              </div>
              <span className="patient-tab-amount">
                {currency.format(item.totalInCents / 100)}
              </span>
            </li>
          ))}
          {(sale.services ?? []).map((item) => (
            <li key={item.id}>
              <div className="patient-tab-item-main">
                <strong>{item.serviceName}</strong>
                <span>{item.professionalName}</span>
              </div>
              <span className="patient-tab-amount">
                {currency.format(item.amountInCents / 100)}
              </span>
            </li>
          ))}
        </ul>
        <p className="sale-total">
          Total <strong>{total}</strong>
        </p>
        {sale.notes && <p className="muted">{sale.notes}</p>}
        {sale.status !== "cancelled" && can("patients.tabs_cancel") && (
          <div className="modal-actions">
            <button
              type="button"
              className="danger-button"
              onClick={() => setConfirming(true)}
            >
              Cancelar venda
            </button>
          </div>
        )}
      </div>
      {confirming && (
        <ActionModal
          eyebrow="Vendas"
          title="Cancelar venda"
          subtitle={`${sale.patientName} · Total ${total}`}
          effect="Cancelar esta venda devolve os produtos ao estoque. Uma cobrança paga exige estorno prévio no Financeiro."
          confirmLabel="Cancelar venda"
          danger
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            setError("");
            setNotice("");
            await api.cancelPatientTab(sale.id);
            setConfirming(false);
            try {
              await onChanged();
              setNotice("Venda cancelada; estoque restituído.");
            } catch (cause) {
              setError((cause as Error).message);
            }
          }}
        />
      )}
    </Modal>
  );
}
