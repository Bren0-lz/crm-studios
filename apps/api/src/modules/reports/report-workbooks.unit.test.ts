import type {
  ClientDetailsReport,
  DreReport,
  FinancialEntry,
  ManagementReport,
} from "@crm/contracts";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  clientDetailsToXlsx,
  dreReportToXlsx,
  financialEntriesToXlsx,
  managementReportToXlsx,
} from "./report-workbooks.js";

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook;
}

function headers(sheet: ExcelJS.Worksheet) {
  return (sheet.getRow(1).values as unknown[]).slice(1);
}

function report(): ManagementReport {
  return {
    from: "2026-10-01",
    to: "2026-10-31",
    generatedAt: "2026-10-12T12:00:00Z",
    appointments: {
      total: 0,
      completed: 0,
      noShows: 0,
      cancelled: 0,
      attendanceRate: 0,
      byVisitType: { regular: 0, trial: 0, evaluation: 0 },
    },
    trials: { scheduled: 0, completed: 0, converted: 0, conversionRate: 0 },
    plans: { active: 0, availableSessions: 0, consumedInPeriod: 0 },
    finance: { openInCents: 0, overdueInCents: 0, paidInPeriodInCents: 10000 },
    commercial: {
      leadsCreated: 0,
      won: 0,
      lost: 0,
      conversionRate: 0,
      averageFirstResponseMinutes: 0,
    },
    byProfessional: [],
    byService: [],
    bySource: [],
    profitability: {
      dre: {
        serviceRevenueInCents: 10000,
        productRevenueInCents: 0,
        grossRevenueInCents: 10000,
        productCostInCents: 1000,
        grossProfitInCents: 9000,
        operatingExpensesInCents: 0,
        commissionsInCents: 0,
        netResultInCents: 9000,
        netMargin: 90,
      },
      byService: [],
      byProduct: [],
      operational: {
        groupOccupancyRate: 0,
        activeGroupSeats: 0,
        totalGroupCapacity: 0,
        waitlistCount: 0,
        lowStockCount: 0,
        productUnitsSold: 0,
        averageReceiptInCents: 0,
      },
    },
  };
}

describe("planilha do relatório gerencial", () => {
  it("separa as abas e grava valores em reais e taxas em %", async () => {
    const data = report();
    data.byService = [
      {
        id: "s1",
        name: 'Pilates; "duo"\nmanhã',
        appointments: 4,
        completed: 3,
        noShows: 1,
        attendanceRate: 75,
      },
    ];
    const workbook = await load(await managementReportToXlsx(data));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Resumo",
      "Profissionais",
      "Serviços",
      "Origens",
      "Rentabilidade serviços",
      "Rentabilidade produtos",
    ]);
    const summary = workbook.getWorksheet("Resumo")!;
    expect(headers(summary)).toEqual(["Seção", "Indicador", "Valor"]);
    const received = summary
      .getColumn(2)
      .values.findIndex((value) => value === "Recebido no período");
    expect(summary.getCell(received, 3).value).toBe(100);
    expect(summary.getCell(received, 3).numFmt).toContain("R$");
    const margin = summary
      .getColumn(2)
      .values.findIndex((value) => value === "Margem líquida");
    expect(summary.getCell(margin, 3).value).toBe(0.9);
    expect(summary.getCell(margin, 3).numFmt).toBe("0.0%");
    const services = workbook.getWorksheet("Serviços")!;
    expect(services.getCell("A2").value).toBe('Pilates; "duo"\nmanhã');
    expect(services.getCell("E2").value).toBe(0.75);
  });
});

