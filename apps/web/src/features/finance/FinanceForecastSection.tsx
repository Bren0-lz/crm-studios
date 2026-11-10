import type { FinanceForecast } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { currency } from "../../shared/lib/formatting";
import { forecastFlowCells } from "./forecastFlowCells";
import { forecastHorizons, forecastIsEmpty, formatCompetence } from "./model";

export function FinanceForecastSection() {
  const [months, setMonths] = useState(6);
  const [forecast, setForecast] = useState<FinanceForecast | null>(null);
  const [error, setError] = useState("");
  const version = useDataVersion("finance");
  useEffect(() => {
    let active = true;
    api
      .financeForecast(months)
      .then((data) => active && setForecast(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [months, version]);
  const overdue = forecast?.overdue;
  const hasOverdue =
    !!overdue && (overdue.inflowInCents !== 0 || overdue.outflowInCents !== 0);
  return (
    <div className="daily-cash">
      {error && <ErrorBanner error={error} />}
      <section className="panel finance-panel">
        <div className="panel-head">
          <div>
            <h2>Previsão</h2>
            <p className="panel-context">
              {forecast
                ? `${formatCompetence(forecast.startMonth)} a ${formatCompetence(forecast.endMonth)}`
                : "Próximos meses"}
            </p>
            <p className="panel-help">
              Quanto deve entrar e sair do caixa nos próximos meses, mês a mês.
            </p>
          </div>
          <label className="daily-cash-date">
            Horizonte
            <select
              value={months}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value === months) return;
                setForecast(null);
                setError("");
                setMonths(value);
              }}
            >
              {forecastHorizons.map((value) => (
                <option key={value} value={value}>
                  {value} meses
                </option>
              ))}
            </select>
          </label>
        </div>
        {!forecast ? (
          !error && <LoadingBlock />
        ) : forecastIsEmpty(forecast) ? (
          <EmptyState
            title="Nada previsto no período"
            copy="Venda um plano, lance uma conta a pagar ou cadastre uma despesa fixa para ver a previsão. Você também pode aumentar o horizonte."
          />
        ) : (
          <div className="forecast-body">
            <dl className="forecast-legend" aria-label="Legenda da previsão">
              <div>
                <dt>Pagamentos confirmados</dt>
                <dd>
                  Parcelas de clientes e contas a pagar já lançadas e em aberto,
                  pelo vencimento.
                </dd>
              </div>
              <div>
                <dt>Pagamentos em aberto</dt>
                <dd>
                  Renovações automáticas de planos e despesas fixas que ainda
                  vão ser lançadas.
                </dd>
              </div>
            </dl>
            {hasOverdue && overdue && (
              <p className="forecast-overdue">
                <strong>Em atraso</strong> (vencidos antes de{" "}
                {formatCompetence(forecast.startMonth)}, fora dos saldos):{" "}
                <span className="cash-in">
                  {currency.format(overdue.inflowInCents / 100)}
                </span>{" "}
                a receber ·{" "}
                <span className="cash-out">
                  {currency.format(overdue.outflowInCents / 100)}
                </span>{" "}
                a pagar
              </p>
            )}
            <div className="forecast-scroll">
              <table className="forecast-table" aria-label="Previsão por mês">
                <thead>
                  <tr>
                    <th scope="col" rowSpan={2}>
                      Mês
                    </th>
                    <th scope="colgroup" colSpan={3}>
                      Pagamentos confirmados
                    </th>
                    <th scope="colgroup" colSpan={3}>
                      Pagamentos em aberto
                    </th>
                    <th scope="col" rowSpan={2}>
                      Saldo do mês
                    </th>
                  </tr>
                  <tr>
                    <th scope="col">Entradas</th>
                    <th scope="col">Saídas</th>
                    <th scope="col">Saldo</th>
                    <th scope="col">Entradas</th>
                    <th scope="col">Saídas</th>
                    <th scope="col">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.months.map((item) => (
                    <tr key={item.month}>
                      <th scope="row">{formatCompetence(item.month)}</th>
                      {forecastFlowCells(item.confirmed)}
                      {forecastFlowCells(item.projected)}
                      <td
                        className={`forecast-balance${item.balanceInCents < 0 ? " negative" : ""}`}
                      >
                        {currency.format(item.balanceInCents / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {forecastFlowCells(forecast.totals.confirmed)}
                    {forecastFlowCells(forecast.totals.projected)}
                    <td
                      className={`forecast-balance${forecast.totals.balanceInCents < 0 ? " negative" : ""}`}
                    >
                      {currency.format(forecast.totals.balanceInCents / 100)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
