import {
  acceptsPaymentInstallments,
  maxSettlementPayments,
  settlementBreakdown,
  settlementPaymentsTotal,
  type PaymentMethod,
  type PaymentTiming,
  type SettlementAdjustments,
} from "@crm/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { PaymentInstallmentsSelect } from "../../shared/components/PaymentInstallmentsSelect";
import { usePaymentMethodSettings } from "../../shared/hooks/usePaymentMethodSettings";
import { currency } from "../../shared/lib/formatting";
import { paymentMethodOptions, financeTermHelp } from "./model";
import type { SettleTarget } from "./types";
import { HelpTip } from "../../shared/components/HelpTip";
import { PaymentProofsField } from "./PaymentProofs";

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
    proofs?: File[],
  ) => Promise<void>;
}) {
  // Por padrão a baixa é agora; "Pagamento antigo?" libera as datas para edição.
  const [pastPayment, setPastPayment] = useState(false),
    [paidAt, setPaidAt] = useState(nowForInput),
    [availableAt, setAvailableAt] = useState("");
  // A forma combinada na venda (plano) já vem marcada; dá para trocar se o cliente mudou.
  const [method, setMethod] = useState<PaymentMethod>(
    target.paymentMethod ?? "pix",
  );
  // Parcelas na própria forma (cartão em 3x); só em conta a receber que não é parcela
  // de um parcelamento (não faz sentido parcelar uma parcela).
  const [paymentInstallments, setPaymentInstallments] = useState(1);
  const paymentSettings = usePaymentMethodSettings();
  // Baixa de parcela (U39): desconto, juros e valor recebido; vazio = valor final inteiro.
  const [discount, setDiscount] = useState<number | null>(null),
    [interest, setInterest] = useState<number | null>(null),
    [received, setReceived] = useState<number | null>(null),
    [balanceDueDate, setBalanceDueDate] = useState(target.dueDate ?? "");
  // Pagamento misto: o valor recebido dividido entre formas (cada uma com valor e parcelas).
  const [mixed, setMixed] = useState(false),
    [parts, setParts] = useState<PaymentPart[]>([]);
  const [proofs, setProofs] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const formDirty = useFormDirty({
    pastPayment,
    paidAt,
    availableAt,
    method,
    paymentInstallments,
    discount,
    interest,
    received,
    balanceDueDate,
    mixed,
    parts,
  });
  const dirty = formDirty || proofs.length > 0;
  const isReceivable = target.kind === "receivable";
  const canSplitPayment = isReceivable && acceptsPaymentInstallments(target);
  const mixedPayment = isReceivable && mixed;
  const finalInCents = settlementBreakdown(target.amountInCents, {
    discountInCents: discount ?? 0,
    interestInCents: interest ?? 0,
  }).finalInCents;
  // Misto: a última forma vazia fica com o que faltar do valor final (como "Valor recebido").
  const othersInCents = settlementPaymentsTotal(
    parts.slice(0, -1).map((part) => ({ amountInCents: part.amount ?? 0 })),
  );
  const restInCents = Math.max(0, finalInCents - othersInCents);
  const payments = parts.map((part, index) => ({
    paymentMethod: part.method,
    amountInCents:
      part.amount ?? (index === parts.length - 1 ? restInCents : 0),
    ...(canSplitPayment && part.installments > 1
      ? { paymentInstallments: part.installments }
      : {}),
  }));
  // Só os ajustes informados: a baixa simples continua com o mesmo pedido de antes.
  const values: SettlementAdjustments = {
    ...(discount ? { discountInCents: discount } : {}),
    ...(interest ? { interestInCents: interest } : {}),
    ...(mixedPayment
      ? { receivedInCents: settlementPaymentsTotal(payments) }
      : received === null
        ? {}
        : { receivedInCents: received }),
  };
  const breakdown = settlementBreakdown(target.amountInCents, values);
  const mixedError =
    mixedPayment && parts.slice(0, -1).some((part) => !part.amount)
      ? "Informe o valor de cada forma de pagamento."
      : mixedPayment && breakdown.receivedInCents > breakdown.finalInCents
        ? "A soma das formas de pagamento não pode passar do valor final."
        : "";
  // Pagamento parcial: o saldo precisa de vencimento; sem ele, Confirmar diz o que falta.
  const missing = useMissingFields(
    isReceivable &&
      !breakdown.error &&
      breakdown.balanceInCents > 0 &&
      !balanceDueDate
      ? ["Vencimento do saldo"]
      : [],
  );
  const adjustments: SettlementAdjustments = {
    ...values,
    ...(mixedPayment
      ? { payments }
      : canSplitPayment && paymentInstallments > 1
        ? { paymentInstallments }
        : {}),
    ...(breakdown.balanceInCents > 0 && balanceDueDate
      ? { balanceDueDate }
      : {}),
  };
  function toggleMixed(checked: boolean) {
    setMixed(checked);
    if (checked && parts.length === 0)
      setParts([
        { key: 1, method, amount: received, installments: paymentInstallments },
        {
          key: 2,
          method:
            paymentMethodOptions.find((option) => option.value !== method)
              ?.value ?? method,
          amount: null,
          installments: 1,
        },
      ]);
  }
  function updatePart(key: number, change: Partial<PaymentPart>) {
    setParts((current) =>
      current.map((part) => (part.key === key ? { ...part, ...change } : part)),
    );
  }
  function addPart() {
    setParts((current) => [
      ...current,
      {
        key: Math.max(...current.map((part) => part.key)) + 1,
        method:
          paymentMethodOptions.find(
            (option) => !current.some((part) => part.method === option.value),
          )?.value ?? "pix",
        amount: null,
        installments: 1,
      },
    ]);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mixedError || (isReceivable && breakdown.error)) {
      setError(mixedError || breakdown.error || "");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onConfirm(
        mixedPayment ? (parts[0]?.method ?? method) : method,
        pastPayment && (paidAt || availableAt)
          ? {
              ...(paidAt ? { paidAt: new Date(paidAt).toISOString() } : {}),
              ...(availableAt
                ? { availableAt: new Date(availableAt).toISOString() }
                : {}),
            }
          : undefined,
        isReceivable ? adjustments : undefined,
        proofs,
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
      dirty={dirty}
      onClose={onClose}
    >
      <form className="form-grid settle-form" onSubmit={submit}>
        {isReceivable && target.plan && (
          <dl className="payroll-totals span-2" aria-label="Resumo do plano">
            <div>
              <dt>Valor total do plano</dt>
              <dd>{money(target.plan.totalInCents)}</dd>
            </div>
            <div>
              <dt>Valor da parcela</dt>
              <dd>{money(target.amountInCents)}</dd>
            </div>
            <div>
              <dt>Parcelas pagas</dt>
              <dd>
                {target.plan.paidCount} de {target.plan.installmentCount}
              </dd>
            </div>
          </dl>
        )}
        {isReceivable && (
          <label className="checkbox-field span-2">
            <input
              type="checkbox"
              checked={mixed}
              disabled={loading}
              onChange={(event) => toggleMixed(event.target.checked)}
            />
            Pagamento misto (dividir entre formas de pagamento)
          </label>
        )}
        {!mixedPayment && (
          <label className="span-2">
            {isReceivable
              ? "Forma de pagamento recebida"
              : "Forma de pagamento usada"}
            <select
              autoFocus
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as PaymentMethod)
              }
            >
              {paymentMethodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {mixedPayment && (
          <fieldset className="form-fieldset span-2">
            <legend>Formas de pagamento</legend>
            <div className="settle-parts">
              {parts.map((part, index) => {
                const position = index + 1;
                const last = index === parts.length - 1;
                return (
                  <div className="settle-part" key={part.key}>
                    <label>
                      Forma {position}
                      <select
                        aria-label={`Forma de pagamento ${position}`}
                        value={part.method}
                        disabled={loading}
                        onChange={(event) =>
                          updatePart(part.key, {
                            method: event.target.value as PaymentMethod,
                          })
                        }
                      >
                        {paymentMethodOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Valor (R$)
                      <MoneyInput
                        aria-label={`Valor da forma ${position}`}
                        valueInCents={part.amount}
                        placeholder={last ? money(restInCents) : undefined}
                        disabled={loading}
                        onChange={(cents) =>
                          updatePart(part.key, { amount: cents })
                        }
                      />
                    </label>
                    {canSplitPayment && (
                      <div className="settle-part-installments">
                        <PaymentInstallmentsSelect
                          method={part.method}
                          settings={paymentSettings}
                          value={part.installments}
                          onChange={(installments) =>
                            updatePart(part.key, { installments })
                          }
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`Remover forma ${position}`}
                      disabled={loading || parts.length <= 2}
                      onClick={() =>
                        setParts((current) =>
                          current.filter((other) => other.key !== part.key),
                        )
                      }
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
              <div className="settle-parts-footer">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={loading || parts.length >= maxSettlementPayments}
                  onClick={addPart}
                >
                  <Plus size={16} aria-hidden="true" />
                  Adicionar forma
                </button>
                <p className="muted-copy" aria-live="polite">
                  Total nas formas: {money(breakdown.receivedInCents)} de{" "}
                  {money(breakdown.finalInCents)}. A última forma em branco fica
                  com o restante.
                </p>
              </div>
            </div>
          </fieldset>
        )}
        {isReceivable && (
          <>
            {!mixedPayment && canSplitPayment && (
              <PaymentInstallmentsSelect
                className="span-2"
                method={method}
                settings={paymentSettings}
                value={paymentInstallments}
                onChange={setPaymentInstallments}
              />
            )}
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
            {!mixedPayment && (
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
            )}
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
        <fieldset className="form-fieldset span-2">
          <legend>Datas do pagamento e do caixa</legend>
          <div className="form-fieldset-grid settle-dates">
            <label className="checkbox-field span-2">
              <input
                type="checkbox"
                checked={pastPayment}
                disabled={loading}
                onChange={(event) => {
                  setPastPayment(event.target.checked);
                  if (!event.target.checked) {
                    setPaidAt(nowForInput());
                    setAvailableAt("");
                  }
                }}
              />
              Pagamento antigo?
            </label>
            <label>
              Data e hora do pagamento
              <input
                type="datetime-local"
                value={paidAt}
                required={pastPayment}
                disabled={loading || !pastPayment}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </label>
            <label>
              <span className="label-with-help">
                Disponibilidade no caixa
                <HelpTip
                  term="Disponibilidade no caixa"
                  text={financeTermHelp.cashAvailable}
                />
              </span>
              {/* Sem valor próprio, acompanha a data do pagamento. */}
              <input
                type="datetime-local"
                value={availableAt || paidAt}
                disabled={loading || !pastPayment}
                onChange={(event) => setAvailableAt(event.target.value)}
              />
            </label>
            <p className="span-2 muted-copy">
              {pastPayment
                ? "Informe quando o pagamento aconteceu. O lançamento e o vencimento permanecem independentes."
                : "A baixa é registrada com a data e a hora de agora."}
            </p>
          </div>
        </fieldset>
        <PaymentProofsField
          className="span-2"
          files={proofs}
          onChange={setProofs}
          disabled={loading}
        />
        {error && <div className="form-error span-2">{error}</div>}
        {missing.hint}
        <div className="modal-actions span-2">
          <ModalCancelButton disabled={loading}>Voltar</ModalCancelButton>
          <button
            className="primary-button"
            disabled={loading || missing.blocked}
            aria-describedby={missing.describedBy}
          >
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

// Valor de agora no formato do input datetime-local (hora local, sem segundos).
function nowForInput() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

interface PaymentPart {
  key: number;
  method: PaymentMethod;
  /** Vazio na última forma = o que faltar do valor final. */
  amount: number | null;
  installments: number;
}
