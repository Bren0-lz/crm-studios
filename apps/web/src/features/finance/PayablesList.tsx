import {
  type Payable,
  paymentMethodWithInstallments,
  saoPauloToday,
} from "@crm/contracts";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, shortDate } from "../../shared/lib/formatting";
import { payableGroups, receivableSituation, signedCurrency } from "./model";

export function PayablesList({
  payables,
  canManage,
  onCreate,
  onSettle,
  onReverse,
  onProofs,
  onSetAmount,
  filtered = false,
}: {
  payables: Payable[];
  canManage: boolean;
  onCreate: () => void;
  onSettle: (item: Payable) => void;
  onReverse: (id: string) => void;
  onProofs: (item: Payable) => void;
  /** Despesa fixa variável: informar o valor do mês antes de pagar. */
  onSetAmount: (item: Payable) => void;
  /** Filtro ou busca ativos: mostra todas as pagas que batem, de qualquer mês. */
  filtered?: boolean;
}) {
  const { can } = useAuthorization();
  const [showAllPaid, setShowAllPaid] = useState(false);
  if (payables.length === 0 && filtered) {
    return (
      <EmptyState
        title="Nenhuma conta encontrada"
        copy="Nenhuma conta a pagar bate com a busca ou os filtros aplicados."
      />
    );
  }
  if (payables.length === 0) {
    return (
      <div className="finance-filter-empty">
        <EmptyState
          title="Nenhuma conta a pagar"
          copy="Lance a primeira despesa em “Nova despesa”: pontual ou fixa (todo mês)."
        />
        {canManage &&
          (can("finance.payables_create") ||
            can("finance.recurring_create")) && (
            <button
              type="button"
              className="secondary-button"
              onClick={onCreate}
            >
              <Plus size={18} /> Nova despesa
            </button>
          )}
      </div>
    );
  }
  const today = saoPauloToday();
  const { groups, hiddenPaid } = payableGroups(
    payables,
    today,
    filtered || showAllPaid,
  );
  return (
    <div className="payables-groups">
      {groups.length === 0 && (
        <EmptyState
          title="Tudo em dia"
          copy="Nenhuma conta em aberto e nada pago neste mês."
        />
      )}
      {groups.map((group) => (
        <section
          key={group.key}
          className={`payables-group ${group.key}`}
          aria-labelledby={`payables-group-${group.key}`}
        >
          <header className="payables-group-head">
            <h3 id={`payables-group-${group.key}`}>
              {group.label}
              <span className="tab-count">{group.items.length}</span>
            </h3>
            <span className="payables-group-total">
              {currency.format(group.totalInCents / 100)}
            </span>
          </header>
          <PayablesTable
            payables={group.items}
            today={today}
            canManage={canManage}
            onSettle={onSettle}
            onReverse={onReverse}
            onProofs={onProofs}
            onSetAmount={onSetAmount}
          />
        </section>
      ))}
      {hiddenPaid > 0 && (
        <div className="payables-more">
          <button
            type="button"
            className="secondary-button button-sm"
            onClick={() => setShowAllPaid(true)}
          >
            Ver pagas de meses anteriores ({hiddenPaid})
          </button>
        </div>
      )}
    </div>
  );
}

function PayablesTable({
  payables,
  today,
  canManage,
  onSettle,
  onReverse,
  onProofs,
  onSetAmount,
}: {
  payables: Payable[];
  today: string;
  canManage: boolean;
  onSettle: (item: Payable) => void;
  onReverse: (id: string) => void;
  onProofs: (item: Payable) => void;
  onSetAmount: (item: Payable) => void;
}) {
  const { can } = useAuthorization();
  return (
    <div className="finance-table finance-list payables-table">
      <div className="finance-row finance-head" aria-hidden="true">
        <span>Descrição e fornecedor</span>
        <span>Vencimento</span>
        <span>Situação</span>
        <span className="finance-amount">Valor</span>
        <span className="finance-actions">Ações</span>
      </div>
      {payables.map((item) => {
        const situation = receivableSituation(item, today);
        const detail = [
          item.supplier || item.categoryName,
          item.costCenterName,
          item.amountPending &&
            (item.amountInCents > 0
              ? "Valor estimado: informe o valor do mês"
              : "Sem estimativa: informe o valor do mês"),
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div className="finance-row" key={item.id}>
            <div className="finance-item">
              <strong title={item.description}>{item.description}</strong>
              <span title={detail}>{detail}</span>
              {item.status === "paid" && item.paymentMethod && (
                <span className="finance-installment">
                  Pago: {paymentMethodWithInstallments(item.paymentMethod)}
                </span>
              )}
            </div>
            <span className="finance-due">
              <span className="finance-label">Vencimento </span>
              {shortDate.format(new Date(`${item.dueDate}T12:00:00`))}
            </span>
            <span>
              <span className={`status-pill ${situation.pill}`}>
                {situation.label}
              </span>
            </span>
            <strong className="finance-amount cash-out">
              {item.amountPending && item.amountInCents === 0
                ? "A informar"
                : signedCurrency(-item.amountInCents)}
            </strong>
            <div className="finance-actions">
              {item.status === "paid" && (
                <button
                  className="secondary-button button-sm"
                  aria-label={`Comprovantes de ${item.description}`}
                  onClick={() => onProofs(item)}
                >
                  Comprovantes
                </button>
              )}
              {canManage &&
                item.status === "open" &&
                item.amountPending &&
                can("finance.recurring_update") && (
                  <button
                    className="primary-button button-sm"
                    aria-label={`Informar valor de ${item.description}`}
                    onClick={() => onSetAmount(item)}
                  >
                    Informar valor
                  </button>
                )}
              {canManage &&
                item.status === "open" &&
                !item.amountPending &&
                can("finance.payables_pay") && (
                  <button
                    className="primary-button button-sm"
                    aria-label={`Pagar ${item.description}`}
                    onClick={() => onSettle(item)}
                  >
                    Pagar
                  </button>
                )}
              {canManage &&
                item.status === "paid" &&
                can("finance.payables_reverse") && (
                  <button
                    className="danger-button button-sm"
                    aria-label={`Estornar ${item.description}`}
                    onClick={() => onReverse(item.id)}
                  >
                    Estornar
                  </button>
                )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