describe("planilha do extrato financeiro", () => {
  const entries: FinancialEntry[] = [
    {
      id: "receipt:1",
      direction: "in",
      kind: "receipt",
      occurredAt: "2026-10-05T12:00:00.000Z",
      date: "2026-10-05",
      description: "Plano mensal",
      counterpart: "José Ávila",
      paymentMethod: "pix",
      amountInCents: 12_345,
      origin: "plan",
      categoryName: "Venda de planos",
      branchId: "b1",
    },
    {
      id: "payable:1",
      direction: "out",
      kind: "payable",
      occurredAt: "2026-10-20T12:00:00.000Z",
      date: "2026-10-20",
      description: 'Conta "luz"',
      paymentMethod: "boleto",
      amountInCents: 5_000,
      origin: "expense",
      categoryName: "Energia",
    },
  ];

  it("grava data real, saídas negativas e filtro em todas as colunas", async () => {
    const workbook = await load(
      await financialEntriesToXlsx(entries, () => "Centro"),
    );
    const sheet = workbook.getWorksheet("Extrato")!;
    expect(headers(sheet)[0]).toBe("Data");
    expect(sheet.getCell("A2").value).toEqual(new Date("2026-10-05T00:00:00Z"));
    expect(sheet.getCell("B2").value).toBe("Entrada");
    expect(sheet.getCell("J2").value).toBe(123.45);
    expect(sheet.getCell("C3").value).toBe('Conta "luz"');
    expect(sheet.getCell("J3").value).toBe(-50);
    expect(sheet.autoFilter).toBe("A1:J3");
  });
});

describe("planilha da DRE", () => {
  it("uma linha por competência e uma coluna por grupo", async () => {
    const expenses = {
      unclassified: 0,
      service_revenue: 0,
      product_revenue: 0,
      tax: 1_000,
      service_cost: 0,
      product_cost: 0,
      variable_cost: 0,
      fixed_expense: 2_000,
      depreciation: 0,
      financial_result: 0,
    };
    const dre: DreReport = {
      from: "2026-10-01",
      to: "2026-10-31",
      months: [
        {
          month: "2026-10",
          serviceRevenueInCents: 10_000,
          productRevenueInCents: 0,
          otherRevenueInCents: 0,
          expenses,
          resultInCents: 7_000,
        },
      ],
      totals: {
        revenueInCents: 10_000,
        expensesInCents: 3_000,
        resultInCents: 7_000,
      },
      categories: [
        {
          id: "c1",
          name: "Aluguel",
          group: "fixed_expense",
          amountInCents: 2_000,
        },
      ],
    };
    const workbook = await load(await dreReportToXlsx(dre));
    const sheet = workbook.getWorksheet("DRE por competência")!;
    expect(headers(sheet)).toContain("Impostos e deduções (R$)");
    expect(sheet.getCell("B2").value).toBe(100);
    expect(sheet.getRow(2).getCell(sheet.columnCount).value).toBe(70);
    expect(workbook.getWorksheet("Categorias")!.getCell("B2").value).toBe(
      "Despesas fixas",
    );
  });
});

describe("planilha da consulta de clientes", () => {
  it("separa DDD e número e converte datas e taxas", async () => {
    const data: ClientDetailsReport = {
      from: "2026-10-01",
      to: "2026-10-31",
      columns: [
        "fullName",
        "phone",
        "birthDate",
        "attendanceRate",
        "imageConsent",
      ],
      availableColumns: [],
      rows: [
        {
          id: "p1",
          values: {
            fullName: "Ana",
            phone: "11999998888",
            birthDate: "1990-02-03",
            attendanceRate: 80,
            imageConsent: true,
          },
        },
      ],
    };
    const workbook = await load(await clientDetailsToXlsx(data));
    const sheet = workbook.getWorksheet("Clientes")!;
    expect(headers(sheet)).toEqual([
      "Cliente",
      "DDD (Telefone)",
      "Telefone",
      "Nascimento",
      "Frequência (%)",
      "Uso de imagem",
    ]);
    expect((sheet.getRow(2).values as unknown[]).slice(1)).toEqual([
      "Ana",
      "11",
      "99999-8888",
      new Date("1990-02-03T00:00:00Z"),
      0.8,
      "Sim",
    ]);
  });
});
