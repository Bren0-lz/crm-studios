import {
  type PatientPlan,
  planAllowsProratedCharge,
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
 * 1º pagamento do plano recorrente que começa antes do vencimento: por padrão a cobrança
 * proporcional às aulas da turma (`PlanFirstChargeNote`); desligado, o valor é informado à
 * mão (cobrado no início do plano) e fica marcado como "valor manual" no Financeiro e nos
 * relatórios.
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
  if (!planAllowsProratedCharge(plan)) return null;
  const manual = Boolean(plan.manualFirstCharge);
  // Ao desligar, começa do valor proporcional calculado (sem turma, fica em branco).
  const calculatedFirstCharge = () =>
    withPlanFirstCharge(withFirstChargeChoice(plan, { manual: false }), slots)
      .proratedChargeInCents;
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
              valueInCents={plan.proratedChargeInCents ?? null}
              onChange={(cents) =>
                onChange({ manual: true, amountInCents: cents ?? undefined })
              }
            />
          </label>
          <p className="span-2 muted-copy plan-installments-note">
            Valor informado manualmente, sem o cálculo proporcional, cobrado
            no início do plano. As mensalidades têm o valor cheio. No
            Financeiro e nos relatórios, a cobrança aparece como valor manual.
          </p>
        </>
      ) : (
        <PlanFirstChargeNote plan={plan} slots={slots} />
      )}
    </>
  );
}
