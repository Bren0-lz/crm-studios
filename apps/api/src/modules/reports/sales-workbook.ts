import type {
  SaleMovement,
  SalesReport,
  SalesPeriodReport,
  SalesReportPeriod,
} from "@crm/contracts";
import type ExcelJS from "exceljs";
import {
  addTableSheet,
  createWorkbook,
  sheetDateTime,
  workbookBuffer,
  type SheetCell,
  type SheetColumnKind,
} from "../../infrastructure/spreadsheet.js";

// Usados pela planilha de campanhas (campaign-workbook.ts).
export const dateFormat = "dd/mm/yyyy hh:mm";

export function heading(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF3D625B" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
}

const typeLabels: Record<SaleMovement["sourceType"], string> = {
  plan: "Plano",
  service: "Serviço avulso",
  product: "Produto",
};

type ItemSummary = SalesReportPeriod["byItem"][number];
type TopBuyer = SalesReportPeriod["topBuyers"][number];
type WithoutReturn = SalesReport["patientsWithoutReturn"][number];

interface SummaryLine {
  label: string;
  kind: SheetColumnKind;
  current: SheetCell;
  previous?: SheetCell;
}

const money = (cents: number) => cents / 100;
const optionalMoney = (cents: number | undefined) =>
  cents === undefined ? null : cents / 100;

