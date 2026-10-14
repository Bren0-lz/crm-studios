import { createHash } from "node:crypto";
import type {
  CommissionEntry,
  CommissionExpectation,
  CommissionAdjustment,
} from "@crm/contracts";
export function commissionReconciliationChanges(
  commission: CommissionEntry,
  expected: CommissionExpectation | null,
  adjustments: CommissionAdjustment[],
) {
  const rows = new Map<
    string,
    {
      professionalId: string;
      professionalName: string;
      competence: string;
      amountInCents: number;
    }
  >();
  const add = (
    entry: {
      professionalId: string;
      professionalName: string;
      competence: string;
      amountInCents: number;
    },
    sign: number,
  ) => {
    const key = entry.professionalId + ":" + entry.competence;
    const current = rows.get(key) ?? { ...entry, amountInCents: 0 };
    current.amountInCents += sign * entry.amountInCents;
    rows.set(key, current);
  };
  add(commission, -1);
  for (const adjustment of adjustments) add(adjustment, -1);
  if (expected) add(expected, 1);
  return [...rows.values()].filter((row) => row.amountInCents !== 0);
}

export function commissionReconciliationDigest(
  commission: CommissionEntry,
  expected: CommissionExpectation | null,
  adjustments: CommissionAdjustment[],
) {
  const sorted = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(sorted)
      : input && typeof input === "object"
        ? Object.fromEntries(
            Object.entries(input)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => [key, sorted(value)]),
          )
        : input;
  return createHash("sha256")
    .update(
      JSON.stringify(
        sorted({
          commission,
          expected,
          adjustments: [...adjustments].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
        }),
      ),
    )
    .digest("hex");
}
