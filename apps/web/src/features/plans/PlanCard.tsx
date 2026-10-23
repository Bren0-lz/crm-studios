import { type PatientPlan, planDisplayStatus } from "@crm/contracts";
import type { ReactNode } from "react";
import { currency, shortDate } from "../../shared/lib/formatting";
import { planBadgeLabel, planKindLabels, planRenewalLabel } from "./model";

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
  const used = plan.totalSessions - plan.remainingSessions;
  const percent = Math.min(100, Math.round((used / plan.totalSessions) * 100));
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
      <div className="balance-line">
        <strong>{plan.remainingSessions}</strong>
        <span>de {plan.totalSessions} sessões restantes</span>
      </div>
      {plan.services.map((entry) => (
        <p key={entry.serviceId}>
          {entry.serviceName}: {entry.remainingSessions} de{" "}
          {entry.totalSessions} sessões ·{" "}
          {currency.format(entry.totalValueInCents / 100)}
        </p>
      ))}
      <div className="progress-track">
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="plan-meta">
        <span>Validade</span>
        <strong>
          {shortDate.format(new Date(`${plan.validFrom}T12:00:00`))}
          {plan.validUntil
            ? ` — ${shortDate.format(new Date(`${plan.validUntil}T12:00:00`))}`
            : " · contínuo"}
        </strong>
      </div>
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
