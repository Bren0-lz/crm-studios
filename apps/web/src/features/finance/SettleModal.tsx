import type { PaymentTiming, PaymentMethod } from "@crm/contracts";
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
  onConfirm: (method: PaymentMethod, timing?: PaymentTiming) => Promise<void>;
}) {
  const [paidAt, setPaidAt] = useState(""),
    [availableAt, setAvailableAt] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isReceivable = target.kind === "receivable";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onConfirm(
        method,
        paidAt || availableAt
          ? {
              ...(paidAt ? { paidAt: new Date(paidAt).toISOString() } : {}),
              ...(availableAt
                ? { availableAt: new Date(availableAt).toISOString() }
                : {}),
            }
          : undefined,
      );
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
        <details className="span-2">
          <summary>Datas do pagamento e do caixa</summary>
          <div className="form-grid">
            <label>
              Data e hora do pagamento
              <input
                type="datetime-local"
                value={paidAt}
                disabled={loading}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </label>
            <label>
              Disponibilidade no caixa
              <input
                type="datetime-local"
                value={availableAt}
                disabled={loading}
                onChange={(event) => setAvailableAt(event.target.value)}
              />
            </label>
            <p className="muted-copy">
              Campos vazios mantêm os padrões do lançamento. O lançamento e o
              vencimento permanecem independentes.
            </p>
          </div>
        </details>
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
