import {
  salesChangePercent,
  type SalesReport,
  type SalesPeriodReport,
} from "@crm/contracts";
import {
  addTableSheet,
  createWorkbook,
  sheetDateTime,
  workbookBuffer,
  type SheetCell,
  type SheetColumnKind,
} from "../../infrastructure/spreadsheet.js";

type PaymentMovement = SalesReport["payments"][number];
type SaleMovement = SalesReport["sales"][number];
type WithoutReturn = SalesReport["patientsWithoutReturn"][number];

interface SummaryLine {
  label: string;
  kind: SheetColumnKind;
  current: SheetCell;
  previous?: SheetCell;
}

const money = (cents: number) => cents / 100;

export async function salesReportToXlsx(
  report: SalesReport | SalesPeriodReport,
): Promise<Buffer> {
  const workbook = createWorkbook(new Date(report.generatedAt));

  if ("summary" in report) {
    const lines: SummaryLine[] = [
      {
        label: "Período",
        kind: "text",
        current: `${report.from} a ${report.to}`,
      },
      {
        label: "Vendas brutas",
        kind: "currency",
        current: money(report.summary.grossSalesInCents),
      },
      {
        label: "Cancelamentos",
        kind: "currency",
        current: money(report.summary.cancelledSalesInCents),
      },
      {
        label: "Vendas líquidas",
        kind: "currency",
        current: money(report.summary.netSalesInCents),
      },
      {
        label: "Recebido",
        kind: "currency",
        current: money(report.summary.receivedInCents),
      },
      {
        label: "Clientes atendidos",
        kind: "integer",
        current: report.summary.attendedPatients,
      },
      {
        label: "Clientes sem retorno",
        kind: "integer",
        current: report.patientsWithoutReturn.length,
      },
      {
        label: "Descontos concedidos a clientes",
        kind: "currency",
        current: money(report.summary.customerDiscountInCents ?? 0),
      },
    ];
    addTableSheet(
      workbook,
      "Resumo",
      [
        {
          header: "Indicador",
          width: 42,
          value: (line: SummaryLine) => line.label,
        },
        {
          header: "Período selecionado",
          width: 30,
          kind: (line) => line.kind,
          value: (line) => line.current,
        },
      ],
      lines,
    );
  } else {
    const changePercent = salesChangePercent(
      report.current.netSalesInCents,
      report.previousComparable.netSalesInCents,
    );
    const { current, previousComparable: previous } = report;
    const lines: SummaryLine[] = [
      {
        label: "Período",
        kind: "text",
        current: `${current.from} a ${current.to}`,
        previous: `${previous.from} a ${previous.to}`,
      },
      {
        label: "Vendas brutas",
        kind: "currency",
        current: money(current.grossSalesInCents),
        previous: money(previous.grossSalesInCents),
      },
      {
        label: "Cancelamentos",
        kind: "currency",
        current: money(current.cancelledSalesInCents),
        previous: money(previous.cancelledSalesInCents),
      },
      {
        label: "Vendas líquidas",
        kind: "currency",
        current: money(current.netSalesInCents),
        previous: money(previous.netSalesInCents),
      },
      {
        label: "Recebido",
        kind: "currency",
        current: money(current.receivedInCents),
        previous: money(previous.receivedInCents),
      },
      {
        label: "Clientes atendidos",
        kind: "integer",
        current: current.attendedPatients,
        previous: previous.attendedPatients,
      },
      {
        label: "Variação de vendas (R$)",
        kind: "currency",
        current: money(report.changeInCents),
      },
      changePercent === null
        ? {
            label: "Variação de vendas (%)",
            kind: "text",
            current: "Sem base de comparação",
          }
        : {
            label: "Variação de vendas (%)",
            kind: "percent",
            current: changePercent / 100,
          },
      {
        label: "Clientes do mês anterior sem retorno",
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
          width: 42,
          value: (line: SummaryLine) => line.label,
        },
        {
          header: "Mês selecionado",
          width: 24,
          kind: (line) => line.kind,
          value: (line) => line.current,
        },
        {
          header: "Mês anterior comparável",
          width: 28,
          kind: (line) => line.kind,
          value: (line) => line.previous,
        },
      ],
      lines,
    );
    summary.getRow(5).font = { bold: true };
  }

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
      {
        header: "Tipo",
        value: (item) =>
          item.sourceType === "product" ? "Produto" : "Plano/serviço",
      },
      { header: "Cliente", value: (item) => item.patientName },
      { header: "Item", value: (item) => item.itemName },
      { header: "Quantidade", kind: "decimal", value: (item) => item.quantity },
      {
        header: "Valor (R$)",
        kind: "currency",
        value: (item) => money(item.amountInCents),
      },
      { header: "ID do movimento", value: (item) => item.id },
      { header: "ID da origem", value: (item) => item.sourceId },
      { header: "ID do cliente", value: (item) => item.patientId },
      { header: "ID da conta", value: (item) => item.receivableId ?? "" },
    ],
    report.sales,
  );

  addTableSheet(
    workbook,
    "Recebimentos",
    [
      {
        header: "Data da baixa",
        kind: "datetime",
        value: (item: PaymentMovement) => sheetDateTime(item.occurredAt),
      },
      {
        header: "Movimento",
        value: (item) => (item.kind === "payment" ? "Pagamento" : "Estorno"),
      },
      { header: "Cliente", value: (item) => item.patientName },
      { header: "Descrição", value: (item) => item.description },
      {
        header: "Valor (R$)",
        kind: "currency",
        value: (item) => money(item.amountInCents),
      },
      {
        header: "Forma de pagamento",
        value: (item) => item.paymentMethod ?? "",
      },
      { header: "ID da conta", value: (item) => item.receivableId },
      { header: "ID da origem", value: (item) => item.sourceId ?? "" },
      { header: "ID do cliente", value: (item) => item.patientId },
    ],
    report.payments,
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
      "Clientes atendidos",
      "Número de clientes distintos com pelo menos um atendimento concluído no período.",
    ],
    [
      "Mês anterior comparável",
      "Quando o mês atual está em andamento, o mês anterior é comparado somente até o mesmo dia; meses encerrados usam o mês anterior completo.",
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
  if ("summary" in report)
    definitions = [
      ...definitions.filter(
        ([label]) =>
          label !== "Mês anterior comparável" && label !== "Sem retorno",
      ),
      [
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
      ],
    ];
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
