import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type {
  Appointment,
  ReceivedPayment,
  SaleMovement,
} from "@crm/contracts";
import { salesPeriodReportFilterSchema } from "@crm/contracts/reports";
import { buildSalesPeriodReport, salesPeriodBounds } from "./sales-report.js";
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
  it("keeps local date boundaries, cancellations and payments across years and exports only selected movements", async () => {
    const sales = [
      sale("before", "2026-12-31T02:59:59Z", 9999),
      sale("first", "2026-12-31T03:00:00Z", 5000),
      sale("last", "2027-01-02T02:59:59Z", -7000),
      sale("after", "2027-01-02T03:00:00Z", 9999),
    ];
    const payments = sales.map((s) => ({
      ...s,
      id: "payment-" + s.id,
      receivableId: s.id,
      kind: s.amountInCents < 0 ? "reversal" : "payment",
      description: "Parcela",
    })) as ReceivedPayment[];
    const report = buildSalesPeriodReport(
      "2026-12-31",
      "2027-01-01",
      sales,
      payments,
      [],
      new Date("2027-01-02T12:00:00Z"),
    );
    expect(report.summary).toMatchObject({
      grossSalesInCents: 5000,
      cancelledSalesInCents: 7000,
      netSalesInCents: -2000,
      receivedInCents: -2000,
    });
    expect(report.sales.map((s) => s.id)).toEqual(["last", "first"]);
    expect(report).not.toHaveProperty("previousComparable");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await salesReportToXlsx(report)) as unknown as ExcelJS.Buffer,
    );
    expect(workbook.getWorksheet("Resumo")!.columnCount).toBe(2);
    expect(workbook.getWorksheet("Resumo")!.getCell("B5").value).toBe(-20);
    expect(workbook.getWorksheet("Vendas")!.rowCount).toBe(3);
    const cells: string[] = [];
    workbook.eachSheet((sheet) =>
      sheet.eachRow((row) => cells.push(JSON.stringify(row.values))),
    );
    expect(cells.join(" ")).not.toMatch(/Variação|Mês anterior comparável/);
    expect(cells.join(" ")).not.toContain('"before"');
  });
  it("finds distinct clients in the equally sized preceding interval and includes their next appointment", () => {
    const report = buildSalesPeriodReport(
      "2026-03-01",
      "2026-03-02",
      [],
      [],
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
    expect(report.summary.attendedPatients).toBe(1);
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
