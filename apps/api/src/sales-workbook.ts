import ExcelJS from "exceljs";
import type { SalesReport } from "@crm/contracts";

const currencyFormat = '"R$" #,##0.00;[Red]("R$" #,##0.00)';
const dateFormat = "dd/mm/yyyy hh:mm";

function heading(sheet: ExcelJS.Worksheet) {
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

export async function salesReportToXlsx(report: SalesReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Movimenta CRM";
  workbook.created = new Date(report.generatedAt);

  const summary = workbook.addWorksheet("Resumo");
  summary.columns = [
    { header: "Indicador", key: "metric", width: 42 },
    { header: "Mês selecionado", key: "current", width: 24 },
    { header: "Mês anterior comparável", key: "previous", width: 28 },
  ];
  heading(summary);
  summary.addRow([
    "Período",
    `${report.current.from} a ${report.current.to}`,
    `${report.previousComparable.from} a ${report.previousComparable.to}`,
  ]);
  summary.addRow([
    "Vendas brutas",
    report.current.grossSalesInCents / 100,
    report.previousComparable.grossSalesInCents / 100,
  ]);
  summary.addRow([
    "Cancelamentos",
    report.current.cancelledSalesInCents / 100,
    report.previousComparable.cancelledSalesInCents / 100,
  ]);
  summary.addRow([
    "Vendas líquidas",
    report.current.netSalesInCents / 100,
    report.previousComparable.netSalesInCents / 100,
  ]);
  summary.addRow([
    "Recebido",
    report.current.receivedInCents / 100,
    report.previousComparable.receivedInCents / 100,
  ]);
  summary.addRow([
    "Pacientes atendidos",
    report.current.attendedPatients,
    report.previousComparable.attendedPatients,
  ]);
  summary.addRow(["Variação de vendas (R$)", report.changeInCents / 100, null]);
  summary.addRow([
    "Variação de vendas (%)",
    report.changePercent === null
      ? "Sem base anterior"
      : report.changePercent / 100,
    null,
  ]);
  summary.addRow([
    "Pacientes do mês anterior sem retorno",
    report.patientsWithoutReturn.length,
    null,
  ]);
  for (const rowNumber of [3, 4, 5, 6, 8]) {
    summary.getCell(`B${rowNumber}`).numFmt = currencyFormat;
    summary.getCell(`C${rowNumber}`).numFmt = currencyFormat;
  }
  summary.getCell("B9").numFmt = "0.0%";
  summary.getRow(5).font = { bold: true };

  const sales = workbook.addWorksheet("Vendas");
  sales.columns = [
    { header: "Data movimento", key: "date", width: 22 },
    { header: "Movimento", key: "kind", width: 18 },
    { header: "Tipo", key: "type", width: 16 },
    { header: "Paciente", key: "patient", width: 28 },
    { header: "Item", key: "item", width: 36 },
    { header: "Quantidade", key: "quantity", width: 15 },
    { header: "Valor (R$)", key: "amount", width: 20 },
    { header: "ID do movimento", key: "id", width: 45 },
    { header: "ID da origem", key: "sourceId", width: 40 },
    { header: "ID do paciente", key: "patientId", width: 40 },
    { header: "ID da conta", key: "receivableId", width: 40 },
  ];
  heading(sales);
  for (const item of report.sales) {
    const row = sales.addRow({
      date: new Date(item.occurredAt),
      kind: item.kind === "sale" ? "Venda" : "Cancelamento",
      type: item.sourceType === "plan" ? "Plano/serviço" : "Produto",
      patient: item.patientName,
      item: item.itemName,
      quantity: item.quantity,
      amount: item.amountInCents / 100,
      id: item.id,
      sourceId: item.sourceId,
      patientId: item.patientId,
      receivableId: item.receivableId ?? "",
    });
    row.getCell(1).numFmt = dateFormat;
    row.getCell(7).numFmt = currencyFormat;
  }

  const payments = workbook.addWorksheet("Recebimentos");
  payments.columns = [
    { header: "Data da baixa", key: "date", width: 22 },
    { header: "Movimento", key: "kind", width: 18 },
    { header: "Paciente", key: "patient", width: 28 },
    { header: "Descrição", key: "description", width: 36 },
    { header: "Valor (R$)", key: "amount", width: 20 },
    { header: "Forma de pagamento", key: "method", width: 22 },
    { header: "ID da conta", key: "receivableId", width: 40 },
    { header: "ID da origem", key: "sourceId", width: 40 },
    { header: "ID do paciente", key: "patientId", width: 40 },
  ];
  heading(payments);
  for (const item of report.payments) {
    const row = payments.addRow({
      date: new Date(item.occurredAt),
      kind: item.kind === "payment" ? "Pagamento" : "Estorno",
      patient: item.patientName,
      description: item.description,
      amount: item.amountInCents / 100,
      method: item.paymentMethod ?? "",
      receivableId: item.receivableId,
      sourceId: item.sourceId ?? "",
      patientId: item.patientId,
    });
    row.getCell(1).numFmt = dateFormat;
    row.getCell(5).numFmt = currencyFormat;
  }

  const withoutReturn = workbook.addWorksheet("Sem retorno");
  withoutReturn.columns = [
    { header: "Paciente", key: "patient", width: 30 },
    { header: "Último atendimento concluído", key: "last", width: 29 },
    { header: "Próximo agendamento", key: "next", width: 25 },
    { header: "ID do paciente", key: "id", width: 40 },
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
      "Valor dos planos criados e dos itens das comandas fechadas no período, pela data local do movimento.",
    ],
    [
      "Cancelamentos",
      "Valor negativo das parcelas abertas canceladas em planos e do valor total das comandas canceladas. O movimento aparece na data do cancelamento.",
    ],
    [
      "Vendas líquidas",
      "Vendas brutas menos cancelamentos. Uma venda pode ocorrer em mês diferente do pagamento.",
    ],
    [
      "Recebido",
      "Soma dos movimentos de pagamento e estorno no período, pela data local do evento. Um estorno posterior aparece no mês em que ocorreu.",
    ],
    [
      "Pacientes atendidos",
      "Número de pacientes distintos com pelo menos um atendimento concluído no período.",
    ],
    [
      "Mês anterior comparável",
      "Quando o mês atual está em andamento, o mês anterior é comparado somente até o mesmo dia; meses encerrados usam o mês anterior completo.",
    ],
    [
      "Sem retorno",
      "Pacientes com atendimento concluído em qualquer dia do mês anterior completo e nenhum atendimento concluído no mês selecionado até a data exibida.",
    ],
    ["Horário", "Datas interpretadas no fuso America/Sao_Paulo."],
    [
      "Fonte",
      "IDs nas abas de detalhe apontam para plano, comanda, conta e paciente no CRM.",
    ],
  ]);

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