export async function salesReportToXlsx(
  report: SalesReport | SalesPeriodReport,
): Promise<Buffer> {
  const workbook = createWorkbook(new Date(report.generatedAt));

  const isPeriod = "summary" in report;
  const current = isPeriod ? report.summary : report.current;
  const previous = isPeriod ? report.previous : report.previousComparable;
  const changePercent = report.changePercent;

  const compare = (
    label: string,
    kind: SheetColumnKind,
    value: (item: SalesReportPeriod) => number,
  ): SummaryLine => {
    const scale = kind === "currency" ? money : (item: number) => item;
    return {
      label,
      kind,
      current: scale(value(current)),
      previous: scale(value(previous)),
    };
  };
  const lines: SummaryLine[] = [
    {
      label: "Período",
      kind: "text",
      current: `${current.from} a ${current.to}`,
      previous: `${previous.from} a ${previous.to}`,
    },
    compare("Vendas brutas", "currency", (item) => item.grossSalesInCents),
    compare(
      "Cancelamentos das vendas do período",
      "currency",
      (item) => item.cancelledInPeriodSalesInCents,
    ),
    compare("Vendas líquidas", "currency", (item) => item.netSalesInCents),
    compare(
      "Descontos concedidos a clientes",
      "currency",
      (item) => item.customerDiscountInCents ?? 0,
    ),
    compare("Número de vendas", "integer", (item) => item.salesCount),
    compare(
      "Valor médio por venda",
      "currency",
      (item) => item.averageTicketInCents,
    ),
    compare("Clientes compradores", "integer", (item) => item.buyers),
    compare(
      "Novos compradores (primeira compra)",
      "integer",
      (item) => item.newBuyers,
    ),
    compare(
      "Vendas do período já pagas",
      "currency",
      (item) => item.payment.paidInCents,
    ),
    compare(
      "Vendas do período em aberto",
      "currency",
      (item) => item.payment.openInCents,
    ),
    compare(
      "Vendas do período em atraso",
      "currency",
      (item) => item.payment.overdueInCents,
    ),
    compare(
      "Cancelamentos de vendas anteriores (fora do líquido)",
      "currency",
      (item) => item.cancelledPriorSalesInCents,
    ),
    {
      label: "Variação das vendas líquidas (R$)",
      kind: "currency",
      current: money(report.changeInCents),
    },
    changePercent === null
      ? {
          label: "Variação das vendas líquidas (%)",
          kind: "text",
          current: "Sem base de comparação",
        }
      : {
          label: "Variação das vendas líquidas (%)",
          kind: "percent",
          current: changePercent / 100,
        },
    {
      label: "Clientes sem retorno",
      kind: "integer",
      current: report.patientsWithoutReturn.length,
    },
  ];
  const summary = addTableSheet(
    workbook,
    "Resumo",
    [
      {
        header: "Indicador",
        width: 46,
        value: (line: SummaryLine) => line.label,
      },
      {
        header: isPeriod ? "Período selecionado" : "Mês selecionado",
        width: 26,
        kind: (line) => line.kind,
        value: (line) => line.current,
      },
      {
        header: isPeriod ? "Período anterior" : "Mês anterior comparável",
        width: 28,
        kind: (line) => line.kind,
        value: (line) => line.previous,
      },
    ],
    lines,
  );
  // Linha 1 é o cabeçalho: a linha da planilha é o índice + 2.
  summary.getRow(
    lines.findIndex((line) => line.label === "Vendas líquidas") + 2,
  ).font = { bold: true };

  addTableSheet(
    workbook,
    "Vendas",
    [
      {
        header: "Data movimento",
        kind: "datetime",
        value: (item: SaleMovement) => sheetDateTime(item.occurredAt),
      },
      {
        header: "Movimento",
        value: (item) => (item.kind === "sale" ? "Venda" : "Cancelamento"),
      },
      { header: "Tipo", value: (item) => typeLabels[item.sourceType] },
      { header: "Cliente", value: (item) => item.patientName },
      { header: "Item", value: (item) => item.itemName },
      { header: "Quantidade", kind: "decimal", value: (item) => item.quantity },
      {
        header: "Valor (R$)",
        kind: "currency",
        value: (item) => money(item.amountInCents),
      },
      {
        header: "Custo (R$)",
        kind: "currency",
        value: (item) => optionalMoney(item.costInCents),
      },
      {
        header: "Data da venda original",
        kind: "datetime",
        value: (item) => sheetDateTime(item.saleOccurredAt),
      },
      { header: "ID do movimento", value: (item) => item.id },
      { header: "ID da origem", value: (item) => item.sourceId },
      { header: "ID do cliente", value: (item) => item.patientId },
      { header: "ID da conta", value: (item) => item.receivableId ?? "" },
      {
        header: "1º pagamento",
        value: (item) => (item.manualFirstCharge ? "Valor manual" : ""),
      },
    ],
    report.sales,
  );

  addTableSheet(
    workbook,
    "Por item",
    [
      {
        header: "Tipo",
        value: (item: ItemSummary) => typeLabels[item.sourceType],
      },
      { header: "Item", width: 40, value: (item) => item.label },
      { header: "Vendas", kind: "integer", value: (item) => item.salesCount },
      { header: "Quantidade", kind: "decimal", value: (item) => item.quantity },
      {
        header: "Bruto (R$)",
        kind: "currency",
        value: (item) => money(item.grossInCents),
      },
      {
        header: "Cancelado (R$)",
        kind: "currency",
        value: (item) => money(item.cancelledInCents),
      },
      {
        header: "Desconto a clientes (R$)",
        kind: "currency",
        value: (item) => money(item.customerDiscountInCents),
      },
      {
        header: "Líquido (R$)",
        kind: "currency",
        value: (item) => money(item.netInCents),
      },
      {
        header: "Custo (R$)",
        kind: "currency",
        value: (item) => optionalMoney(item.costInCents),
      },
      {
        header: "Margem",
        kind: "percent",
        value: (item) =>
          item.costInCents === undefined || item.netInCents <= 0
            ? null
            : (item.netInCents - item.costInCents) / item.netInCents,
      },
    ],
    current.byItem,
  );

  addTableSheet(
    workbook,
    "Maiores compradores",
    [
      { header: "Cliente", value: (item: TopBuyer) => item.patientName },
      { header: "Vendas", kind: "integer", value: (item) => item.salesCount },
      {
        header: "Líquido (R$)",
        kind: "currency",
        value: (item) => money(item.netInCents),
      },
      {
        header: "Primeira compra no período",
        value: (item) => (item.firstPurchase ? "Sim" : "Não"),
      },
      { header: "ID do cliente", value: (item) => item.patientId },
    ],
    current.topBuyers,
  );

  addTableSheet(
    workbook,
    "Sem retorno",
    [
      { header: "Cliente", value: (item: WithoutReturn) => item.patientName },
      {
        header: "Último atendimento concluído",
        kind: "datetime",
        value: (item) => sheetDateTime(item.lastCompletedAt),
      },
      {
        header: "Próximo agendamento",
        kind: "datetime",
        value: (item) => sheetDateTime(item.nextAppointmentAt),
      },
      { header: "ID do cliente", value: (item) => item.patientId },
    ],
    report.patientsWithoutReturn,
  );

  let definitions: [string, string][] = [
    [
      "Vendas brutas",
      "Valor dos planos criados e dos itens das comandas fechadas no período, pela data local da venda.",
    ],
    [
      "Cancelamentos das vendas do período",
      "Parcelas abertas canceladas em planos e valor total das comandas canceladas, quando a venda e o cancelamento caem no período. Abatem as vendas líquidas.",
    ],
    [
      "Cancelamentos de vendas anteriores",
      "Cancelamentos registrados no período de vendas feitas antes dele. Ficam fora das vendas líquidas para o período não ficar negativo; aparecem na aba Vendas com a data da venda original.",
    ],
    [
      "Vendas líquidas",
      "Vendas brutas menos os cancelamentos das vendas do período. Uma venda pode ser paga em outro mês: o dinheiro recebido fica no relatório Financeiro.",
    ],
    [
      "Valor médio por venda",
      "Vendas brutas ÷ número de vendas (cada plano ou comanda conta uma vez).",
    ],
    [
      "Novos compradores",
      "Clientes cuja primeira compra da história (plano ou comanda) foi no período.",
    ],
    [
      "Vendas pagas, em aberto e em atraso",
      "Contas a receber ligadas às vendas do período, sem as canceladas; em atraso = em aberto com vencimento antes de hoje.",
    ],
    [
      "Custo e margem",
      "Só produtos: custo unitário gravado na comanda × quantidade; margem = (líquido − custo) ÷ líquido.",
    ],
    [
      "Mês anterior comparável",
      "Quando o mês atual está em andamento, o mês anterior é comparado somente até o mesmo dia; meses encerrados usam o mês anterior completo.",
    ],
    [
      "Período anterior",
      "Intervalo com o mesmo número de dias imediatamente antes do período selecionado.",
    ],
    [
      "Sem retorno",
      "Clientes com atendimento concluído em qualquer dia do mês anterior completo e nenhum atendimento concluído no mês selecionado até a data exibida.",
    ],
    ["Horário", "Datas interpretadas no fuso America/Sao_Paulo."],
    [
      "Fonte",
      "IDs nas abas de detalhe apontam para plano, comanda, conta e cliente no CRM.",
    ],
  ];
  const monthOnly = ["Mês anterior comparável", "Sem retorno"];
  definitions = definitions.filter(([label]) =>
    isPeriod ? !monthOnly.includes(label) : label !== "Período anterior",
  );
  if ("summary" in report)
    definitions.push([
      "Sem retorno",
      "Clientes atendidos de " +
        report.returnReference.from +
        " a " +
        report.returnReference.to +
        ", sem atendimento concluído de " +
        report.from +
        " a " +
        report.to +
        ".",
    ]);
  addTableSheet(
    workbook,
    "Definições",
    [
      {
        header: "Indicador",
        width: 35,
        value: ([label]: [string, string]) => label,
      },
      { header: "Definição", width: 105, value: ([, text]) => text },
    ],
    definitions,
  );

  return workbookBuffer(workbook);
}
