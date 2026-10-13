import type { PaymentMethod } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { Modal } from "../../shared/components/Modal";
import { currency } from "../../shared/lib/formatting";
import { paymentMethodOptions } from "./model";
import type { SettleTarget } from "./types";

export function SettleModal({
  target,
  onClose,
  onConfirm,
}: {
  target: SettleTarget;
  onClose: () => void;
  onConfirm: (method: PaymentMethod) => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isReceivable = target.kind === "receivable";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onConfirm(method);
    } catch (cause) {
      setError((cause as Error).message);
      setLoading(false);
    }
  }
  return (
    <Modal
      eyebrow="Financeiro"
      title={isReceivable ? "Dar baixa na parcela" : "Pagar despesa"}
      subtitle={`${target.title} · ${target.description} · ${currency.format(target.amountInCents / 100)}`}
      busy={loading}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          {isReceivable
            ? "Forma de pagamento recebida"
            : "Forma de pagamento usada"}
          <select
            autoFocus
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          >
            {paymentMethodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={loading}
          >
            Voltar
          </button>
          <button className="primary-button" disabled={loading}>
            {loading
              ? "Salvando…"
              : isReceivable
                ? "Confirmar baixa"
                : "Confirmar pagamento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
