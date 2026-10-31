import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  addTableSheet,
  createWorkbook,
  phoneColumns,
  sheetDate,
  sheetDateTime,
  workbookBuffer,
} from "./spreadsheet.js";

interface Row {
  name: string;
  phone: string;
  amount: number;
  date: string;
}

describe("planilhas exportadas", () => {
  it("aplica cabeçalho, zebra, formatos, filtro e DDD separado", async () => {
    const workbook = createWorkbook();
    addTableSheet<Row>(
      workbook,
      "Teste",
      [
        { header: "Nome", value: (row) => row.name },
        ...phoneColumns<Row>("Telefone", (row) => row.phone),
        { header: "Valor (R$)", kind: "currency", value: (row) => row.amount },
        { header: "Data", kind: "date", value: (row) => sheetDate(row.date) },
      ],
      [
        { name: "Ana", phone: "11999998888", amount: 10.5, date: "2026-10-01" },
        { name: "Bia", phone: "+351 912 345 678", amount: -2, date: "" },
      ],
    );
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(
      (await workbookBuffer(workbook)) as unknown as ExcelJS.Buffer,
    );
    const sheet = loaded.getWorksheet("Teste")!;
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([
      "Nome",
      "DDD (Telefone)",
      "Telefone",
      "Valor (R$)",
      "Data",
    ]);
    const header = sheet.getCell("A1");
    expect(header.font).toMatchObject({ bold: true });
    expect(header.fill).toMatchObject({ fgColor: { argb: "FF3D625B" } });
    expect(sheet.getCell("D1").alignment).toMatchObject({
      horizontal: "right",
    });
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toBe("A1:E3");
    expect(sheet.getCell("B2").value).toBe("11");
    expect(sheet.getCell("C2").value).toBe("99999-8888");
    expect(sheet.getCell("B3").value).toBe("");
    expect(sheet.getCell("C3").value).toBe("+351 912 345 678");
    expect(sheet.getCell("D2").numFmt).toContain("R$");
    expect(sheet.getCell("D2").alignment).toMatchObject({
      horizontal: "right",
    });
    expect(sheet.getCell("E2").value).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(sheet.getCell("E2").numFmt).toBe("dd/mm/yyyy");
    expect(sheet.getCell("A3").fill).toMatchObject({
      fgColor: { argb: "FFF3F6F5" },
    });
  });

  it("grava data e hora no horário da clínica", () => {
    expect(sheetDateTime("2026-10-01T12:30:00Z")).toEqual(
      new Date("2026-10-01T09:30:00Z"),
    );
    expect(sheetDateTime(undefined)).toBeNull();
  });
});
