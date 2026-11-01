import {
  acceptsPaymentInstallments,
  settlementBreakdown,
  type PaymentMethod,
  type PaymentPart,
  type PaymentTiming,
  type SettlementAdjustments,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { PaymentPartsField } from "../../shared/components/PaymentPartsField";
import {
  effectiveDrafts,
  fromPaymentParts,
  paymentDraftsIssue,
  toPaymentParts,
} from "../../shared/lib/payment-parts";
import { usePaymentMethodSettings } from "../../shared/hooks/usePaymentMethodSettings";
import { currency } from "../../shared/lib/formatting";
import { financeTermHelp } from "./model";
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
    /** Pagamento picado (várias formas); ausente = uma forma só (`method`). */
    payments?: PaymentPart[],
  ) => Promise<void>;
}) {
  // Por padrão a baixa é agora; "Pagamento antigo?" libera as datas para edição.
  const [pastPayment, setPastPayment] = useState(false),
    [paidAt, setPaidAt] = useState(nowForInput),
    [availableAt, setAvailableAt] = useState("");
  // Formas do pagamento: começa com as previstas na venda, a forma combinada no plano
  // ou Pix; "Adicionar forma" pica.
  const [parts, setParts] = useState(() =>
    fromPaymentParts(
      target.paymentParts,
      target.amountInCents,
      target.paymentMethod ?? "pix",
    ),
  );
  const paymentSettings = usePaymentMethodSettings();
  // Baixa de parcela (U39): desconto, juros e valor recebido; vazio = valor final inteiro.
  const [discount, setDiscount] = useState<number | null>(null),
    [interest, setInterest] = useState<number | null>(null),
    [received, setReceived] = useState<number | null>(null),
    [balanceDueDate, setBalanceDueDate] = useState(target.dueDate ?? "");
  const [proofs, setProofs] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const formDirty = useFormDirty({
    pastPayment,
    paidAt,
    availableAt,
    parts,
    discount,
    interest,
    received,
    balanceDueDate,
  });
  const dirty = formDirty || proofs.length > 0;
  const isReceivable = target.kind === "receivable";
  // Parcela de um parcelamento (plano parcelado) não se parcela de novo na forma.
  const canSplitPayment = isReceivable && acceptsPaymentInstallments(target);
  const split = parts.length > 1;
  // Valor final da parcela (sem considerar o recebido): base para dividir as formas.
  const finalInCents = isReceivable
    ? settlementBreakdown(target.amountInCents, {
        ...(discount ? { discountInCents: discount } : {}),
        ...(interest ? { interestInCents: interest } : {}),
      }).finalInCents
    : target.amountInCents;
  const effective = effectiveDrafts(parts, finalInCents);
  const payments = split
    ? toPaymentParts(effective).map((part) =>
        canSplitPayment
          ? part
          : {
              paymentMethod: part.paymentMethod,
              amountInCents: part.amountInCents,
            },
      )
    : undefined;
  const [first] = effective;
  const method = first?.paymentMethod ?? "pix";
  const paymentInstallments = first?.installments ?? 1;
  // Só os ajustes informados: a baixa simples continua com o mesmo pedido de antes. No picado,
  // o valor recebido é a soma das formas.
  const values: SettlementAdjustments = {
    ...(discount ? { discountInCents: discount } : {}),
    ...(interest ? { interestInCents: interest } : {}),
    ...(payments
      ? {
          receivedInCents: payments.reduce(
            (sum, part) => sum + part.amountInCents,
            0,
          ),
        }
      : received === null
        ? {}
        : { receivedInCents: received }),
  };
  const breakdown = settlementBreakdown(target.amountInCents, values);
  const partsIssue = split
    ? paymentDraftsIssue(parts, finalInCents, isReceivable)
    : null;
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
    ...(payments
      ? {
          ...(discount ? { discountInCents: discount } : {}),
          ...(interest ? { interestInCents: interest } : {}),
          payments,
        }
      : values),
    ...(!payments && canSplitPayment && paymentInstallments > 1
      ? { paymentInstallments }
      : {}),
    ...(breakdown.balanceInCents > 0 && balanceDueDate
      ? { balanceDueDate }
      : {}),
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (partsIssue) {
      setError(partsIssue);
      return;
    }
    if (isReceivable && breakdown.error) {
      setError(breakdown.error);
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onConfirm(
        method,
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
        payments,
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
        <PaymentPartsField
          className="span-2"
          parts={parts}
          onChange={setParts}
          totalInCents={finalInCents}
          methodLabel={
            isReceivable
              ? "Forma de pagamento recebida"
              : "Forma de pagamento usada"
          }
          settings={paymentSettings}
          disabled={loading}
          allowPartial={isReceivable}
          // Despesa e parcela de plano parcelado: sem parcelamento na forma.
          {...(canSplitPayment ? {} : { renderInstallments: () => null })}
          hint={
            isReceivable
              ? "Recebeu em mais de uma forma? Adicione as outras e informe o valor de cada uma."
              : "Pagou em mais de uma forma? Adicione as outras e informe o valor de cada uma."
          }
        />
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
            {!split && (
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
