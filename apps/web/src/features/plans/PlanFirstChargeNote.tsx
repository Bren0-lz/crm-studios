import { type PatientPlan, planFirstChargeProration } from "@crm/contracts";
import { currency, formatIsoDate } from "../../shared/lib/formatting";

/**
 * Plano recorrente pré-pago que começa antes do 1º vencimento: cobrança proporcional às
 * aulas da turma do início até a véspera do vencimento, paga no início, antes da
 * mensalidade cheia (que paga o mês que começa no vencimento).
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
  const monthly = currency.format(plan.totalValueInCents / 100);
  const proration = planFirstChargeProration(plan, slots);
  const sessions = (count: number) =>
    `${count} ${count === 1 ? "aula" : "aulas"}`;
  if (proration)
    return (
      <p className="span-2 plan-installments-note" role="status">
        Cobrança proporcional:{" "}
        <strong>{currency.format(proration.amountInCents / 100)}</strong> em{" "}
        {formatIsoDate(proration.dueDate)} ({sessions(proration.sessions)} da
        turma de {formatIsoDate(plan.validFrom)} a{" "}
        {formatIsoDate(proration.cycleEnd)}, de{" "}
        {sessions(proration.cycleSessions)} no ciclo de{" "}
        {formatIsoDate(proration.cycleStart)} a{" "}
        {formatIsoDate(proration.cycleEnd)}). A partir de{" "}
        {formatIsoDate(plan.firstDueDate)}, {monthly} por mês.
      </p>
    );
  if (slots?.length)
    return (
      <p className="span-2 muted-copy plan-installments-note" role="status">
        Nenhuma aula da turma antes de {formatIsoDate(plan.firstDueDate)}: a 1ª
        cobrança é a mensalidade de {monthly} nesse dia.
      </p>
    );
  return (
    <p className="span-2 muted-copy plan-installments-note">
      Escolha a turma para calcular a cobrança proporcional às aulas até o 1º
      vencimento. Sem turma, só há a mensalidade cheia a partir do vencimento.
    </p>
  );
}
