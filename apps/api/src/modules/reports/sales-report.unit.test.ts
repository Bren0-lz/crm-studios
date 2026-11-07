import type {
  Appointment,
  PatientWithoutReturn,
  SaleMovement,
} from "@crm/contracts";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildSalesReport,
  emptySalesBilling,
  withContractedHistory,
} from "./sales-report.js";
import { salesReportToXlsx } from "./sales-workbook.js";

describe("monthly sales report", () => {
  it("keeps sales in their own months, leaves cancellations of earlier sales out of the net and finds patients without return", async () => {
    const patientOne = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const patientTwo = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const sales: SaleMovement[] = [
      {
        id: "plan:sale",
        sourceId: "plan",
        sourceType: "plan",
        kind: "sale",
        occurredAt: "2026-08-10T15:00:00Z",
        patientId: patientOne,
        patientName: "Ana",
        itemName: "Pacote",
        quantity: 1,
        services: [],
        amountInCents: 10000,
      },
      {
        id: "plan:cancellation",
        sourceId: "plan",
        sourceType: "plan",
        kind: "cancellation",
        occurredAt: "2026-09-14T15:00:00Z",
        saleOccurredAt: "2026-08-10T15:00:00Z",
        patientId: patientOne,
        patientName: "Ana",
        itemName: "Pacote",
        quantity: 1,
        services: [],
        amountInCents: -10000,
      },
      {
        id: "product:sale",
        sourceId: "tab",
        sourceType: "product",
        kind: "sale",
        occurredAt: "2026-09-12T15:00:00Z",
        patientId: patientTwo,
        patientName: "Bia",
        itemName: "Faixa",
        quantity: 2,
        services: [],
        amountInCents: 5000,
      },
    ];
    const billing = {
      receivables: [
        {
          sourceId: "tab",
          status: "paid" as const,
          amountInCents: 5000,
          dueDate: "2026-09-12",
        },
      ],
      firstSaleAt: new Map([[patientTwo, "2026-09-12T15:00:00Z"]]),
    };
    const appointment = (
      patientId: string,
      patientName: string,
      startsAt: string,
      status: Appointment["status"],
    ) => ({ patientId, patientName, startsAt, status }) as Appointment;
    const report = buildSalesReport(
      "2026-09",
      sales,
      billing,
      [
        appointment(patientOne, "Ana", "2026-08-20T15:00:00Z", "completed"),
        appointment(patientTwo, "Bia", "2026-08-10T15:00:00Z", "completed"),
        appointment(patientTwo, "Bia", "2026-09-05T15:00:00Z", "completed"),
        appointment(patientOne, "Ana", "2026-09-20T15:00:00Z", "scheduled"),
      ],
      new Date("2026-09-15T15:00:00Z"),
    );
    expect(report.current).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-15",
      grossSalesInCents: 5000,
      cancelledSalesInCents: 10000,
      cancelledInPeriodSalesInCents: 0,
      cancelledPriorSalesInCents: 10000,
      netSalesInCents: 5000,
      buyers: 1,
      newBuyers: 1,
      payment: { paidInCents: 5000, openInCents: 0, overdueInCents: 0 },
    });
    expect(report.current).not.toHaveProperty("receivedInCents");
    expect(report.previousComparable).toMatchObject({
      from: "2026-08-01",
      to: "2026-08-15",
      netSalesInCents: 10000,
    });
    expect(report.changePercent).toBe(-50);
    expect(report.patientsWithoutReturn).toMatchObject([
      { patientId: patientOne, nextAppointmentAt: "2026-09-20T15:00:00Z" },
    ]);

    const buffer = await salesReportToXlsx(report);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Resumo",
      "Vendas",
      "Por item",
      "Maiores compradores",
      "Sem retorno",
      "Definições",
    ]);
    expect(workbook.getWorksheet("Resumo")!.getCell("B5").value).toBe(50);
    expect(workbook.getWorksheet("Resumo")!.getCell("A14").value).toBe(
      "Cancelamentos de vendas anteriores (fora do líquido)",
    );
    expect(workbook.getWorksheet("Resumo")!.getCell("B14").value).toBe(100);
    expect(workbook.getWorksheet("Vendas")!.getCell("A2").value).toBeInstanceOf(
      Date,
    );
    expect(workbook.getWorksheet("Vendas")!.getCell("G2").value).toBe(-100);
    expect(workbook.getWorksheet("Vendas")!.getCell("I2").value).toBeInstanceOf(
      Date,
    );
    expect(workbook.getWorksheet("Por item")!.getCell("B2").value).toBe(
      "Faixa",
    );
    expect(workbook.getWorksheet("Sem retorno")!.getCell("A2").value).toBe(
      "Ana",
    );
  });

  it("has no change percent when the previous base is zero", async () => {
    const movement = (
      kind: SaleMovement["kind"],
      occurredAt: string,
      amountInCents: number,
    ): SaleMovement => ({
      id: `${kind}:${occurredAt}`,
      sourceId: "plan",
      sourceType: "plan",
      kind,
      occurredAt,
      patientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      patientName: "Ana",
      itemName: "Pacote",
      quantity: 1,
      services: [],
      amountInCents,
    });
    const report = buildSalesReport(
      "2026-09",
      [
        movement("cancellation", "2026-08-05T15:00:00Z", -700000),
        movement("sale", "2026-09-05T15:00:00Z", 49000),
      ],
      emptySalesBilling,
      [],
      new Date("2026-09-15T15:00:00Z"),
    );
    // O cancelamento de venda antiga não deixa a base negativa: fica à parte.
    expect(report.previousComparable.netSalesInCents).toBe(0);
    expect(report.previousComparable.cancelledPriorSalesInCents).toBe(700000);
    expect(report.current.netSalesInCents).toBe(49000);
    expect(report.changeInCents).toBe(49000);
    expect(report.changePercent).toBeNull();

    const buffer = await salesReportToXlsx(report);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const summary = workbook.getWorksheet("Resumo")!;
    expect(summary.getCell("B15").value).toBe(490);
    expect(summary.getCell("B16").value).toBe("Sem base de comparação");
  });

  it("ignores lead appointments in clients without return", () => {
    const leadAppointment = (startsAt: string) =>
      ({
        leadId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        leadName: "Lead Experimental",
        patientName: "Lead Experimental",
        startsAt,
        status: "completed",
      }) as Appointment;
    const asOf = new Date("2026-09-15T15:00:00Z");
    const current = buildSalesReport(
      "2026-09",
      [],
      emptySalesBilling,
      [leadAppointment("2026-09-05T15:00:00Z")],
      asOf,
    );
    expect(current.patientsWithoutReturn).toEqual([]);
    const previous = buildSalesReport(
      "2026-09",
      [],
      emptySalesBilling,
      [leadAppointment("2026-08-10T15:00:00Z")],
      asOf,
    );
    expect(previous.patientsWithoutReturn).toEqual([]);
  });
});

