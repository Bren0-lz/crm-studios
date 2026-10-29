import { type PatientPlan, planFirstChargeProration } from "@crm/contracts";
import { currency, formatIsoDate } from "../../shared/lib/formatting";

/**
 * 1º pagamento do plano recorrente quando o vencimento não é o fim do 1º ciclo:
 * proporcional às aulas da turma do início até o vencimento.
 */
export function PlanFirstChargeNote({
  plan,
  slots,
}: {
  plan: {
    kind?: PatientPlan["kind"] | undefined;
    totalValueInCents: number;
    validFrom: string;
    firstDueDate: string;
  };
  /** Horários semanais da turma escolhida; sem turma não há como contar as aulas. */
  slots: readonly { weekday: number }[] | undefined;
}) {
  if (plan.kind !== "recurring" || plan.firstDueDate <= plan.validFrom)
    return null;
  const proration = planFirstChargeProration(plan, slots);
  if (proration) {
    const sessions = (count: number) =>
      `${count} ${count === 1 ? "aula" : "aulas"}`;
    return (
      <p className="span-2 plan-installments-note" role="status">
        1º pagamento proporcional:{" "}
        <strong>{currency.format(proration.amountInCents / 100)}</strong> (
        {sessions(proration.sessions)} da turma até{" "}
        {formatIsoDate(plan.firstDueDate)}, de{" "}
        {sessions(proration.cycleSessions)} no ciclo até{" "}
        {formatIsoDate(proration.cycleEnd)}). As cobranças seguintes têm o valor
        cheio.
      </p>
    );
  }
  if (slots?.length) return null;
  return (
    <p className="span-2 muted-copy plan-installments-note">
      Escolha a turma para calcular o 1º pagamento proporcional às aulas até o
      vencimento. Sem turma, o 1º pagamento tem o valor cheio.
    </p>
  );
}
