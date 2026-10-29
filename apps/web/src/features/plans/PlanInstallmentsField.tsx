import {
  type PatientPlan,
  type PaymentMethod,
  type PaymentMethodSettings,
  installmentsBeyondValidity,
  installmentsLimit,
  installmentsLimitLabel,
  paymentMethodLabels,
} from "@crm/contracts";
import { useEffect, useId } from "react";
import { formatIsoDate } from "../../shared/lib/formatting";

/**
 * Parcelas do plano. Recorrente: uma cobrança por ciclo, sem campo. Pacote: aceita
 * parcelas depois da validade, mas avisa. O máximo vem da forma de pagamento
 * (Configurações › Formas de pagamento) e do plano do catálogo; ao baixar o limite,
 * a quantidade acompanha.
 */
export function PlanInstallmentsField({
  kind,
  installments,
  firstDueDate,
  validUntil,
  paymentMethod,
  settings,
  template,
  onChange,
}: {
  kind: PatientPlan["kind"] | undefined;
  installments: number;
  firstDueDate: string;
  validUntil: string | undefined;
  paymentMethod?: PaymentMethod | undefined;
  /** `null` enquanto carrega: sem limite na tela (a API confere). */
  settings?: PaymentMethodSettings | null | undefined;
  template?: { maxInstallments?: number | null | undefined } | undefined;
  onChange: (installments: number) => void;
}) {
  const limit = installmentsLimit({ settings, paymentMethod, template });
  const hintId = useId();
  const recurring = kind === "recurring";
  useEffect(() => {
    if (!recurring && installments > limit.max) onChange(limit.max);
  }, [recurring, installments, limit.max, onChange]);
  if (recurring)
    return (
      <p className="muted-copy plan-installments-note">
        Plano recorrente: 1 cobrança por ciclo. A próxima é gerada na renovação.
      </p>
    );
  const beyond = installmentsBeyondValidity({
    installments,
    firstDueDate,
    validUntil,
  });
  const hint =
    limit.reason === "none"
      ? ""
      : limit.reason === "template"
        ? `Este plano: ${installmentsLimitLabel(limit.max)}.`
        : `${paymentMethodLabels[paymentMethod!]}: ${installmentsLimitLabel(limit.max)}.`;
  return (
    <>
      <label>
        Parcelas
        <input
          required
          type="number"
          aria-label="Parcelas"
          aria-describedby={hint ? hintId : undefined}
          min="1"
          max={limit.max}
          readOnly={limit.max <= 1}
          value={installments}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {hint && (
          <span className="field-hint" id={hintId}>
            {hint}
          </span>
        )}
      </label>
      {beyond && validUntil && (
        <p className="span-2 plan-installments-warning" role="status">
          A última parcela vence em {formatIsoDate(beyond)}, depois do fim da
          validade ({formatIsoDate(validUntil)}).
        </p>
      )}
    </>
  );
}