describe("contracted history of patients without return", () => {
  it("lists each contracted item once, keeps cancelled sales and ignores other patients", () => {
    const movement = (
      id: string,
      patientId: string,
      sourceType: SaleMovement["sourceType"],
      itemName: string,
      kind: SaleMovement["kind"] = "sale",
    ): SaleMovement => ({
      id,
      sourceId: id,
      sourceType,
      kind,
      occurredAt: "2026-08-10T15:00:00Z",
      patientId,
      patientName: patientId,
      itemName,
      quantity: 1,
      services: [],
      amountInCents: kind === "sale" ? 1000 : -1000,
    });
    const patientsWithoutReturn: PatientWithoutReturn[] = [
      {
        patientId: "ana",
        patientName: "Ana",
        lastCompletedAt: "2026-08-01T15:00:00Z",
      },
      {
        patientId: "bia",
        patientName: "Bia",
        lastCompletedAt: "2026-08-01T15:00:00Z",
      },
    ];
    const report = withContractedHistory({ patientsWithoutReturn }, [
      movement("1", "ana", "plan", "Pilates 2x (Pilates)"),
      movement("2", "ana", "plan", "Pilates 2x (Pilates)"),
      movement("2c", "ana", "plan", "Pilates 2x (Pilates)", "cancellation"),
      movement("3", "ana", "product", "Bola suíça"),
      movement("4", "ana", "service", "Avaliação"),
      movement("5", "carla", "service", "Depilação"),
    ]);
    expect(report.patientsWithoutReturn.map((item) => item.contracted)).toEqual(
      [
        [
          { sourceType: "service", itemName: "Avaliação" },
          { sourceType: "product", itemName: "Bola suíça" },
          { sourceType: "plan", itemName: "Pilates 2x (Pilates)" },
        ],
        [],
      ],
    );
  });
});
