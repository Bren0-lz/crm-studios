import { saoPauloToday, type DailyCash } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import { currency, formatIsoDate } from "../../shared/lib/formatting";
import {
  dailyCashGroups,
  dailyCashKinds,
  dailyCashMovementAmount,
  saoPauloTime,
} from "./model";

export function DailyCashSection() {
  const today = saoPauloToday();
  const [date, setDate] = useState(today);
  const [cash, setCash] = useState<DailyCash | null>(null);
  const [error, setError] = useState("");
  const version = useDataVersion("finance");
  useEffect(() => {
    let active = true;
    api
      .dailyCash(date)
      .then((data) => active && setCash(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [date, version]);
  function changeDate(value: string) {
    // Campo limpo mantém o dia anterior: a rota sem data usaria hoje.
    if (!value || value === date) return;
    setCash(null);
    setError("");
    setDate(value);
  }
  return (
    <div className="daily-cash">
      {error && <ErrorBanner error={error} />}
      <section className="panel finance-panel">
        <div className="panel-head">
          <div>
            <h2>Caixa do dia</h2>
            <p className="panel-context">
              {cash
                ? `Movimentos de ${formatIsoDate(cash.date)}`
                : "Movimentos"}
            </p>
            <p className="panel-help">
              Tudo o que entrou e saiu do caixa no dia escolhido, separado por
              forma de pagamento.
            </p>
          </div>
          <label className="daily-cash-date">
            Data
            <input
              type="date"
              value={date}
              onChange={(event) => changeDate(event.target.value)}
            />
          </label>
        </div>
        {!cash ? (
          !error && <LoadingBlock />
        ) : cash.movements.length === 0 ? (
          <div className="finance-filter-empty">
            <EmptyState
              title="Nenhum movimento neste dia"
              copy="Escolha outra data no campo acima. Baixas de parcelas, estornos, contas pagas e comissões pagas aparecem aqui."
            />
            {date !== today && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => changeDate(today)}
              >
                Ver o caixa de hoje
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="daily-cash-summary">
              <ul className="daily-cash-totals" aria-label="Totais do dia">
                <li>
                  <span>Entradas</span>
                  <strong className="cash-in">
                    {currency.format(cash.totalInflowInCents / 100)}
                  </strong>
                </li>
                <li>
                  <span>Saídas</span>
                  <strong className="cash-out">
                    {currency.format(cash.totalOutflowInCents / 100)}
                  </strong>
                </li>
                <li
                  className={cash.balanceInCents < 0 ? "negative" : "positive"}
                >
                  <span>Saldo</span>
                  <strong>{currency.format(cash.balanceInCents / 100)}</strong>
                </li>
                {cash.totalDiscountInCents ? (
                  <li>
                    <span>Descontos na baixa</span>
                    <strong>
                      {currency.format(cash.totalDiscountInCents / 100)}
                    </strong>
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="daily-cash-groups">
              {dailyCashGroups(cash).map((group) => (
                <section
                  className="daily-cash-group"
                  key={group.method}
                  aria-label={`Movimentos em ${group.label}`}
                >
                  <div className="daily-cash-group-head">
                    <h3>{group.label}</h3>
                    <dl className="daily-cash-group-totals">
                      <div>
                        <dt>Entradas</dt>
                        <dd className="cash-in">
                          {currency.format(group.inflow / 100)}
                        </dd>
                      </div>
                      <div>
                        <dt>Saídas</dt>
                        <dd className="cash-out">
                          {currency.format(group.outflow / 100)}
                        </dd>
                      </div>
                      <div>
                        <dt>Saldo</dt>
                        <dd
                          className={group.balance < 0 ? "cash-out" : undefined}
                        >
                          {currency.format(group.balance / 100)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="finance-table finance-list daily-cash-table">
                    {group.movements.map((movement) => {
                      const kind = dailyCashKinds[movement.kind];
                      const amount = dailyCashMovementAmount(movement);
                      return (
                        <div className="finance-row" key={movement.id}>
                          <span className="finance-due">
                            {saoPauloTime.format(new Date(movement.occurredAt))}
                          </span>
                          <span>
                            <span className={`status-pill ${kind.pill}`}>
                              {kind.label}
                            </span>
                          </span>
                          <div className="finance-item">
                            <strong title={movement.description}>
                              {movement.description}
                            </strong>
                            {movement.counterpart && (
                              <span>{movement.counterpart}</span>
                            )}
                            {movement.discountInCents ? (
                              <span>
                                Desconto de{" "}
                                {currency.format(
                                  movement.discountInCents / 100,
                                )}
                              </span>
                            ) : null}
                          </div>
                          <strong
                            className={`finance-amount ${amount.effect < 0 ? "cash-out" : "cash-in"}`}
                          >
                            {amount.text}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
