import { Plus, Trash2 } from "lucide-react";
import type { AdminUserServiceCommission } from "@crm/contracts";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { currency } from "../../shared/lib/formatting";
import { isoDateLabel, percentageLabel } from "./model";
import type { useServiceCommissions } from "./useServiceCommissions";

function savedRuleLabel(rule: AdminUserServiceCommission, today: string) {
  const amount =
    rule.kind === "fixed"
      ? `${currency.format((rule.fixedAmountInCents ?? 0) / 100)} por presença`
      : `${percentageLabel.format(rule.percentage)}%`;
  const start =
    rule.effectiveFrom > today
      ? `a partir de ${isoDateLabel(rule.effectiveFrom)}`
      : `desde ${isoDateLabel(rule.effectiveFrom)}`;
  const end = rule.effectiveUntil
    ? ` até ${isoDateLabel(rule.effectiveUntil)}`
    : "";
  return `${amount} · ${start}${end}`;
}

export function UserServiceCommissionFields({
  commissions,
}: {
  commissions: ReturnType<typeof useServiceCommissions>;
}) {
  const { saved, rows, services, today } = commissions;
  return (
    <fieldset className="form-fieldset span-2">
      <legend>Comissão por serviço</legend>
      <div className="commission-editor">
        <p className="muted-copy">
          Serviços que esta pessoa oferece com comissão própria. Nos
          atendimentos desses serviços, ela vale no lugar da comissão geral.
        </p>
        {saved.length > 0 && (
          <ul className="service-commission-list">
            {saved.map((rule) => (
              <li key={`${rule.serviceId}-${rule.effectiveFrom}`}>
                <span>
                  <strong>{rule.serviceName}</strong>
                  <small>{savedRuleLabel(rule, today)}</small>
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => commissions.add(rule.serviceId)}
                >
                  Nova vigência
                </button>
              </li>
            ))}
          </ul>
        )}
        {commissions.loading && <LoadingBlock />}
        {commissions.error && (
          <div>
            <p className="form-error" role="alert">
              Não foi possível carregar os serviços: {commissions.error}
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={commissions.retry}
            >
              Tentar novamente
            </button>
          </div>
        )}
        {rows.map((row, index) => {
          const position = index + 1;
          return (
            <div className="service-commission-row" key={row.key}>
              <label>
                Serviço
                <select
                  value={row.serviceId}
                  onChange={(event) =>
                    commissions.change(row.key, {
                      serviceId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecione o serviço</option>
                  {services.map((service) => (
                    <option value={service.id} key={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo de comissão
                <select
                  value={row.kind}
                  onChange={(event) =>
                    commissions.change(row.key, {
                      kind: event.target.value as typeof row.kind,
                    })
                  }
                >
                  <option value="percentage">Percentual</option>
                  <option value="fixed">Valor fixo por presença</option>
                </select>
              </label>
              {row.kind === "fixed" ? (
                <label>
                  Valor fixo (R$)
                  <MoneyInput
                    valueInCents={row.fixedAmountInCents}
                    onChange={(cents) =>
                      commissions.change(row.key, {
                        fixedAmountInCents: cents ?? 0,
                      })
                    }
                  />
                </label>
              ) : (
                <label>
                  Comissão do serviço (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    inputMode="decimal"
                    value={row.percentage}
                    onChange={(event) =>
                      commissions.change(row.key, {
                        percentage: event.target.value,
                      })
                    }
                  />
                </label>
              )}
              <label>
                Vale a partir de
                <input
                  type="date"
                  value={row.effectiveFrom}
                  onChange={(event) =>
                    commissions.change(row.key, {
                      effectiveFrom: event.target.value,
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="secondary-button"
                aria-label={`Remover comissão do serviço ${position}`}
                onClick={() => commissions.remove(row.key)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
        <div>
          <button
            type="button"
            className="secondary-button"
            disabled={commissions.loading || services.length === 0}
            onClick={() => commissions.add()}
          >
            <Plus size={16} />
            Adicionar serviço
          </button>
        </div>
        {!commissions.loading &&
          !commissions.error &&
          services.length === 0 && (
            <p className="muted-copy">
              Nenhum serviço ativo cadastrado. Cadastre os serviços em
              Configurações → Serviços e salas.
            </p>
          )}
        {saved.length > 0 && (
          <p className="muted-copy">
            Uma nova vigência substitui a atual a partir da data escolhida; o
            histórico é mantido. Para não pagar comissão num serviço, informe
            0%.
          </p>
        )}
      </div>
    </fieldset>
  );
}
