import {
  type PatientPlan,
  planInstallmentSchedule,
  withPlanFirstCharge,
} from "@crm/contracts";
import { MoneyInput } from "../../shared/components/MoneyInput";
import {
  type FirstChargeTerms,
  type PlanFirstChargeChoice,
  withFirstChargeChoice,
} from "./first-charge";
import { PlanFirstChargeNote } from "./PlanFirstChargeNote";

type Plan = Parameters<typeof planInstallmentSchedule>[0] &
  FirstChargeTerms & {
    kind?: PatientPlan["kind"] | undefined;
    validFrom: string;
  };

/**
 * 1º pagamento do plano recorrente: por padrão proporcional às aulas da turma até o
 * vencimento (`PlanFirstChargeNote`); desligado, o valor é informado à mão e a cobrança fica
 * marcada como "valor manual" no Financeiro e nos relatórios.
 */
export function PlanFirstChargeFields({
  plan,
  slots,
  disabled,
  onChange,
}: {
  plan: Plan;
  /** Horários semanais da turma escolhida (base do cálculo proporcional). */
  slots: readonly { weekday: number }[] | undefined;
  disabled?: boolean | undefined;
  onChange: (choice: PlanFirstChargeChoice) => void;
}) {
  if (plan.kind !== "recurring") return null;
  const manual = Boolean(plan.manualFirstCharge);
  // Ao desligar, começa do valor que seria cobrado (proporcional ou a divisão normal).
  const calculatedFirstCharge = () => {
    const terms = withPlanFirstCharge(
      withFirstChargeChoice(plan, { manual: false }),
      slots,
    );
    if (!terms.firstDueDate || terms.totalValueInCents <= 0) return undefined;
    return planInstallmentSchedule(terms)
      .filter((item) => item.dueDate === terms.firstDueDate)
      .reduce((sum, item) => sum + item.amountInCents, 0);
  };
  return (
    <>
      <label className="checkbox-field span-2">
        <input
          type="checkbox"
          disabled={disabled}
          checked={!manual}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? { manual: false }
                : { manual: true, amountInCents: calculatedFirstCharge() },
            )
          }
        />
        Calcular o 1º pagamento proporcional às aulas até o vencimento
      </label>
      {manual ? (
        <>
          <label>
            Valor do 1º pagamento (R$)
            <MoneyInput
              required
              disabled={disabled}
              valueInCents={plan.firstInstallmentInCents ?? null}
              onChange={(cents) =>
                onChange({ manual: true, amountInCents: cents ?? undefined })
              }
            />
          </label>
          <p className="span-2 muted-copy plan-installments-note">
            Valor informado manualmente, sem o cálculo proporcional. As
            cobranças seguintes têm o valor cheio. No Financeiro e nos
            relatórios, a cobrança aparece como valor manual.
          </p>
        </>
      ) : (
        <PlanFirstChargeNote plan={plan} slots={slots} />
      )}
    </>
  );
}
