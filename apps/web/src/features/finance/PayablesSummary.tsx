import type { Payable } from "@crm/contracts";
import { currency } from "../../shared/lib/formatting";
import { payablesSummary } from "./model";

function countLabel(count: number) {
  return count === 1 ? "1 conta" : `${count} contas`;
}

/** Resumo das contas a pagar: atrasadas, próximos 7 dias, em aberto e pagas no mês. */
export function PayablesSummary({
  payables,
  today,
}: {
  payables: Payable[];
  today: string;
}) {
  const summary = payablesSummary(payables, today);
  const blocks = [
    {
      key: "overdue",
      label: "Em atraso",
      value: summary.overdue,
      tone: summary.overdue.count > 0 ? "alert" : "",
    },
    { key: "dueSoon", label: "Vence em 7 dias", value: summary.dueSoon },
    { key: "open", label: "Total em aberto", value: summary.open },
    {
      key: "paid",
      label: "Pago no mês",
      value: summary.paidThisMonth,
    },
  ];
  return (
    <ul className="payables-summary" aria-label="Resumo das contas a pagar">
      {blocks.map((block) => (
        <li key={block.key} className={block.tone}>
          <span>{block.label}</span>
          <strong>{currency.format(block.value.totalInCents / 100)}</strong>
          <small>{countLabel(block.value.count)}</small>
        </li>
      ))}
    </ul>
  );
}
