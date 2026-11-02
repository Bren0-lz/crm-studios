import {
  cashPaymentMethodLabels,
  clientDetailsColumnLabels,
  dreGroupLabels,
  financialEntryOriginLabels,
  type ClientDetailsColumn,
  type ClientDetailsReport,
  type DreReport,
  type FinancialEntry,
  type ManagementReport,
} from "@crm/contracts";
import {
  addTableSheet,
  createWorkbook,
  phoneColumns,
  sheetDate,
  workbookBuffer,
  type SheetCell,
  type SheetColumn,
  type SheetColumnKind,
} from "../../infrastructure/spreadsheet.js";

const money = (cents: number) => cents / 100;
/** Taxas do CRM vêm em % inteiro (0–100); a planilha usa fração com formato %. */
const rate = (percent: number) => percent / 100;

interface Indicator {
  section: string;
  label: string;
  kind: SheetColumnKind;
  value: SheetCell;
}

/** Relatório gerencial: resumo por indicador e uma aba por quebra. */
export async function managementReportToXlsx(
  report: ManagementReport,
): Promise<Buffer> {
  const workbook = createWorkbook(new Date(report.generatedAt));
  const { appointments, plans, finance, commercial, profitability } = report;
  const indicators: Indicator[] = [
    {
      section: "Período",
      label: "Início",
      kind: "date",
      value: sheetDate(report.from),
    },
    {
      section: "Período",
      label: "Fim",
      kind: "date",
      value: sheetDate(report.to),
    },
    {
      section: "Agenda",
      label: "Atendimentos",
      kind: "integer",
      value: appointments.total,
    },
    {
      section: "Agenda",
      label: "Concluídos",
      kind: "integer",
      value: appointments.completed,
    },
    {
      section: "Agenda",
      label: "Faltas",
      kind: "integer",
      value: appointments.noShows,
    },
    {
      section: "Agenda",
      label: "Cancelados",
      kind: "integer",
      value: appointments.cancelled,
    },
    {
      section: "Agenda",
      label: "Taxa de presença",
      kind: "percent",
      value: rate(appointments.attendanceRate),
    },
    {
      section: "Planos",
      label: "Planos ativos",
      kind: "integer",
      value: plans.active,
    },
    {
      section: "Planos",
      label: "Sessões disponíveis",
      kind: "integer",
      value: plans.availableSessions,
    },
    {
      section: "Planos",
      label: "Sessões consumidas no período",
      kind: "integer",
      value: plans.consumedInPeriod,
    },
    {
      section: "Financeiro",
      label: "Em aberto",
      kind: "currency",
      value: money(finance.openInCents),
    },
    {
      section: "Financeiro",
      label: "Em atraso",
      kind: "currency",
      value: money(finance.overdueInCents),
    },
    {
      section: "Comercial",
      label: "Leads criados",
      kind: "integer",
      value: commercial.leadsCreated,
    },
    {
      section: "Comercial",
      label: "Leads ganhos",
      kind: "integer",
      value: commercial.won,
    },
    {
      section: "Comercial",
      label: "Leads perdidos",
      kind: "integer",
      value: commercial.lost,
    },
    {
      section: "Comercial",
      label: "Taxa de conversão",
      kind: "percent",
      value: rate(commercial.conversionRate),
    },
    {
      section: "Comercial",
      label: "Tempo médio da primeira resposta (min)",
      kind: "integer",
      value: commercial.averageFirstResponseMinutes,
    },
  ];
  addTableSheet(
    workbook,
    "Resumo",
    [
      { header: "Seção", value: (item: Indicator) => item.section },
      { header: "Indicador", value: (item) => item.label },
      {
        header: "Valor",
        width: 20,
        kind: (item) => item.kind,
        value: (item) => item.value,
      },
    ],
    indicators,
  );

  type Breakdown = ManagementReport["byProfessional"][number];
  const attendanceColumns = (header: string): SheetColumn<Breakdown>[] => [
    { header, value: (item) => item.name },
    {
      header: "Atendimentos",
      kind: "integer",
      value: (item) => item.appointments,
    },
    { header: "Concluídos", kind: "integer", value: (item) => item.completed },
    { header: "Faltas", kind: "integer", value: (item) => item.noShows },
    {
      header: "Taxa de presença",
      kind: "percent",
      value: (item) => rate(item.attendanceRate),
    },
  ];
  addTableSheet(
    workbook,
    "Profissionais",
    attendanceColumns("Profissional"),
    report.byProfessional,
  );
  addTableSheet(
    workbook,
    "Serviços",
    attendanceColumns("Serviço"),
    report.byService,
  );
  addTableSheet(
    workbook,
    "Origens",
    [
      {
        header: "Origem",
        value: (item: ManagementReport["bySource"][number]) => item.source,
      },
      { header: "Leads", kind: "integer", value: (item) => item.leads },
      { header: "Ganhos", kind: "integer", value: (item) => item.won },
      { header: "Perdidos", kind: "integer", value: (item) => item.lost },
      {
        header: "Taxa de conversão",
        kind: "percent",
        value: (item) => rate(item.conversionRate),
      },
    ],
    report.bySource,
  );
  addTableSheet(
    workbook,
    "Rentabilidade serviços",
    [
      {
        header: "Serviço",
        value: (item: ManagementReport["profitability"]["byService"][number]) =>
          item.name,
      },
      {
        header: "Atendimentos concluídos",
        kind: "integer",
        value: (item) => item.completedAppointments,
      },
      {
        header: "Receita (R$)",
        kind: "currency",
        value: (item) => money(item.revenueInCents),
      },
      {
        header: "Comissões (R$)",
        kind: "currency",
        value: (item) => money(item.commissionsInCents),
      },
      {
        header: "Contribuição (R$)",
        kind: "currency",
        value: (item) => money(item.contributionInCents),
      },
      {
        header: "Margem de contribuição",
        kind: "percent",
        value: (item) => rate(item.contributionMargin),
      },
    ],
    profitability.byService,
  );
  return workbookBuffer(workbook);
}

