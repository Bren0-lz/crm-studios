import type { PatientTab, Product } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  monthPeriod,
  productSales,
  salesTabFromParam,
  sizeStockSummary,
  sizeStockText,
  summarizeProductSales,
} from "./model";

const tab = (overrides: Partial<PatientTab>): PatientTab => ({
  id: "t",
  clinicId: "c",
  patientId: "p",
  patientName: "Ana Souza",
  status: "closed",
  paymentStatus: "paid",
  totalInCents: 0,
  items: [],
  openedAt: "2026-10-10T12:00:00.000Z",
  closedAt: "2026-10-10T12:30:00.000Z",
  ...overrides,
});
const item = (productId: string, quantity: number, unit: number) => ({
  id: `${productId}-${quantity}`,
  productId,
  productName: productId === "a" ? "Creme" : "Óleo",
  quantity,
  unitPriceInCents: unit,
  unitCostInCents: 0,
  totalInCents: quantity * unit,
});
const october = { from: "2026-10-01", to: "2026-10-31" };

describe("vendas de produtos", () => {
  it("reconhece só as sub-abas conhecidas de ?aba=", () => {
    expect(salesTabFromParam("resumo")).toBe("summary");
    expect(salesTabFromParam("comandas")).toBeNull();
    expect(salesTabFromParam("outra")).toBeNull();
    expect(salesTabFromParam(null)).toBeNull();
  });

  it("calcula o mês com o último dia correto", () => {
    expect(monthPeriod(new Date(2026, 1, 10))).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(monthPeriod(new Date(2026, 0, 10), -1)).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("lista vendas com produto no período, sem comandas abertas", () => {
    const tabs = [
      tab({ id: "1", items: [item("a", 1, 1000)] }),
      tab({ id: "2", status: "open", items: [item("a", 1, 1000)] }),
      tab({ id: "3", items: [] }),
      tab({
        id: "4",
        items: [item("a", 1, 1000)],
        closedAt: "2026-09-10T12:00:00.000Z",
      }),
      tab({ id: "5", patientName: "Bruno", items: [item("b", 1, 500)] }),
    ];
    expect(productSales(tabs, october).map((sale) => sale.id)).toEqual([
      "1",
      "5",
    ]);
    expect(productSales(tabs, october, "brun").map((sale) => sale.id)).toEqual([
      "5",
    ]);
  });

  it("resume o período ignorando canceladas e ordena por receita", () => {
    const summary = summarizeProductSales(
      [
        tab({ id: "1", items: [item("a", 2, 1000), item("b", 1, 3000)] }),
        tab({ id: "2", items: [item("b", 1, 3000)] }),
        tab({ id: "3", status: "cancelled", items: [item("a", 9, 1000)] }),
      ],
      october,
    );
    expect(summary).toMatchObject({
      totalInCents: 8000,
      salesCount: 2,
      itemsCount: 4,
      averageTicketInCents: 4000,
    });
    expect(summary.topProducts.map((entry) => entry.productId)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("estoque por tamanho", () => {
  const shirt = {
    currentStock: 40,
    restockAlertAt: 3,
    sizes: ["P", "M", "G", "XG"],
    sizeStock: [
      { size: "P", currentStock: 4 },
      { size: "M", currentStock: 10 },
      { size: "G", currentStock: 0 },
      { size: "XG", currentStock: 2 },
      { size: null, currentStock: 24 },
    ],
  } as unknown as Product;

  it("marca cada tamanho como esgotado, a repor ou em dia", () => {
    expect(
      sizeStockSummary(shirt).map(({ label, stock, state }) => [
        label,
        stock,
        state,
      ]),
    ).toEqual([
      ["P", 4, "ok"],
      ["M", 10, "ok"],
      ["G", 0, "sold_out"],
      ["XG", 2, "restock"],
      ["Sem tamanho", 24, "ok"],
    ]);
    expect(sizeStockText(shirt)).toBe(
      "P: 4 · M: 10 · G: 0 · XG: 2 · Sem tamanho: 24",
    );
  });

  it("não marca tamanhos quando o produto todo está sem estoque", () => {
    const empty = {
      ...shirt,
      currentStock: 0,
      sizeStock: shirt.sizeStock.map((entry) => ({
        ...entry,
        currentStock: 0,
      })),
    } as Product;
    expect(sizeStockSummary(empty).every((entry) => entry.state === "ok")).toBe(
      true,
    );
  });
});
