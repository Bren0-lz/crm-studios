import type {
  SaleMovement,
  SalesReport,
  SalesPeriodReport,
  SalesReportPeriod,
} from "@crm/contracts";
import ExcelJS from "exceljs";

const currencyFormat = '"R$" #,##0.00;[Red]("R$" #,##0.00)';
export const dateFormat = "dd/mm/yyyy hh:mm";
const typeLabels: Record<SaleMovement["sourceType"], string> = {
  plan: "Plano",
  service: "Serviço avulso",
  product: "Produto",
};

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

export async function salesReportToXlsx(
  report: SalesReport | SalesPeriodReport,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Studios Aryana";
  workbook.created = new Date(report.generatedAt);

  const isPeriod = "summary" in report;
  const current = isPeriod ? report.summary : report.current;
  const previous = isPeriod ? report.previous : report.previousComparable;
  const changeInCents = report.changeInCents;
  const changePercent = report.changePercent;

  const summary = workbook.addWorksheet("Resumo");
  summary.columns = [
    { header: "Indicador", key: "metric", width: 46 },
    {
      header: isPeriod ? "Período selecionado" : "Mês selecionado",
      key: "current",
      width: 26,
    },
    {
      header: isPeriod ? "Período anterior" : "Mês anterior comparável",
      key: "previous",
      width: 28,
    },
  ];
  heading(summary);
  summary.addRow([
    "Período",
    `${current.from} a ${current.to}`,
    `${previous.from} a ${previous.to}`,
  ]);
  const money = (label: string, value: (item: SalesReportPeriod) => number) => {
    const row = summary.addRow([
      label,
      value(current) / 100,
      value(previous) / 100,
    ]);
    row.getCell(2).numFmt = currencyFormat;
    row.getCell(3).numFmt = currencyFormat;
    return row;
  };
  const count = (label: string, value: (item: SalesReportPeriod) => number) =>
    summary.addRow([label, value(current), value(previous)]);
  money("Vendas brutas", (item) => item.grossSalesInCents);
  money(
    "Cancelamentos das vendas do período",
    (item) => item.cancelledInPeriodSalesInCents,
  );
  money("Vendas líquidas", (item) => item.netSalesInCents).font = {
    bold: true,
  };
  money(
    "Descontos concedidos a clientes",
    (item) => item.customerDiscountInCents ?? 0,
  );
  count("Número de vendas", (item) => item.salesCount);
  money("Valor médio por venda", (item) => item.averageTicketInCents);
  count("Clientes compradores", (item) => item.buyers);
  count("Novos compradores (primeira compra)", (item) => item.newBuyers);
  money("Vendas do período já pagas", (item) => item.payment.paidInCents);
  money("Vendas do período em aberto", (item) => item.payment.openInCents);
  money("Vendas do período em atraso", (item) => item.payment.overdueInCents);
  money(
    "Cancelamentos de vendas anteriores (fora do líquido)",
    (item) => item.cancelledPriorSalesInCents,
  );
  summary.getCell(
    `B${summary.addRow(["Variação das vendas líquidas (R$)", changeInCents / 100, null]).number}`,
  ).numFmt = currencyFormat;
  summary.getCell(
    `B${
      summary.addRow([
        "Variação das vendas líquidas (%)",
        changePercent === null ? "Sem base de comparação" : changePercent / 100,
        null,
      ]).number
    }`,
  ).numFmt = "0.0%";
  summary.addRow([
    "Clientes sem retorno",
    report.patientsWithoutReturn.length,
    null,
  ]);

  const sales = workbook.addWorksheet("Vendas");
  sales.columns = [
    { header: "Data movimento", key: "date", width: 22 },
    { header: "Movimento", key: "kind", width: 18 },
    { header: "Tipo", key: "type", width: 16 },
    { header: "Cliente", key: "patient", width: 28 },
    { header: "Item", key: "item", width: 36 },
    { header: "Quantidade", key: "quantity", width: 15 },
    { header: "Valor (R$)", key: "amount", width: 20 },
    { header: "Custo (R$)", key: "cost", width: 16 },
    { header: "Data da venda original", key: "saleDate", width: 24 },
    { header: "ID do movimento", key: "id", width: 45 },
    { header: "ID da origem", key: "sourceId", width: 40 },
    { header: "ID do cliente", key: "patientId", width: 40 },
    { header: "ID da conta", key: "receivableId", width: 40 },
  ];
  heading(sales);
  for (const item of report.sales) {
    const row = sales.addRow({
      date: new Date(item.occurredAt),
      kind: item.kind === "sale" ? "Venda" : "Cancelamento",
      type: typeLabels[item.sourceType],
      patient: item.patientName,
      item: item.itemName,
      quantity: item.quantity,
      amount: item.amountInCents / 100,
      cost: item.costInCents === undefined ? null : item.costInCents / 100,
      saleDate: item.saleOccurredAt ? new Date(item.saleOccurredAt) : null,
      id: item.id,
      sourceId: item.sourceId,
      patientId: item.patientId,
      receivableId: item.receivableId ?? "",
    });
    row.getCell(1).numFmt = dateFormat;
    row.getCell(7).numFmt = currencyFormat;
    row.getCell(8).numFmt = currencyFormat;
    row.getCell(9).numFmt = dateFormat;
  }

  const items = workbook.addWorksheet("Por item");
  items.columns = [
    { header: "Tipo", key: "type", width: 16 },
    { header: "Item", key: "item", width: 40 },
    { header: "Vendas", key: "sales", width: 10 },
    { header: "Quantidade", key: "quantity", width: 12 },
    { header: "Bruto (R$)", key: "gross", width: 16 },
    { header: "Cancelado (R$)", key: "cancelled", width: 16 },
    { header: "Desconto a clientes (R$)", key: "discount", width: 24 },
    { header: "Líquido (R$)", key: "net", width: 16 },
    { header: "Custo (R$)", key: "cost", width: 14 },
    { header: "Margem", key: "margin", width: 10 },
  ];
  heading(items);
  for (const item of current.byItem) {
    const row = items.addRow({
      type: typeLabels[item.sourceType],
      item: item.label,
      sales: item.salesCount,
      quantity: item.quantity,
      gross: item.grossInCents / 100,
      cancelled: item.cancelledInCents / 100,
      discount: item.customerDiscountInCents / 100,
      net: item.netInCents / 100,
      cost: item.costInCents === undefined ? null : item.costInCents / 100,
      margin:
        item.costInCents === undefined || item.netInCents <= 0
          ? null
          : (item.netInCents - item.costInCents) / item.netInCents,
    });
    for (const cell of [5, 6, 7, 8, 9])
      row.getCell(cell).numFmt = currencyFormat;
    row.getCell(10).numFmt = "0.0%";
  }

  const buyers = workbook.addWorksheet("Maiores compradores");
  buyers.columns = [
    { header: "Cliente", key: "patient", width: 30 },
    { header: "Vendas", key: "sales", width: 10 },
    { header: "Líquido (R$)", key: "net", width: 16 },
    { header: "Primeira compra no período", key: "first", width: 26 },
    { header: "ID do cliente", key: "id", width: 40 },
  ];
  heading(buyers);
  for (const item of current.topBuyers) {
    buyers
      .addRow({
        patient: item.patientName,
        sales: item.salesCount,
        net: item.netInCents / 100,
        first: item.firstPurchase ? "Sim" : "Não",
        id: item.patientId,
      })
      .getCell(3).numFmt = currencyFormat;
  }

  const withoutReturn = workbook.addWorksheet("Sem retorno");
  withoutReturn.columns = [
    { header: "Cliente", key: "patient", width: 30 },
    { header: "Último atendimento concluído", key: "last", width: 29 },
    { header: "Próximo agendamento", key: "next", width: 25 },
    { header: "ID do cliente", key: "id", width: 40 },
  ];
  heading(withoutReturn);
  for (const item of report.patientsWithoutReturn) {
    const row = withoutReturn.addRow({
      patient: item.patientName,
      last: new Date(item.lastCompletedAt),
      next: item.nextAppointmentAt ? new Date(item.nextAppointmentAt) : null,
      id: item.patientId,
    });
    row.getCell(2).numFmt = dateFormat;
    row.getCell(3).numFmt = dateFormat;
  }

  const definitions = workbook.addWorksheet("Definições");
  definitions.columns = [
    { header: "Indicador", key: "metric", width: 35 },
    { header: "Definição", key: "definition", width: 105 },
  ];
  heading(definitions);
  definitions.addRows([
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
  ]);

  const monthOnly = ["Mês anterior comparável", "Sem retorno"];
  for (let row = definitions.rowCount; row >= 2; row--) {
    const label = String(definitions.getCell(row, 1).value);
    if (isPeriod ? monthOnly.includes(label) : label === "Período anterior")
      definitions.spliceRows(row, 1);
  }
  if ("summary" in report) {
    definitions.addRow([
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
  }

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
