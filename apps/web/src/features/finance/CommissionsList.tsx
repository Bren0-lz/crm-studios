import type { CommissionEntry } from "@crm/contracts";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, shortDate } from "../../shared/lib/formatting";
import { formatCompetence, signedCurrency } from "./model";

export function CommissionsList({
  commissions,
  canManage,
  onToggle,
}: {
  commissions: CommissionEntry[];
  canManage: boolean;
  onToggle: (item: CommissionEntry) => void;
}) {
  const { can } = useAuthorization();
  if (commissions.length === 0) {
    return (
      <EmptyState
        title="Nenhuma comissão gerada"
        copy="Cadastre uma regra de comissão e use “Gerar comissões do mês” depois de concluir atendimentos."
      />
    );
  }
  return (
    <div className="finance-table finance-list commissions-table">
      <div className="finance-row finance-head" aria-hidden="true">
        <span>Profissional e competência</span>
        <span className="finance-number">Base de cálculo</span>
        <span className="finance-number">Percentual</span>
        <span className="finance-amount">Comissão</span>
        <span>Situação</span>
        <span className="finance-actions">Ações</span>
      </div>
      {commissions.map((item) => {
        const detail = [
          `Competência ${formatCompetence(item.competence)}`,
          item.paidAt && `paga em ${shortDate.format(new Date(item.paidAt))}`,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div className="finance-row" key={item.id}>
            <div className="finance-item">
              <strong title={item.professionalName}>
                {item.professionalName}
              </strong>
              <span>{detail}</span>
            </div>
            <span className="finance-due finance-number">
              <span className="finance-label">Base de cálculo </span>
              {currency.format(item.baseAmountInCents / 100)}
            </span>
            <span className="finance-due finance-number">
              <span className="finance-label">Percentual </span>
              {item.percentage}%
            </span>
            <strong className="finance-amount cash-out">
              {signedCurrency(-item.amountInCents)}
            </strong>
            <span>
              <span className={`status-pill ${item.status}`}>
                {item.status === "paid" ? "Paga" : "Em aberto"}
              </span>
            </span>
            <div className="finance-actions">
              {canManage &&
                can(
                  item.status === "paid"
                    ? "finance.commissions_reverse"
                    : "finance.commissions_pay",
                ) && (
                  <button
                    className={
                      item.status === "paid"
                        ? "danger-button button-sm"
                        : "primary-button button-sm"
                    }
                    aria-label={`${item.status === "paid" ? "Estornar" : "Pagar"} comissão de ${item.professionalName}`}
                    onClick={() => onToggle(item)}
                  >
                    {item.status === "paid" ? "Estornar" : "Pagar"}
                  </button>
                )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
