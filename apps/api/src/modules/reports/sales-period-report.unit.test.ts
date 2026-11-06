import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { Appointment, SaleMovement } from "@crm/contracts";
import { salesPeriodReportFilterSchema } from "@crm/contracts/reports";
import {
  buildSalesPeriodReport,
  emptySalesBilling,
  salesPeriodBounds,
} from "./sales-report.js";
import { salesReportToXlsx } from "./sales-workbook.js";

const sale = (
  id: string,
  occurredAt: string,
  amountInCents: number,
): SaleMovement => ({
  id,
  occurredAt,
  amountInCents,
  sourceId: id,
  sourceType: "plan",
  kind: amountInCents < 0 ? "cancellation" : "sale",
  patientId: "p1",
  patientName: "Ana",
  itemName: "Pilates",
  quantity: 1,
  services: [],
});
const appointment = (
  patientId: string | undefined,
  startsAt: string,
  status = "completed",
) => ({ patientId, patientName: patientId, startsAt, status }) as Appointment;

describe("sales by inclusive date range", () => {
  it("validates real dates and rejects missing or inverted bounds", () => {
    expect(
      salesPeriodReportFilterSchema.safeParse({
        from: "2026-02-30",
        to: "2026-03-01",
      }).success,
    ).toBe(false);
    expect(
      salesPeriodReportFilterSchema.safeParse({
        from: "2026-03-02",
        to: "2026-03-01",
      }).success,
    ).toBe(false);
    expect(
      salesPeriodReportFilterSchema.safeParse({ from: "2026-03-01" }).success,
    ).toBe(false);
    expect(
      salesPeriodReportFilterSchema.parse({
        from: "2026-03-01",
        to: "2026-03-01",
      }).from,
    ).toBe("2026-03-01");
  });
  it("keeps local date boundaries, separates cancellations of earlier sales and exports only selected movements", async () => {
    const sales = [
      sale("before", "2026-12-31T02:59:59Z", 9999),
      sale("first", "2026-12-31T03:00:00Z", 5000),
      {
        ...sale("last", "2027-01-02T02:59:59Z", -7000),
        saleOccurredAt: "2026-11-10T12:00:00Z",
      },
      sale("after", "2027-01-02T03:00:00Z", 9999),
    ];
    const report = buildSalesPeriodReport(
      "2026-12-31",
      "2027-01-01",
      sales,
      emptySalesBilling,
      [],
      new Date("2027-01-02T12:00:00Z"),
    );
    expect(report.summary).toMatchObject({
      grossSalesInCents: 5000,
      cancelledSalesInCents: 7000,
      cancelledInPeriodSalesInCents: 0,
      cancelledPriorSalesInCents: 7000,
      netSalesInCents: 5000,
    });
    // Intervalo anterior de mesmo tamanho: 29 e 30/12 (a venda "before" é do dia 30).
    expect(report.previous).toMatchObject({
      from: "2026-12-29",
      to: "2026-12-30",
      grossSalesInCents: 9999,
    });
    expect(report.changeInCents).toBe(5000 - 9999);
    expect(report.sales.map((s) => s.id)).toEqual(["last", "first"]);
    expect(report).not.toHaveProperty("previousComparable");
    expect(report).not.toHaveProperty("payments");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await salesReportToXlsx(report)) as unknown as ExcelJS.Buffer,
    );
    const summary = workbook.getWorksheet("Resumo")!;
    expect(summary.getCell("C1").value).toBe("Período anterior");
    expect(summary.getCell("A5").value).toBe("Vendas líquidas");
    expect(summary.getCell("B5").value).toBe(50);
    expect(workbook.getWorksheet("Vendas")!.rowCount).toBe(3);
    expect(workbook.getWorksheet("Recebimentos")).toBeUndefined();
    const cells: string[] = [];
    workbook.eachSheet((sheet) =>
      sheet.eachRow((row) => cells.push(JSON.stringify(row.values))),
    );
    expect(cells.join(" ")).not.toMatch(/Mês anterior comparável|Recebido/);
    expect(cells.join(" ")).not.toContain('"before"');
  });
  it("details sales by type, item and buyer, with own cancellations, product cost and payment status", () => {
    const line = (
      id: string,
      overrides: Partial<SaleMovement>,
    ): SaleMovement => ({
      ...sale(id, "2026-03-10T15:00:00Z", 0),
      ...overrides,
    });
    const sales: SaleMovement[] = [
      line("plan-a:sale", {
        sourceId: "plan-a",
        amountInCents: 30000,
        customerDiscountInCents: 3000,
        itemName: "Mensal (Pilates)",
      }),
      line("plan-a:cancellation", {
        sourceId: "plan-a",
        kind: "cancellation",
        occurredAt: "2026-03-20T15:00:00Z",
        saleOccurredAt: "2026-03-10T15:00:00Z",
        amountInCents: -10000,
        itemName: "Mensal (Pilates)",
      }),
      line("item-1:sale", {
        sourceId: "tab-1",
        sourceType: "product",
        patientId: "p2",
        patientName: "Bia",
        itemName: "Faixa",
        quantity: 2,
        amountInCents: 4000,
        costInCents: 1500,
      }),
      line("item-2:sale", {
        sourceId: "tab-1",
        sourceType: "service",
        patientId: "p2",
        patientName: "Bia",
        itemName: "Avaliação",
        amountInCents: 8000,
      }),
      line("item-3:sale", {
        sourceId: "tab-2",
        sourceType: "product",
        patientId: "p2",
        patientName: "Bia",
        itemName: "Faixa",
        quantity: 1,
        amountInCents: 2000,
        costInCents: 750,
      }),
      line("item-3:cancellation", {
        sourceId: "tab-2",
        sourceType: "product",
        kind: "cancellation",
        patientId: "p2",
        patientName: "Bia",
        itemName: "Faixa",
        occurredAt: "2026-03-11T15:00:00Z",
        saleOccurredAt: "2026-03-10T15:00:00Z",
        amountInCents: -2000,
      }),
    ];
    const report = buildSalesPeriodReport(
      "2026-03-01",
      "2026-03-31",
      sales,
      {
        receivables: [
          {
            sourceId: "plan-a",
            status: "paid",
            amountInCents: 13500,
            dueDate: "2026-03-10",
          },
          {
            sourceId: "plan-a",
            status: "cancelled",
            amountInCents: 10000,
            dueDate: "2026-04-10",
          },
          {
            sourceId: "plan-a",
            status: "open",
            amountInCents: 3500,
            dueDate: "2026-03-25",
          },
          {
            sourceId: "tab-1",
            status: "open",
            amountInCents: 12000,
            dueDate: "2026-04-05",
          },
          {
            sourceId: "outra",
            status: "open",
            amountInCents: 99999,
            dueDate: "2026-01-01",
          },
        ],
        // Ana já comprou em 2025; Bia compra pela primeira vez.
        firstSaleAt: new Map([
          ["p1", "2025-06-01T12:00:00Z"],
          ["p2", "2026-03-10T15:00:00Z"],
        ]),
      },
      [],
      new Date("2026-03-31T15:00:00Z"),
    );
    const summary = report.summary;
    expect(summary).toMatchObject({
      grossSalesInCents: 44000,
      cancelledInPeriodSalesInCents: 12000,
      cancelledPriorSalesInCents: 0,
      netSalesInCents: 32000,
      salesCount: 3,
      averageTicketInCents: 14667,
      buyers: 2,
      newBuyers: 1,
      customerDiscountInCents: 3000,
      payment: { paidInCents: 13500, openInCents: 15500, overdueInCents: 3500 },
    });
    expect(summary.byType.map((row) => [row.label, row.netInCents])).toEqual([
      ["Planos", 20000],
      ["Serviços avulsos", 8000],
      ["Produtos", 4000],
    ]);
    expect(summary.byItem.find((row) => row.label === "Faixa")).toMatchObject({
      sourceType: "product",
      salesCount: 2,
      quantity: 3,
      grossInCents: 6000,
      cancelledInCents: 2000,
      netInCents: 4000,
      // A unidade cancelada não entra no custo.
      costInCents: 1500,
    });
    expect(
      summary.byItem.find((row) => row.label === "Mensal (Pilates)"),
    ).not.toHaveProperty("costInCents");
    expect(summary.topBuyers).toEqual([
      {
        patientId: "p1",
        patientName: "Ana",
        salesCount: 1,
        netInCents: 20000,
        firstPurchase: false,
      },
      {
        patientId: "p2",
        patientName: "Bia",
        salesCount: 2,
        netInCents: 12000,
        firstPurchase: true,
      },
    ]);
  });
  it("finds distinct clients in the equally sized preceding interval and includes their next appointment", () => {
    const report = buildSalesPeriodReport(
      "2026-03-01",
      "2026-03-02",
      [],
      emptySalesBilling,
      [
        appointment("ana", "2026-02-27T12:00:00Z"),
        appointment("ana", "2026-02-28T12:00:00Z"),
        appointment("bia", "2026-02-28T12:00:00Z"),
        appointment("bia", "2026-03-02T12:00:00Z"),
        appointment("outside", "2026-02-26T12:00:00Z"),
        appointment(undefined, "2026-02-28T12:00:00Z"),
        appointment("ana", "2026-03-05T12:00:00Z", "scheduled"),
      ],
      new Date("2026-03-03T12:00:00Z"),
    );
    expect(report.returnReference).toEqual({
      from: "2026-02-27",
      to: "2026-02-28",
    });
    expect(report.patientsWithoutReturn).toEqual([
      expect.objectContaining({
        patientId: "ana",
        lastCompletedAt: "2026-02-28T12:00:00Z",
        nextAppointmentAt: "2026-03-05T12:00:00Z",
      }),
    ]);
    expect(salesPeriodBounds("2024-03-01", "2024-03-01").previousFrom).toBe(
      "2024-02-29",
    );
  });
});
