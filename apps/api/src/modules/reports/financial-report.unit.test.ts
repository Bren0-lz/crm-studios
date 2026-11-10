import type {
  CashMovement,
  PatientTab,
  ProLaboreSettings,
  Receivable,
} from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  buildFinancialReport,
  splitProportionally,
  type FinancialReportSources,
} from "./financial-report.js";

const sum = (values: readonly number[]) =>
  values.reduce((acc, value) => acc + value, 0);

describe("splitProportionally", () => {
  it("keeps the exact total and gives leftover cents to the largest remainders", () => {
    expect(splitProportionally(1_000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(splitProportionally(5_000, [9_000, 3_000, 8_000])).toEqual([
      2_250, 750, 2_000,
    ]);
    const parts = splitProportionally(7_777, [4_500, 4_500, 3_000, 1]);
    expect(sum(parts)).toBe(7_777);
  });

  it("splits refunds with the sign and equally when there is no weight", () => {
    expect(splitProportionally(-1_001, [1, 1])).toEqual([-501, -500]);
    expect(splitProportionally(900, [0, 0, 0])).toEqual([300, 300, 300]);
    expect(splitProportionally(0, [5, 5])).toEqual([0, 0]);
  });
});

describe("buildFinancialReport — vendas", () => {
  const tab = {
    id: "t1",
    receivableId: "r1",
    items: [
      {
        id: "i1",
        productId: "p1",
        productName: "Camiseta",
        size: "M",
        quantity: 2,
        unitPriceInCents: 4_500,
        unitCostInCents: 2_000,
        totalInCents: 9_000,
      },
    ],
    services: [
      {
        id: "s1",
        appointmentId: "a1",
        serviceId: "sv1",
        serviceName: "Pilates avulso",
        professionalId: "pro1",
        professionalName: "Ana",
        amountInCents: 3_001,
      },
    ],
  } as PatientTab;
  const movement = (id: string, amountInCents: number): CashMovement => ({
    id,
    kind: "receipt",
    direction: "in",
    occurredAt: "2031-03-10T15:00:00.000Z",
    description: "Venda de produtos",
    counterpart: "Cliente Bia",
    paymentMethod: "pix",
    amountInCents,
    receivableId: "r1",
  });
  const sources = (
    movements: CashMovement[],
    tabs: PatientTab[] = [tab],
  ): FinancialReportSources => ({
    movements,
    receivables: [{ id: "r1", source: "tab", branchId: "b1" } as Receivable],
    payables: [],
    tabs,
    categories: [],
    costCenters: [],
    commissions: [],
    adjustments: [],
    professionals: [],
    branches: [],
    proLabore: { percentage: 0, base: "profit" } as ProLaboreSettings,
  });
  const build = (input: FinancialReportSources) =>
    buildFinancialReport(
      "2031-03-01",
      "2031-03-31",
      input,
      "America/Sao_Paulo",
      new Date("2031-03-31T12:00:00.000Z"),
    );

  it("breaks each payment into one line per product and service", () => {
    const report = build(
      sources([
        movement("receivable:r1:1", 5_000),
        movement("receivable:r1:2", -1_000),
      ]),
    );
    expect(report.entries.map((entry) => entry.origin)).not.toContain("tab");
    expect(
      report.entries.map(
        ({
          id,
          origin,
          description,
          categoryName,
          amountInCents,
          branchId,
        }) => ({
          id,
          origin,
          description,
          categoryName,
          amountInCents,
          branchId,
        }),
      ),
    ).toEqual([
      {
        id: "receivable:r1:1#i1",
        origin: "product_sale",
        description: "Camiseta · M × 2",
        categoryName: "Venda de produtos",
        amountInCents: 3_750,
        branchId: "b1",
      },
      {
        id: "receivable:r1:1#s1",
        origin: "service_sale",
        description: "Pilates avulso com Ana",
        categoryName: "Serviços (comanda antiga)",
        amountInCents: 1_250,
        branchId: "b1",
      },
      {
        id: "receivable:r1:2#i1",
        origin: "product_sale",
        description: "Camiseta · M × 2",
        categoryName: "Venda de produtos",
        amountInCents: -750,
        branchId: "b1",
      },
      {
        id: "receivable:r1:2#s1",
        origin: "service_sale",
        description: "Pilates avulso com Ana",
        categoryName: "Serviços (comanda antiga)",
        amountInCents: -250,
        branchId: "b1",
      },
    ]);
    expect(report.entries[0]).toMatchObject({
      counterpart: "Cliente Bia",
      paymentMethod: "pix",
    });
    // O serviço vendido não conta como pagamento ao profissional.
    expect(report.professionals).toEqual([]);
  });

  it("keeps the receivable category and one line when the sale is not found", () => {
    const categorized = build({
      ...sources([movement("receivable:r1:1", 1_000)]),
      receivables: [
        { id: "r1", source: "tab", categoryId: "c1" } as Receivable,
      ],
      categories: [{ id: "c1", name: "Loja" } as never],
    });
    expect(categorized.entries.map((entry) => entry.categoryName)).toEqual([
      "Loja",
      "Loja",
    ]);
    const orphan = build(sources([movement("receivable:r1:1", 1_000)], []));
    expect(orphan.entries).toHaveLength(1);
    expect(orphan.entries[0]).toMatchObject({
      id: "receivable:r1:1",
      origin: "product_sale",
      amountInCents: 1_000,
    });
  });
});
