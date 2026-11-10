import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type {
  CommissionEntry,
  CommissionExpectation,
  CommissionAdjustment,
} from "@crm/contracts";
import type {
  ClinicRepository,
  CommissionSourceScope,
} from "../../repository.js";
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

/** Ajustes dentro do limite financeiro gravável (INT do banco). */
export function commissionAdjustmentsWithinLimit(
  changes: { amountInCents: number }[],
) {
  return changes.every(
    (entry) =>
      Number.isSafeInteger(entry.amountInCents) &&
      Math.abs(entry.amountInCents) <= 2147483647,
  );
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

/**
 * Depois de alterar a origem de comissões (atendimento, presença, turma), concilia sozinha as
 * que divergirem, em nome de quem fez a alteração. Uma falha aqui não desfaz a alteração já
 * gravada: fica no log e a conferência antes do lançamento da folha pega a divergência.
 */
export async function reconcileChangedCommissions(
  repository: ClinicRepository,
  request: FastifyRequest,
  scope: CommissionSourceScope,
  reason: string,
) {
  try {
    await repository.autoReconcileCommissions(
      request.user.clinicId,
      request.user.sub,
      scope,
      `Conciliação automática: ${reason}`,
    );
  } catch (error) {
    request.log.error(
      { err: error },
      "Falha na conciliação automática de comissões",
    );
  }
}
