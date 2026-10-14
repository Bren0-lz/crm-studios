import type { AdminUserCommissionInput } from "@crm/contracts";
export interface CommissionTerms extends AdminUserCommissionInput {
  id: string;
  userId?: string;
  professionalId?: string;
  active: boolean;
}
export function selectCommissionRule(
  rules: CommissionTerms[],
  professionalId: string,
  userId: string | undefined,
  serviceId: string,
  date: string,
) {
  return rules
    .filter(
      (rule) =>
        rule.active &&
        (rule.professionalId === professionalId ||
          Boolean(userId && rule.userId === userId)) &&
        (!rule.serviceId || rule.serviceId === serviceId) &&
        rule.effectiveFrom <= date &&
        (!rule.effectiveUntil || rule.effectiveUntil >= date),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.userId)) - Number(Boolean(a.userId)) ||
        Number(Boolean(b.serviceId)) - Number(Boolean(a.serviceId)) ||
        b.effectiveFrom.localeCompare(a.effectiveFrom),
    )[0];
}
export function commissionAmount(rule: AdminUserCommissionInput, base: number) {
  return rule.kind === "fixed"
    ? rule.fixedAmountInCents!
    : Math.round((base * rule.percentage) / 100);
}
