import { z } from "zod";
import type { CommissionRuleSnapshot } from "./types.js";
import type { CommissionEntry } from "./types.js";
export const commissionReconciliationInputSchema = z.object({
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
});
export type CommissionReconciliationInput = z.infer<
  typeof commissionReconciliationInputSchema
>;
export interface CommissionExpectation {
  professionalId: string;
  professionalName: string;
  competence: string;
  amountInCents: number;
  baseAmountInCents: number;
  serviceId: string;
  ruleId: string;
  ruleSnapshot: CommissionRuleSnapshot;
}
export interface CommissionAdjustment {
  id: string;
  clinicId: string;
  commissionId: string;
  reconciliationId: string;
  professionalId: string;
  professionalName: string;
  competence: string;
  amountInCents: number;
  reason: string;
  actorId: string;
  createdAt: string;
  status: "open" | "paid";
  paidAt?: string;
  /** Despesa da folha que inclui (e paga) este ajuste. */
  payrollPayableId?: string;
}
export interface CommissionAccountPayment {
  id: string;
  clinicId: string;
  commissionId: string;
  professionalId: string;
  professionalName: string;
  amountInCents: number;
  actorId: string;
  occurredAt: string;
  originalIncluded: boolean;
  adjustmentIds: string[];
  reversedAt?: string;
}
export interface CommissionReconciliation {
  actorName: string;
  expectedDigest: string;
  id: string;
  clinicId: string;
  commissionId: string;
  idempotencyKey: string;
  reason: string;
  actorId: string;
  createdAt: string;
  expected: CommissionExpectation | null;
  adjustments: CommissionAdjustment[];
}
export interface CommissionReconciliationPreview {
  reconciliations: CommissionReconciliation[];
  digest: string;
  commission: CommissionEntry;
  expected: CommissionExpectation | null;
  adjustments: CommissionAdjustment[];
  payments: CommissionAccountPayment[];
  changes: Array<{
    professionalId: string;
    professionalName: string;
    competence: string;
    amountInCents: number;
  }>;
  originalManagedByExpense: boolean;
}
export interface CommissionAccountBalance {
  professionalId: string;
  professionalName: string;
  amountInCents: number;
  originalIncluded: boolean;
  adjustmentIds: string[];
}
export function commissionAccountBalances(
  commission: CommissionEntry,
  adjustments: CommissionAdjustment[],
  originalManagedByExpense = false,
): CommissionAccountBalance[] {
  const balances = new Map<string, CommissionAccountBalance>();
  const add = (
    professionalId: string,
    professionalName: string,
    amount: number,
    id?: string,
  ) => {
    const row = balances.get(professionalId) ?? {
      professionalId,
      professionalName,
      amountInCents: 0,
      originalIncluded: false,
      adjustmentIds: [],
    };
    row.amountInCents += amount;
    if (id) row.adjustmentIds.push(id);
    else row.originalIncluded = true;
    balances.set(professionalId, row);
  };
  if (commission.status === "open" && !originalManagedByExpense)
    add(
      commission.professionalId,
      commission.professionalName,
      commission.amountInCents,
    );
  for (const item of adjustments)
    if (item.status === "open")
      add(
        item.professionalId,
        item.professionalName,
        item.amountInCents,
        item.id,
      );
  return [...balances.values()];
}
