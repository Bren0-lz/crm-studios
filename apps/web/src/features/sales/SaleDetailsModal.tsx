import type { PatientTab, PatientTabPayment } from "@crm/contracts";
import { paymentMethodLabels, productItemName } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { currency, shortDate } from "../../shared/lib/formatting";
import { saleDate, saleStatusLabel } from "./model";

const paymentStatusLabels: Record<PatientTabPayment["status"], string> = {
  paid: "Pago",
  open: "Em aberto",
  cancelled: "Cancelado",
};

/** Forma de pagamento com o parcelamento ("Cartão em 3x"); sem forma, "—". */
function paymentMethodText(payment: PatientTabPayment) {
  if (!payment.paymentMethod) return "—";
  const label = paymentMethodLabels[payment.paymentMethod];
  return payment.paymentInstallments && payment.paymentInstallments > 1
    ? `${label} em ${payment.paymentInstallments}x`
    : label;
}

function SalePayment({ payment }: { payment: PatientTabPayment }) {
  return (
    <section className="sale-payment" aria-label="Pagamento">
      <h3>Pagamento</h3>
      <dl>
        <div>
          <dt>Situação</dt>
          <dd>{paymentStatusLabels[payment.status]}</dd>
        </div>
        <div>
          <dt>Valor</dt>
          <dd>{currency.format(payment.amountInCents / 100)}</dd>
        </div>
        <div>
          <dt>Forma</dt>
          <dd>{paymentMethodText(payment)}</dd>
        </div>
        {payment.paidAt ? (
          <div>
            <dt>Pago em</dt>
            <dd>{shortDate.format(new Date(payment.paidAt))}</dd>
          </div>
        ) : (
          <div>
            <dt>Vencimento</dt>
            <dd>{shortDate.format(new Date(`${payment.dueDate}T12:00:00`))}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/**
 * Detalhes de uma venda do histórico: itens, total, pagamento e cancelamento com estorno do
 * estoque (e do pagamento, para quem tem a permissão).
 */
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
  const [refund, setRefund] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [payment, setPayment] = useState<PatientTabPayment | null>();
  const [paymentError, setPaymentError] = useState("");
  const total = currency.format(sale.totalInCents / 100);

  useEffect(() => {
    let active = true;
    api
      .patientTabPayment(sale.id)
      .then((result) => {
        if (!active) return;
        setPayment(result.payment);
        setPaymentError("");
      })
      .catch((cause: Error) => active && setPaymentError(cause.message));
    return () => {
      active = false;
    };
  }, [sale.id, sale.status]);

  const paid = payment?.status === "paid" ? payment : null;
  const canRefund = can("patients.tabs_refund");
  const paidAmount = paid ? currency.format(paid.amountInCents / 100) : "";
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
        {paymentError ? (
          <ErrorBanner error={paymentError} />
        ) : payment === undefined ? (
          <LoadingBlock />
        ) : payment ? (
          <SalePayment payment={payment} />
        ) : (
          <p className="muted">Venda sem cobrança registrada.</p>
        )}
        {sale.status !== "cancelled" && can("patients.tabs_cancel") && (
          <div className="modal-actions">
            <button
              type="button"
              className="danger-button"
              disabled={payment === undefined && !paymentError}
              onClick={() => {
                setRefund(false);
                setConfirming(true);
              }}
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
          effect={
            !paid
              ? "Cancelar esta venda devolve os produtos ao estoque."
              : canRefund
                ? `O pagamento de ${paidAmount} (${paymentMethodText(paid)}) já foi recebido. Cancelar esta venda estorna o pagamento e devolve os produtos ao estoque.`
                : `O pagamento de ${paidAmount} (${paymentMethodText(paid)}) já foi recebido. Para cancelar, o pagamento precisa ser estornado por quem tem a permissão de estorno ou no Financeiro.`
          }
          confirmLabel={
            paid && canRefund ? "Estornar e cancelar" : "Cancelar venda"
          }
          danger
          missing={
            paid && !canRefund
              ? ["Permissão para estornar o pagamento"]
              : paid && !refund
                ? ["Confirme o estorno do pagamento"]
                : []
          }
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            setError("");
            setNotice("");
            const refundPayment = Boolean(paid) && canRefund && refund;
            await api.cancelPatientTab(
              sale.id,
              refundPayment ? { refundPayment: true } : undefined,
            );
            setConfirming(false);
            try {
              await onChanged();
              setNotice(
                refundPayment
                  ? "Venda cancelada; pagamento estornado e estoque restituído."
                  : "Venda cancelada; estoque restituído.",
              );
            } catch (cause) {
              setError((cause as Error).message);
            }
          }}
        >
          {paid && canRefund ? (
            <label className="checkbox-field span-2">
              <input
                type="checkbox"
                checked={refund}
                onChange={(event) => setRefund(event.target.checked)}
              />
              Estornar o pagamento de {paidAmount} ao cliente
            </label>
          ) : undefined}
        </ActionModal>
      )}
    </Modal>
  );
}
