import type { FinanceForecastFlow } from "@crm/contracts";
import { currency } from "../../shared/lib/formatting";

export function forecastFlowCells(flow: FinanceForecastFlow) {
  return (
    <>
      <td className="cash-in">{currency.format(flow.inflowInCents / 100)}</td>
      <td className="cash-out">{currency.format(flow.outflowInCents / 100)}</td>
      <td className={flow.balanceInCents < 0 ? "negative" : undefined}>
        {currency.format(flow.balanceInCents / 100)}
      </td>
    </>
  );
}
