import type {
  CommissionEntry,
  Payable,
  CommissionAdjustment,
} from "@crm/contracts";
import { HandCoins, Plus } from "lucide-react";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, shortDate } from "../../shared/lib/formatting";
import { formatCompetence, signedCurrency } from "./model";

/** Comissões só para consulta: o pagamento é feito pela folha de pagamento. */
export function CommissionsList({
  onCreateRule,
  commissions,
  payables = [],
  adjustments = [],
  onReconcile,
}: {
  commissions: CommissionEntry[];
  payables?: Payable[];
  adjustments?: CommissionAdjustment[];
  onReconcile?: ((id: string) => void) | undefined;
  /** Ação principal do estado vazio (V11). */
  onCreateRule?: (() => void) | undefined;
}) {
  const { can } = useAuthorization();
  if (commissions.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title="Nenhuma comissão gerada"
        copy="Cadastre uma regra de comissão e use “Gerar comissões do mês” depois de concluir atendimentos."
        action={
          onCreateRule ? (
            <button
              type="button"
              className="primary-button"
              onClick={onCreateRule}
            >
              <Plus size={18} /> Cadastrar regra de comissão
            </button>
          ) : undefined
        }
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
        const linked = payables.find(
          (payable) =>
            payable.commissionId === item.id && payable.status !== "cancelled",
        );
        const detail = [
          `Competência ${formatCompetence(item.competence)}`,
          item.groupAttendanceId && "Presença em turma",
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
              {item.ruleSnapshot?.kind === "fixed"
                ? `Fixa: ${currency.format((item.ruleSnapshot.fixedAmountInCents ?? 0) / 100)}`
                : `${item.percentage}%`}
            </span>
            <strong className="finance-amount cash-out">
              {signedCurrency(-item.amountInCents)}
            </strong>
            <span>
              <span className={`status-pill ${item.status}`}>
                {item.payrollPayableId
                  ? item.status === "paid"
                    ? "Paga pela folha"
                    : "Na folha"
                  : item.status === "paid"
                    ? "Paga"
                    : "Em aberto"}
              </span>
            </span>
            <div className="finance-actions">
              {linked && <span>Baixa pela despesa vinculada</span>}
              {onReconcile &&
                (can("finance.commissions_reconcile") ||
                  adjustments.some(
                    (entry) => entry.commissionId === item.id,
                  )) && (
                  <button
                    className="secondary-button button-sm"
                    onClick={() => onReconcile(item.id)}
                    aria-label={`Conciliar comissão de ${item.professionalName}`}
                  >
                    Conciliar comissão
                  </button>
                )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
