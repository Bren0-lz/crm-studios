import {
  type PatientPlan,
  type PaymentMethod,
  type PaymentMethodSettings,
  type PlanPaymentPart,
  installmentsLimit,
  installmentsLimitLabel,
  paymentMethodLabels,
} from "@crm/contracts";
import { useId } from "react";
import { PaymentPartsField } from "../../shared/components/PaymentPartsField";
import {
  effectiveDrafts,
  planDrafts,
  planPaymentFields,
} from "../../shared/lib/payment-parts";
import { PlanInstallmentsField } from "./PlanInstallmentsField";

export interface PlanPaymentValue {
  paymentMethod?: PaymentMethod | undefined;
  installments: number;
  paymentParts?: PlanPaymentPart[] | undefined;
}

/**
 * Formas de pagamento do plano. Uma forma: a forma e as parcelas de sempre. Picado: cada forma
 * com o valor e a quantidade de cobranças dela (no recorrente, uma por ciclo); a soma das
 * formas é o valor total do plano. Nunca fica sem forma de pagamento.
 */
export function PlanPaymentFields({
  plan,
  settings,
  template,
  disabled,
  onChange,
}: {
  plan: PlanPaymentValue & {
    kind?: PatientPlan["kind"] | undefined;
    autoRenew?: boolean | undefined;
    totalValueInCents: number;
    firstDueDate: string;
    validUntil?: string | undefined;
  };
  /** `null` enquanto carrega: sem limite na tela (a API confere). */
  settings: PaymentMethodSettings | null;
  template?: { maxInstallments?: number | null | undefined } | undefined;
  disabled?: boolean;
  onChange: (fields: {
    paymentMethod: PaymentMethod;
    installments: number;
    paymentParts: PlanPaymentPart[] | undefined;
  }) => void;
}) {
  const name = useId();
  const recurring = plan.kind === "recurring";
  const parts = planDrafts(plan);
  return (
    <PaymentPartsField
      className="span-2"
      parts={parts}
      totalInCents={plan.totalValueInCents}
      settings={settings}
      {...(disabled === undefined ? {} : { disabled })}
      hint={
        parts.length > 1
          ? `Marque se cada forma é só da primeira vez ou recorrente: na renovação, o valor fica com as recorrentes.${plan.autoRenew ? " Com renovação automática, ao menos uma precisa ser recorrente." : ""}`
          : "Combinou em mais de uma forma? Adicione as outras: cada uma gera as próprias cobranças."
      }
      renderPartExtra={(part, index, update) =>
        parts.length > 1 ? (
          <fieldset className="form-fieldset span-2">
            <legend>Cobrança da forma {index + 1}</legend>
            <div className="form-fieldset-grid">
              <label className="checkbox-field">
                <input
                  type="radio"
                  name={`${name}-recurring-${index}`}
                  checked={part.recurring === false}
                  disabled={disabled}
                  onChange={() => update({ recurring: false })}
                />
                Só na primeira vez
              </label>
              <label className="checkbox-field">
                <input
                  type="radio"
                  name={`${name}-recurring-${index}`}
                  checked={part.recurring === true}
                  disabled={disabled}
                  onChange={() => update({ recurring: true })}
                />
                Recorrente (segue nas renovações)
              </label>
            </div>
          </fieldset>
        ) : null
      }
      // O plano guarda só os valores: aplica já a forma que completa o total.
      onChange={(next) =>
        onChange(
          planPaymentFields(
            effectiveDrafts(next, plan.totalValueInCents),
            recurring,
          ),
        )
      }
      renderInstallments={(part, index, setInstallments) => {
        if (parts.length === 1)
          return (
            <PlanInstallmentsField
              kind={plan.kind}
              installments={plan.installments}
              firstDueDate={plan.firstDueDate}
              validUntil={plan.validUntil}
              paymentMethod={part.paymentMethod}
              settings={settings}
              template={template}
              onChange={setInstallments}
            />
          );
        if (recurring) return null;
        const limit = installmentsLimit({
          settings,
          paymentMethod: part.paymentMethod,
          template,
        });
        return (
          <label>
            Cobranças
            <input
              type="number"
              aria-label={`Cobranças da forma ${index + 1}`}
              min="1"
              max={limit.max}
              readOnly={limit.max <= 1}
              disabled={disabled}
              value={part.installments}
              onChange={(event) =>
                setInstallments(
                  Math.min(limit.max, Math.max(1, Number(event.target.value))),
                )
              }
            />
            {limit.reason !== "none" && (
              <span className="field-hint">
                {limit.reason === "template"
                  ? `Este plano: ${installmentsLimitLabel(limit.max)}.`
                  : `${paymentMethodLabels[part.paymentMethod]}: ${installmentsLimitLabel(limit.max)}.`}
              </span>
            )}
          </label>
        );
      }}
    />
  );
}
