import { type PatientPlan, installmentsBeyondValidity } from "@crm/contracts";
import { formatIsoDate } from "../../shared/lib/formatting";

/**
 * Parcelas do plano. Recorrente: uma cobrança por ciclo, sem campo. Pacote: aceita
 * parcelas depois da validade, mas avisa.
 */
export function PlanInstallmentsField({
  kind,
  installments,
  firstDueDate,
  validUntil,
  onChange,
}: {
  kind: PatientPlan["kind"] | undefined;
  installments: number;
  firstDueDate: string;
  validUntil: string | undefined;
  onChange: (installments: number) => void;
}) {
  if (kind === "recurring")
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
  return (
    <>
      <label>
        Parcelas
        <input
          required
          type="number"
          min="1"
          max="36"
          value={installments}
          onChange={(event) => onChange(Number(event.target.value))}
        />
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
