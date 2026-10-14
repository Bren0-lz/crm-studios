import { describe, expect, it } from "vitest";
import {
  commissionAccountBalances,
  type CommissionAdjustment,
} from "./commission-reconciliation.js";
import type { CommissionEntry } from "./types.js";

const commission: CommissionEntry = {
  id: "commission",
  clinicId: "clinic",
  professionalId: "ana",
  professionalName: "Ana",
  competence: "2040-01",
  baseAmountInCents: 10000,
  percentage: 20,
  amountInCents: 2000,
  status: "open",
  createdAt: "2040-01-01T12:00:00Z",
};
function adjustment(
  id: string,
  amountInCents: number,
  professionalId = "ana",
  status: "open" | "paid" = "open",
): CommissionAdjustment {
  return {
    id,
    clinicId: "clinic",
    commissionId: commission.id,
    reconciliationId: "reconciliation",
    professionalId,
    professionalName: professionalId === "ana" ? "Ana" : "Bia",
    competence: "2040-01",
    amountInCents,
    reason: "Correção de regra",
    actorId: "actor",
    createdAt: commission.createdAt,
    status,
  };
}

describe("commission account balances", () => {
  it("groups credits and recoveries by professional without rewriting the source commission", () => {
    const adjustments = [
      adjustment("credit", 500),
      adjustment("recovery", -1000),
      adjustment("other", 3000, "bia"),
      adjustment("paid", 900, "ana", "paid"),
    ];
    const original = structuredClone({ commission, adjustments });
    expect(commissionAccountBalances(commission, adjustments)).toEqual([
      {
        professionalId: "ana",
        professionalName: "Ana",
        amountInCents: 1500,
        originalIncluded: true,
        adjustmentIds: ["credit", "recovery"],
      },
      {
        professionalId: "bia",
        professionalName: "Bia",
        amountInCents: 3000,
        originalIncluded: false,
        adjustmentIds: ["other"],
      },
    ]);
    expect({ commission, adjustments }).toEqual(original);
  });
  it("keeps recoveries payable by a professional even when the original was already paid", () => {
    expect(
      commissionAccountBalances({ ...commission, status: "paid" }, [
        adjustment("recovery", -2000),
      ]),
    ).toEqual([
      {
        professionalId: "ana",
        professionalName: "Ana",
        amountInCents: -2000,
        originalIncluded: false,
        adjustmentIds: ["recovery"],
      },
    ]);
    expect(
      commissionAccountBalances({ ...commission, status: "paid" }, []),
    ).toEqual([]);
  });
  it("does not count an original commission twice when an expense manages it", () => {
    expect(commissionAccountBalances(commission, [], true)).toEqual([]);
    expect(
      commissionAccountBalances(commission, [adjustment("credit", 500)], true),
    ).toMatchObject([
      {
        amountInCents: 500,
        originalIncluded: false,
        adjustmentIds: ["credit"],
      },
    ]);
  });
});
