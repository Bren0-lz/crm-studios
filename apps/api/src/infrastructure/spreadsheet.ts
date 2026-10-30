import { splitPhone } from "@crm/contracts";
import ExcelJS from "exceljs";

/**
 * Planilhas exportadas pelo CRM: um visual só para todas as abas. Cabeçalho sempre na
 * linha 1 (a planilha de clientes precisa continuar reimportável), em negrito branco sobre
 * o verde da marca, congelado e com filtro em todas as colunas; linhas zebradas; números
 * alinhados à direita com formato brasileiro.
 */
export type SheetColumnKind =
  "text" | "integer" | "decimal" | "currency" | "percent" | "date" | "datetime";

export type SheetCell = string | number | Date | null | undefined;

export interface SheetColumn<Row> {
  header: string;
  /** Tipo da coluna; função quando varia por linha (abas de resumo). */
  kind?: SheetColumnKind | ((row: Row) => SheetColumnKind);
  width?: number;
  value: (row: Row) => SheetCell;
}

export const xlsxContentType =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const brand = "FF3D625B";
const brandDark = "FF2C4842";
const stripe = "FFF3F6F5";
const grid = "FFD9E1DF";

const numberFormats: Partial<Record<SheetColumnKind, string>> = {
  integer: "#,##0",
  decimal: "#,##0.##",
  currency: '"R$" #,##0.00;[Red]-"R$" #,##0.00',
  percent: "0.0%",
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
};

const numeric = new Set<SheetColumnKind>([
  "integer",
  "decimal",
  "currency",
  "percent",
]);

export function createWorkbook(createdAt = new Date()) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Studios Aryana";
  workbook.created = createdAt;
  return workbook;
}

export async function workbookBuffer(workbook: ExcelJS.Workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Data `aaaa-mm-dd` como data do Excel (sem deslocamento de fuso). */
export function sheetDate(isoDate: string | undefined | null): Date | null {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(Date.UTC(year, month - 1, day)) : null;
}

/**
 * Data e hora no fuso da clínica, gravada como "hora de parede": o Excel não guarda fuso,
 * então 09:00 em São Paulo aparece como 09:00 na planilha.
 */
export function sheetDateTime(
  timestamp: string | undefined | null,
  timeZone = "America/Sao_Paulo",
): Date | null {
  if (!timestamp) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(timestamp))
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return new Date(
    Date.UTC(
      parts.year!,
      parts.month! - 1,
      parts.day!,
      parts.hour!,
      parts.minute!,
      parts.second!,
    ),
  );
}

/** Par de colunas `DDD (<título>)` + `<título>` a partir de um telefone. */
export function phoneColumns<Row>(
  header: string,
  phone: (row: Row) => string | undefined | null,
): SheetColumn<Row>[] {
  return [
    { header: `DDD (${header})`, value: (row) => splitPhone(phone(row)).ddd },
    { header, value: (row) => splitPhone(phone(row)).number },
  ];
}

function textWidth(value: SheetCell, kind: SheetColumnKind) {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return kind === "datetime" ? 16 : 10;
  if (typeof value === "number")
    return kind === "currency"
      ? value.toFixed(2).length + 6
      : String(value).length + 2;
  return Math.max(...value.split("\n").map((line) => line.length));
}

export function addTableSheet<Row>(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: readonly SheetColumn<Row>[],
  rows: readonly Row[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: brand } },
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:1",
    },
  });
  const headerKinds = columns.map((column) =>
    typeof column.kind === "string" ? column.kind : "text",
  );
  const kinds = rows.map((row) =>
    columns.map((column) =>
      typeof column.kind === "function"
        ? column.kind(row)
        : (column.kind ?? "text"),
    ),
  );
  const values = rows.map((row) => columns.map((column) => column.value(row)));

  sheet.columns = columns.map((column, index) => ({
    header: column.header,
    width:
      column.width ??
      Math.min(
        60,
        Math.max(
          10,
          column.header.length + 4,
          ...values.map(
            (row, rowIndex) =>
              textWidth(row[index], kinds[rowIndex]![index]!) + 2,
          ),
        ),
      ),
  }));

  const border = { style: "thin" as const, color: { argb: grid } };
  const header = sheet.getRow(1);
  header.height = 28;
  header.eachCell((cell, number) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brand } };
    cell.alignment = {
      vertical: "middle",
      horizontal: numeric.has(headerKinds[number - 1]!) ? "right" : "left",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: brandDark } },
      left: { style: "thin", color: { argb: brandDark } },
      right: { style: "thin", color: { argb: brandDark } },
      bottom: { style: "medium", color: { argb: brandDark } },
    };
  });

  values.forEach((cells, rowIndex) => {
    const row = sheet.addRow(cells.map((value) => value ?? null));
    kinds[rowIndex]!.forEach((kind, index) => {
      const cell = row.getCell(index + 1);
      const format = numberFormats[kind];
      if (format) cell.numFmt = format;
      cell.alignment = {
        vertical: "top",
        horizontal: numeric.has(kind) ? "right" : "left",
        wrapText: kind === "text",
      };
      cell.border = {
        top: border,
        left: border,
        right: border,
        bottom: border,
      };
      if (rowIndex % 2 === 1)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: stripe },
        };
    });
  });

  if (columns.length)
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, rows.length + 1), column: columns.length },
    };
  return sheet;
}
