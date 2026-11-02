import type { DailyCash, Payable } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  dailyCashGroups,
  hasEntryFilter,
  matchesPayableSearch,
  payableGroups,
  payablesSummary,
  receivableInstallmentLine,
  receivableSituation,
} from "./model";

function payable(overrides: Partial<Payable>): Payable {
  return {
    id: overrides.description ?? "id",
    clinicId: "clinic",
    description: "Conta",
    categoryId: "category",
    categoryName: "Operacional",
    dueDate: "2040-06-15",
    amountInCents: 1000,
    notes: "",
    status: "open",
    overdue: false,
    createdAt: "2040-06-01T12:00:00Z",
    updatedAt: "2040-06-01T12:00:00Z",
    ...overrides,
  } as Payable;
}

describe("payables overview", () => {
  const today = "2040-06-15";
  const items = [
    payable({ description: "Atrasada", dueDate: "2040-06-10", overdue: true }),
    payable({ description: "Em 7 dias", dueDate: "2040-06-22" }),
    payable({ description: "Hoje", dueDate: "2040-06-15", amountInCents: 500 }),
    payable({ description: "Depois", dueDate: "2040-06-23" }),
    payable({
      description: "Paga no mês",
      status: "paid",
      // 00:30 de 01/06 em São Paulo; a de baixo é 23:30 de 31/05 (o mês é o da clínica).
      paidAt: "2040-06-01T03:30:00Z",
    }),
    payable({
      description: "Paga antes",
      status: "paid",
      paidAt: "2040-06-01T02:30:00Z",
    }),
    payable({ description: "Cancelada", status: "cancelled" }),
  ];

  it("sums overdue, the next 7 days, everything open and the clinic month payments", () => {
    expect(payablesSummary(items, today)).toEqual({
      overdue: { count: 1, totalInCents: 1000 },
      dueSoon: { count: 2, totalInCents: 1500 },
      open: { count: 4, totalInCents: 3500 },
      paidThisMonth: { count: 1, totalInCents: 1000 },
    });
  });

  it("groups by situation in a fixed order and hides payments of other months on request", () => {
    const all = payableGroups(items, today);
    expect(
      all.groups.map((group) => [group.label, group.items.length]),
    ).toEqual([
      ["Em atraso", 1],
      ["A vencer", 3],
      ["Pagas", 2],
      ["Canceladas", 1],
    ]);
    expect(all.groups[1]!.items.map((item) => item.description)).toEqual([
      "Hoje",
      "Em 7 dias",
      "Depois",
    ]);
    expect(all.groups[1]!.totalInCents).toBe(2500);
    expect(all.hiddenPaid).toBe(0);
    const month = payableGroups(items, today, false);
    expect(month.hiddenPaid).toBe(1);
    expect(
      month.groups
        .find((group) => group.key === "paid")!
        .items.map((item) => item.description),
    ).toEqual(["Paga no mês"]);
  });

  it("searches without accents or case and ignores a lone date field", () => {
    const item = payable({
      description: "Conta de água",
      supplier: "Águas do Vale",
    });
    expect(matchesPayableSearch(item, "  AGUA ")).toBe(true);
    expect(matchesPayableSearch(item, "vale")).toBe(true);
    expect(matchesPayableSearch(item, "operacional")).toBe(true);
    expect(matchesPayableSearch(item, "luz")).toBe(false);
    expect(matchesPayableSearch(item, "")).toBe(true);
    expect(hasEntryFilter({ dateField: "paidAt" })).toBe(false);
    expect(hasEntryFilter({ dateField: "dueDate", status: "open" })).toBe(true);
  });
});

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

describe("receivable installment line", () => {
  it("mostra o desconto do cliente e o desconto dado na baixa", () => {
    expect(
      receivableInstallmentLine({
        installmentNumber: 1,
        installmentCount: 2,
        status: "paid",
        paymentMethod: "pix",
        customerDiscountInCents: 1000,
        settlementDiscountInCents: 500,
      }),
    ).toMatch(
      /^Parcela 1 de 2 · Desconto do cliente: R\$\s10,00 · Desconto na baixa: R\$\s5,00 · Pago: /,
    );
  });
});
