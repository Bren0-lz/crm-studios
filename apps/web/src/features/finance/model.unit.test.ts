import type { DailyCash } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { dailyCashGroups, receivableSituation } from "./model";

describe("daily cash grouping", () => {
  it("counts overdue days across a month boundary without losing the singular form", () => {
    expect(
      receivableSituation(
        { status: "open", overdue: true, dueDate: "2040-05-31" },
        "2040-06-01",
      ),
    ).toMatchObject({ key: "overdue", label: "Vencida há 1 dia" });
    expect(
      receivableSituation(
        { status: "open", overdue: true, dueDate: "2040-05-31" },
        "2040-06-02",
      ),
    ).toMatchObject({ key: "overdue", label: "Vencida há 2 dias" });
  });
  it("keeps methods omitted from the aggregate and includes signed reversals in their balance", () => {
    const cash: DailyCash = {
      date: "2040-06-01",
      generatedAt: "2040-06-01T12:00:00Z",
      totalInflowInCents: 12500,
      totalOutflowInCents: 3000,
      balanceInCents: 9500,
      byPaymentMethod: [
        {
          paymentMethod: "pix",
          inflowInCents: 10000,
          outflowInCents: 0,
          balanceInCents: 10000,
        },
      ],
      movements: [
        {
          id: "payment",
          kind: "receipt",
          direction: "in",
          occurredAt: "2040-06-01T09:00:00Z",
          description: "Recebimento",
          paymentMethod: "cash",
          amountInCents: 4000,
        },
        {
          id: "reversal",
          kind: "receipt_reversal",
          direction: "in",
          occurredAt: "2040-06-01T10:00:00Z",
          description: "Estorno",
          paymentMethod: "cash",
          amountInCents: -1500,
        },
        {
          id: "expense",
          kind: "payable",
          direction: "out",
          occurredAt: "2040-06-01T11:00:00Z",
          description: "Despesa",
          paymentMethod: "cash",
          amountInCents: 3000,
        },
      ],
    };
    const original = structuredClone(cash);
    expect(dailyCashGroups(cash)).toEqual([
      {
        method: "pix",
        label: "Pix",
        inflow: 10000,
        outflow: 0,
        balance: 10000,
        movements: [],
      },
      {
        method: "cash",
        label: "Dinheiro",
        inflow: 2500,
        outflow: 3000,
        balance: -500,
        movements: cash.movements,
      },
    ]);
    expect(cash).toEqual(original);
  });
});
