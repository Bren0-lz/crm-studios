import {
  type PatientPlan,
  paymentMethodLabels,
  planDisplayStatus,
  planHasSessionBalance,
  planUsedSessions,
} from "@crm/contracts";
import type { ReactNode } from "react";
import { currency, shortDate } from "../../shared/lib/formatting";
import {
  planBadgeLabel,
  planKindLabels,
  planPaymentProgress,
  planPaymentTerms,
  planRenewalLabel,
} from "./model";

/**
 * Cartão completo do plano: saldo por serviço, validade, pausa e renovação. Usado na página
 * de Planos e na aba Planos da ficha do cliente; as ações ficam a cargo de quem usa.
 */
export function PlanCard({
  plan,
  plans,
  title,
  subtitle,
  autoRenewControl,
  actions,
}: {
  plan: PatientPlan;
  /** Planos do mesmo contexto, para achar a renovação seguinte. */
  plans: PatientPlan[];
  title: string;
  subtitle?: string;
  autoRenewControl?: ReactNode;
  actions?: ReactNode;
}) {
  const cancelled = plan.status === "cancelled";
  const used = planUsedSessions(plan);
  const percent = Math.min(100, Math.round((used / plan.totalSessions) * 100));
  // Recorrente: vale a frequência semanal; mostra as aulas feitas no ciclo, sem saldo.
  const hasBalance = planHasSessionBalance(plan);
  return (
    <article className="plan-card">
      <div className="plan-card-head">
        <span className={`status-pill ${planDisplayStatus(plan)}`}>
          {planBadgeLabel(plan)}
        </span>
        <span>{planKindLabels[plan.kind]}</span>
      </div>
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
      {/* Plano cancelado não tem sessão utilizável, mesmo com saldo gravado. */}
      {cancelled ? (
        <div className="balance-line">
          <strong>0</strong>
          <span>de {plan.totalSessions} sessões · plano cancelado</span>
        </div>
      ) : hasBalance ? (
        <div className="balance-line">
          <strong>{plan.remainingSessions}</strong>
          <span>de {plan.totalSessions} sessões restantes</span>
        </div>
      ) : (
        <div className="balance-line">
          <strong>{used}</strong>
          <span>
            {used === 1 ? "aula feita" : "aulas feitas"} neste ciclo · plano
            prevê {plan.totalSessions}
          </span>
        </div>
      )}
      {plan.services.map((entry) => (
        <p key={entry.serviceId}>
          {entry.serviceName}:{" "}
          {cancelled
            ? `0 de ${entry.totalSessions} sessões`
            : hasBalance
              ? `${entry.remainingSessions} de ${entry.totalSessions} sessões`
              : `${planUsedSessions(entry)} de ${entry.totalSessions} aulas previstas`}{" "}
          · {currency.format(entry.totalValueInCents / 100)}
        </p>
      ))}
      {hasBalance && (
        <div className="progress-track">
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      <div className="plan-meta">
        <span>Validade</span>
        <strong>
          {shortDate.format(new Date(`${plan.validFrom}T12:00:00`))}
          {plan.validUntil
            ? ` — ${shortDate.format(new Date(`${plan.validUntil}T12:00:00`))}`
            : " · contínuo"}
        </strong>
      </div>
      {!plan.sourceTabId && plan.totalValueInCents > 0 && (
        <div className="plan-meta plan-payment">
          <span>Pagamento</span>
          <strong>{planPaymentTerms(plan)}</strong>
          {plan.paymentSummary && (
            <span
              className={`plan-payment-progress${plan.paymentSummary.overdueCount ? " overdue" : ""}`}
            >
              {planPaymentProgress(plan)}
            </span>
          )}
        </div>
      )}
      {plan.status === "paused" && plan.pausedAt && (
        <div className="plan-meta plan-pause">
          <span>Pausa</span>
          <strong>
            Desde {shortDate.format(new Date(plan.pausedAt))}
            {plan.pauseExpectedReturn
              ? ` · retorno previsto ${shortDate.format(new Date(`${plan.pauseExpectedReturn}T12:00:00`))}`
              : ""}
            {plan.pauseReason ? ` · ${plan.pauseReason}` : ""}
          </strong>
        </div>
      )}
      {plan.status === "cancelled" && plan.cancelledAt && (
        <div className="plan-meta plan-cancellation">
          <span>Cancelamento</span>
          <strong>
            {shortDate.format(new Date(plan.cancelledAt))}
            {plan.refundedInCents
              ? ` · estornado ao cliente ${currency.format(plan.refundedInCents / 100)}${plan.refundPaymentMethod ? ` (${paymentMethodLabels[plan.refundPaymentMethod]})` : ""}`
              : " · sem estorno"}
            {plan.refundNote ? ` · ${plan.refundNote}` : ""}
          </strong>
        </div>
      )}
      {!plan.sourceTabId && plan.status !== "cancelled" && (
        <div className="plan-meta plan-renewal">
          <span>Renovação</span>
          <strong>{planRenewalLabel(plan, plans)}</strong>
          {autoRenewControl}
        </div>
      )}
      {actions && <div className="plan-actions">{actions}</div>}
    </article>
  );
}
