import {
  settlementBreakdown,
  type PaymentMethod,
  type PaymentTiming,
  type SettlementAdjustments,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { Modal } from "../../shared/components/Modal";
import { MoneyInput } from "../../shared/components/MoneyInput";
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
  onConfirm: (
    method: PaymentMethod,
    timing?: PaymentTiming,
    adjustments?: SettlementAdjustments,
  ) => Promise<void>;
}) {
  const [paidAt, setPaidAt] = useState(""),
    [availableAt, setAvailableAt] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("pix");
  // Baixa de parcela (U39): desconto, juros e valor recebido; vazio = valor final inteiro.
  const [discount, setDiscount] = useState<number | null>(null),
    [interest, setInterest] = useState<number | null>(null),
    [received, setReceived] = useState<number | null>(null),
    [balanceDueDate, setBalanceDueDate] = useState(target.dueDate ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isReceivable = target.kind === "receivable";
  // Só os ajustes informados: a baixa simples continua com o mesmo pedido de antes.
  const values: SettlementAdjustments = {
    ...(discount ? { discountInCents: discount } : {}),
    ...(interest ? { interestInCents: interest } : {}),
    ...(received === null ? {} : { receivedInCents: received }),
  };
  const breakdown = settlementBreakdown(target.amountInCents, values);
  const adjustments: SettlementAdjustments = {
    ...values,
    ...(breakdown.balanceInCents > 0 && balanceDueDate
      ? { balanceDueDate }
      : {}),
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isReceivable && breakdown.error) {
      setError(breakdown.error);
      return;
    }
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
        isReceivable ? adjustments : undefined,
      );
    } catch (cause) {
      setError((cause as Error).message);
      setLoading(false);
    }
  }
  const money = (cents: number) => currency.format(cents / 100);
  return (
    <Modal
      eyebrow="Financeiro"
      title={isReceivable ? "Dar baixa na parcela" : "Pagar despesa"}
      subtitle={`${target.title} · ${target.description} · ${money(target.amountInCents)}`}
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
        {isReceivable && (
          <>
            <label>
              Desconto (R$)
              <MoneyInput
                aria-label="Desconto"
                valueInCents={discount}
                disabled={loading}
                onChange={setDiscount}
              />
            </label>
            <label>
              Juros (R$)
              <MoneyInput
                aria-label="Juros"
                valueInCents={interest}
                disabled={loading}
                onChange={setInterest}
              />
            </label>
            <label>
              Valor recebido (R$)
              <MoneyInput
                aria-label="Valor recebido"
                valueInCents={received}
                placeholder={money(breakdown.finalInCents)}
                disabled={loading}
                onChange={setReceived}
              />
            </label>
            <div className="settle-summary" aria-live="polite">
              <span>Valor final</span>
              <strong>{money(breakdown.finalInCents)}</strong>
            </div>
            {!breakdown.error && breakdown.balanceInCents > 0 && (
              <>
                <p className="span-2 muted-copy">
                  Pagamento parcial: a parcela é baixada por{" "}
                  {money(breakdown.receivedInCents)} e o saldo de{" "}
                  {money(breakdown.balanceInCents)} vira uma nova parcela.
                </p>
                <label>
                  Vencimento do saldo
                  <input
                    type="date"
                    required
                    value={balanceDueDate}
                    disabled={loading}
                    onChange={(event) => setBalanceDueDate(event.target.value)}
                  />
                </label>
              </>
            )}
          </>
        )}
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
