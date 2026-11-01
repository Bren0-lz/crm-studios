import {
  type PaymentMethod,
  type PaymentMethodSettings,
  maxPaymentParts,
  paymentMethodLabels,
  paymentMethodSchema,
} from "@crm/contracts";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { currency } from "../lib/formatting";
import {
  type PaymentPartDraft,
  addDraft,
  draftTotal,
  effectiveDrafts,
  paymentDraftsIssue,
  removeDraft,
  setDraftAmount,
} from "../lib/payment-parts";
import { AnimatedFieldset } from "./AnimatedFieldset";
import { MoneyInput } from "./MoneyInput";
import { PaymentInstallmentsSelect } from "./PaymentInstallmentsSelect";

const money = (cents: number) => currency.format(cents / 100);

/**
 * Formas de pagamento de uma venda, plano, baixa ou conta a pagar: começa com uma forma (o
 * valor é o total) e "Adicionar forma de pagamento" pica o pagamento em várias, cada uma com
 * valor e parcelamento. Nunca fica sem forma: a última não tem "Remover". As formas entram e
 * saem com a mesma animação dos itens do cadastro de cliente.
 */
export function PaymentPartsField({
  parts,
  onChange,
  totalInCents,
  methodLabel = "Forma de pagamento",
  settings,
  disabled = false,
  allowPartial = false,
  autoBalance = !allowPartial,
  legend = "Formas de pagamento",
  hint,
  renderInstallments,
  className,
}: {
  parts: PaymentPartDraft[];
  onChange: (parts: PaymentPartDraft[]) => void;
  /** Valor a dividir entre as formas. */
  totalInCents: number;
  methodLabel?: string;
  settings: PaymentMethodSettings | null;
  disabled?: boolean;
  /** Baixa de parcela: soma menor que o total vira pagamento parcial. */
  allowPartial?: boolean;
  /** A última forma não digitada completa o total sozinha. */
  autoBalance?: boolean;
  legend?: ReactNode;
  hint?: ReactNode;
  /** Parcelas de uma forma; padrão: parcelamento na própria forma (cartão em 3x). */
  renderInstallments?: (
    part: PaymentPartDraft,
    index: number,
    setInstallments: (installments: number) => void,
  ) => ReactNode;
  className?: string;
}) {
  const effective = effectiveDrafts(parts, totalInCents);
  const split = effective.length > 1;
  // Chave estável de cada forma (a animação de saída precisa do mesmo bloco).
  const [ids, setIds] = useState(() => ({
    keys: parts.map((_, index) => index),
    next: parts.length,
  }));
  // Formas trocadas de fora (limpar o formulário): chaves novas.
  if (ids.keys.length !== parts.length)
    setIds({
      keys: parts.map((_, index) => ids.next + index),
      next: ids.next + parts.length,
    });
  const keys = ids.keys;
  const [notice, setNotice] = useState<{ id: number; text: string }>();
  const announce = (text: string) =>
    setNotice((current) => ({ id: (current?.id ?? 0) + 1, text }));
  const total = draftTotal(effective);
  const issue = split
    ? paymentDraftsIssue(parts, totalInCents, allowPartial)
    : null;
  const update = (index: number, patch: Partial<PaymentPartDraft>) =>
    onChange(
      effective.map((part, position) =>
        position === index ? { ...part, ...patch } : part,
      ),
    );
  function add() {
    setIds((current) => ({
      keys: [...current.keys, current.next],
      next: current.next + 1,
    }));
    onChange(addDraft(parts, totalInCents, autoBalance));
    announce(`Forma ${parts.length + 1} adicionada logo abaixo.`);
  }
  function removeAt(key: number) {
    const index = keys.indexOf(key);
    if (index < 0) return;
    setIds((current) => ({
      ...current,
      keys: current.keys.filter((item) => item !== key),
    }));
    onChange(removeDraft(parts, totalInCents, index, autoBalance));
    announce("Forma de pagamento removida.");
  }
  const autoIndex = autoBalance
    ? effective.map((part) => Boolean(part.auto)).lastIndexOf(true)
    : -1;
  return (
    <fieldset
      className={`form-fieldset payment-parts${className ? ` ${className}` : ""}`}
    >
      <legend>{legend}</legend>
      {hint && <p className="field-hint">{hint}</p>}
      <p className="guided-item-notice" aria-live="polite">
        {notice && (
          <span key={notice.id}>
            <CheckCircle2 size={16} aria-hidden="true" />
            {notice.text}
          </span>
        )}
      </p>
      <div className="payment-parts-list">
        {effective.map((part, index) => {
          const key = keys[index] ?? index;
          const label = split ? `${methodLabel} ${index + 1}` : methodLabel;
          return (
            <AnimatedFieldset
              key={key}
              className="payment-part"
              legend={split ? `Forma ${index + 1}` : "Forma única"}
              onRemoved={() => removeAt(key)}
            >
              {(remove) => (
                <div className="form-grid">
                  <label>
                    {methodLabel}
                    <select
                      aria-label={label}
                      value={part.paymentMethod}
                      disabled={disabled}
                      onChange={(event) =>
                        update(index, {
                          paymentMethod: event.target.value as PaymentMethod,
                          ...(renderInstallments ? {} : { installments: 1 }),
                        })
                      }
                    >
                      {paymentMethodSchema.options.map((method) => (
                        <option key={method} value={method}>
                          {paymentMethodLabels[method]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {split && (
                    <label>
                      Valor (R$)
                      <MoneyInput
                        aria-label={`Valor da forma ${index + 1}`}
                        valueInCents={part.amountInCents}
                        disabled={disabled}
                        onChange={(cents) =>
                          onChange(
                            setDraftAmount(
                              parts,
                              totalInCents,
                              index,
                              cents,
                              autoBalance,
                            ),
                          )
                        }
                      />
                      {index === autoIndex && (
                        <span className="field-hint">
                          Completa o total automaticamente.
                        </span>
                      )}
                    </label>
                  )}
                  {renderInstallments ? (
                    renderInstallments(part, index, (installments) =>
                      update(index, { installments }),
                    )
                  ) : (
                    <PaymentInstallmentsSelect
                      method={part.paymentMethod}
                      settings={settings}
                      value={part.installments}
                      onChange={(installments) =>
                        update(index, { installments })
                      }
                    />
                  )}
                  {split && (
                    <div className="payment-part-actions span-2">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={disabled}
                        onClick={remove}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        {`Remover forma ${index + 1}`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </AnimatedFieldset>
          );
        })}
      </div>
      <div className="payment-parts-footer">
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || parts.length >= maxPaymentParts}
          onClick={add}
        >
          <Plus size={16} aria-hidden="true" />
          Adicionar forma de pagamento
        </button>
        {split && (
          <p className="payment-parts-total" aria-live="polite">
            <span>Soma das formas</span>
            <strong>
              {money(total)} de {money(totalInCents)}
            </strong>
          </p>
        )}
      </div>
      {issue && (
        <p className="payment-parts-issue" role="alert">
          {issue}
        </p>
      )}
    </fieldset>
  );
}
