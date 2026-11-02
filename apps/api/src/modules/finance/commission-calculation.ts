import type { CommissionRuleSnapshot } from "@crm/contracts";
export interface CommissionTerms extends CommissionRuleSnapshot {
  id: string;
  userId?: string;
  professionalId?: string;
  active: boolean;
}
/**
 * Regra vigente na data: a do usuário ligado ao profissional antes da do profissional, a de
 * início mais recente. Só existe a comissão geral: regras antigas por serviço ou de valor fixo
 * (desativadas na migração 0034) não valem mais.
 */
export function selectCommissionRule(
  rules: CommissionTerms[],
  professionalId: string,
  userId: string | undefined,
  date: string,
) {
  return rules
    .filter(
      (rule) =>
        rule.active &&
        !rule.serviceId &&
        rule.kind !== "fixed" &&
        (rule.professionalId === professionalId ||
          Boolean(userId && rule.userId === userId)) &&
        rule.effectiveFrom <= date &&
        (!rule.effectiveUntil || rule.effectiveUntil >= date),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.userId)) - Number(Boolean(a.userId)) ||
        b.effectiveFrom.localeCompare(a.effectiveFrom),
    )[0];
}
/** Percentual da regra sobre a base (valor pago pelo cliente), arredondado. */
export function commissionAmount(
  rule: Pick<CommissionRuleSnapshot, "percentage">,
  base: number,
) {
  return Math.round((base * rule.percentage) / 100);
}