/** Extrato financeiro com os filtros da tela; saídas com valor negativo. */
export async function financialEntriesToXlsx(
  entries: readonly FinancialEntry[],
  branchName: (entry: FinancialEntry) => string,
): Promise<Buffer> {
  const workbook = createWorkbook();
  addTableSheet(
    workbook,
    "Extrato",
    [
      {
        header: "Data",
        kind: "date",
        value: (entry: FinancialEntry) => sheetDate(entry.date),
      },
      {
        header: "Tipo",
        value: (entry) => (entry.direction === "in" ? "Entrada" : "Saída"),
      },
      { header: "Descrição", value: (entry) => entry.description },
      {
        header: "Cliente/fornecedor/profissional",
        value: (entry) => entry.counterpart ?? "",
      },
      {
        header: "Origem",
        value: (entry) => financialEntryOriginLabels[entry.origin],
      },
      { header: "Categoria", value: (entry) => entry.categoryName },
      {
        header: "Centro de custo",
        value: (entry) => entry.costCenterName ?? "",
      },
      { header: "Filial", value: (entry) => branchName(entry) },
      {
        header: "Forma de pagamento",
        value: (entry) => cashPaymentMethodLabels[entry.paymentMethod],
      },
      {
        header: "Valor (R$)",
        kind: "currency",
        value: (entry) =>
          ((entry.direction === "in" ? 1 : -1) * entry.amountInCents) / 100,
      },
      {
        header: "Desconto na baixa (R$)",
        kind: "currency",
        value: (entry) => money(entry.discountInCents ?? 0),
      },
    ],
    entries,
  );
  return workbookBuffer(workbook);
}

/** DRE por competência (uma linha por mês) e o total por categoria. */
export async function dreReportToXlsx(report: DreReport): Promise<Buffer> {
  const workbook = createWorkbook();
  type Month = DreReport["months"][number];
  addTableSheet(
    workbook,
    "DRE por competência",
    [
      { header: "Competência", value: (month: Month) => month.month },
      {
        header: "Receita de serviços (R$)",
        kind: "currency",
        value: (month) => money(month.serviceRevenueInCents),
      },
      {
        header: "Receita de produtos (R$)",
        kind: "currency",
        value: (month) => money(month.productRevenueInCents),
      },
      {
        header: "Outras receitas (R$)",
        kind: "currency",
        value: (month) => money(month.otherRevenueInCents),
      },
      {
        header: "Descontos concedidos a clientes (R$)",
        kind: "currency",
        value: (month) => money(month.customerDiscountInCents ?? 0),
      },
      {
        header: "Descontos na baixa (R$)",
        kind: "currency",
        value: (month) => money(month.settlementDiscountInCents ?? 0),
      },
      ...(Object.keys(dreGroupLabels) as (keyof typeof dreGroupLabels)[]).map(
        (group): SheetColumn<Month> => ({
          header: `${dreGroupLabels[group]} (R$)`,
          kind: "currency",
          value: (month) => money(month.expenses[group]),
        }),
      ),
      {
        header: "Resultado (R$)",
        kind: "currency",
        value: (month) => money(month.resultInCents),
      },
    ],
    report.months,
  );
  addTableSheet(
    workbook,
    "Categorias",
    [
      {
        header: "Categoria",
        value: (item: DreReport["categories"][number]) => item.name,
      },
      { header: "Grupo da DRE", value: (item) => dreGroupLabels[item.group] },
      {
        header: "Valor (R$)",
        kind: "currency",
        value: (item) => money(item.amountInCents),
      },
    ],
    report.categories,
  );
  return workbookBuffer(workbook);
}

const clientDetailsPhones = new Set<ClientDetailsColumn>([
  "phone",
  "guardianPhone",
]);
type ClientRow = ClientDetailsReport["rows"][number];

/** Consulta de clientes com as colunas escolhidas; telefones em DDD + número. */
export async function clientDetailsToXlsx(
  report: ClientDetailsReport,
): Promise<Buffer> {
  const workbook = createWorkbook();
  const columns = report.columns.flatMap((column): SheetColumn<ClientRow>[] => {
    const header = clientDetailsColumnLabels[column];
    if (clientDetailsPhones.has(column))
      return phoneColumns(header, (row) => String(row.values[column] ?? ""));
    const isDate = (value: unknown): value is string =>
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    return [
      {
        header,
        kind: (row) => {
          const value = row.values[column];
          if (isDate(value)) return "date";
          if (typeof value !== "number") return "text";
          return column === "attendanceRate" ? "percent" : "integer";
        },
        value: (row) => {
          const value = row.values[column];
          if (typeof value === "boolean") return value ? "Sim" : "Não";
          if (isDate(value)) return sheetDate(value);
          if (typeof value === "number")
            return column === "attendanceRate" ? rate(value) : value;
          return value ?? "";
        },
      },
    ];
  });
  addTableSheet(workbook, "Clientes", columns, report.rows);
  return workbookBuffer(workbook);
}
