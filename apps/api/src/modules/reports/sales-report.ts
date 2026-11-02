import type {
  Appointment,
  ContractedItem,
  PatientWithoutReturn,
  ReceivableStatus,
  SaleMovement,
  SalesBreakdownRow,
  SalesBuyer,
  SalesReport,
  SalesPeriodReport,
  SalesReportPeriod,
} from "@crm/contracts";
import { allocatePlanRevenue, salesChangePercent } from "@crm/contracts";

function clinicDate(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function monthLastDay(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, number!, 0)).getUTCDate();
}

function previousMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, number! - 2, 1)).toISOString().slice(0, 7);
}

/** Conta a receber de uma venda: plano pelo `planId`, comanda pela conta da comanda. */
export interface SaleReceivable {
  sourceId: string;
  status: ReceivableStatus;
  amountInCents: number;
  dueDate: string;
  /** Paga: desconto dado na baixa. */
  settlementDiscountInCents?: number;
}

/**
 * Desconto da venda de produtos (gravado na cobrança da comanda) rateado entre as linhas de
 * produto da comanda, proporcional ao valor de cada uma. Altera `sales` no lugar.
 */
export function withTabDiscounts(
  sales: SaleMovement[],
  discountByTab: ReadonlyMap<string, number>,
) {
  for (const [tabId, discount] of discountByTab) {
    if (discount <= 0) continue;
    const lines = sales.filter(
      (item) =>
        item.kind === "sale" &&
        item.sourceType === "product" &&
        item.sourceId === tabId,
    );
    const shares = allocatePlanRevenue(
      discount,
      lines.map((item) => ({ totalValueInCents: item.amountInCents })),
    );
    lines.forEach((item, index) => {
      const share = shares[index] ?? 0;
      if (share > 0) item.customerDiscountInCents = share;
    });
  }
  return sales;
}

/** Cobranças das vendas e primeira compra de cada cliente (para "novos compradores"). */
export interface SalesBilling {
  receivables: SaleReceivable[];
  /** Cliente → instante da primeira venda da história (planos e comandas). */
  firstSaleAt: ReadonlyMap<string, string>;
}

export const emptySalesBilling: SalesBilling = {
  receivables: [],
  firstSaleAt: new Map(),
};

const TOP_BUYERS = 10;
const typeLabels: Record<SaleMovement["sourceType"], string> = {
  plan: "Planos",
  service: "Serviços avulsos",
  product: "Produtos",
};

export function salesReportBounds(month: string, asOf = new Date()) {
  const today = clinicDate(asOf);
  const currentTo =
    month === today.slice(0, 7)
      ? today
      : `${month}-${String(monthLastDay(month)).padStart(2, "0")}`;
  const previous = previousMonth(month);
  const previousFullTo = `${previous}-${String(monthLastDay(previous)).padStart(2, "0")}`;
  const previousComparableTo = `${previous}-${String(Math.min(Number(currentTo.slice(8)), monthLastDay(previous))).padStart(2, "0")}`;
  return {
    currentFrom: `${month}-01`,
    currentTo,
    previousFrom: `${previous}-01`,
    previousFullTo,
    previousComparableTo,
    today,
  };
}

export function buildSalesReport(
  month: string,
  sales: SaleMovement[],
  billing: SalesBilling,
  allAppointments: Appointment[],
  asOf = new Date(),
): SalesReport {
  return buildReport(
    month,
    sales,
    billing,
    allAppointments,
    asOf,
    salesReportBounds(month, asOf),
  );
}

/** Dias civis, inclusivos; o intervalo de referência termina na véspera. */
export function salesPeriodBounds(from: string, to: string, asOf = new Date()) {
  const day = 86_400_000;
  const start = Date.parse(`${from}T00:00:00Z`);
  const duration = Date.parse(`${to}T00:00:00Z`) - start + day;
  return {
    currentFrom: from,
    currentTo: to,
    previousFrom: new Date(start - duration).toISOString().slice(0, 10),
    previousFullTo: new Date(start - day).toISOString().slice(0, 10),
    previousComparableTo: new Date(start - day).toISOString().slice(0, 10),
    today: clinicDate(asOf),
  };
}

export function buildSalesPeriodReport(
  from: string,
  to: string,
  sales: SaleMovement[],
  billing: SalesBilling,
  appointments: Appointment[],
  asOf = new Date(),
): SalesPeriodReport {
  const bounds = salesPeriodBounds(from, to, asOf);
  const data = buildReport(
    from.slice(0, 7),
    sales,
    billing,
    appointments,
    asOf,
    bounds,
  );
  const selected = (item: { occurredAt: string }) => {
    const date = clinicDate(item.occurredAt);
    return date >= from && date <= to;
  };
  return {
    from,
    to,
    generatedAt: data.generatedAt,
    summary: data.current,
    previous: data.previousComparable,
    changeInCents: data.changeInCents,
    changePercent: data.changePercent,
    sales: data.sales.filter(selected),
    patientsWithoutReturn: data.patientsWithoutReturn,
    returnReference: { from: bounds.previousFrom, to: bounds.previousFullTo },
  };
}

export type PatientContact = { phone: string; whatsapp?: string | undefined };

/** Completa a lista de clientes sem retorno com o telefone do cadastro. */
export function withPatientContacts<
  T extends { patientsWithoutReturn: PatientWithoutReturn[] },
>(report: T, contacts: ReadonlyMap<string, PatientContact>): T {
  return {
    ...report,
    patientsWithoutReturn: report.patientsWithoutReturn.map((item) => {
      const contact = contacts.get(item.patientId);
      return contact
        ? {
            ...item,
            phone: contact.phone,
            ...(contact.whatsapp ? { whatsapp: contact.whatsapp } : {}),
          }
        : item;
    }),
  };
}

/**
 * Completa a lista de clientes sem retorno com tudo o que cada um já contratou
 * (vendas de todo o histórico, inclusive as estornadas depois), sem repetir item.
 */
export function withContractedHistory<
  T extends { patientsWithoutReturn: PatientWithoutReturn[] },
>(report: T, sales: SaleMovement[]): T {
  const byPatient = new Map<string, Map<string, ContractedItem>>();
  for (const item of sales) {
    if (item.kind !== "sale") continue;
    const items = byPatient.get(item.patientId) ?? new Map();
    items.set(`${item.sourceType}:${item.itemName}`, {
      sourceType: item.sourceType,
      itemName: item.itemName,
    });
    byPatient.set(item.patientId, items);
  }
  return {
    ...report,
    patientsWithoutReturn: report.patientsWithoutReturn.map((item) => ({
      ...item,
      contracted: [...(byPatient.get(item.patientId)?.values() ?? [])].sort(
        (a, b) => a.itemName.localeCompare(b.itemName, "pt-BR"),
      ),
    })),
  };
}

/** Compras do cliente (vendas e estornos), mais recentes primeiro. */
export function patientSalesHistory(sales: SaleMovement[], patientId: string) {
  return sales
    .filter((item) => item.patientId === patientId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function buildReport(
  month: string,
  sales: SaleMovement[],
  billing: SalesBilling,
  allAppointments: Appointment[],
  asOf: Date,
  bounds: ReturnType<typeof salesReportBounds>,
): SalesReport {
  // Atendimentos de lead (sem cliente) ficam fora de vendas e de retorno.
  const appointments = allAppointments.filter(
    (item): item is Appointment & { patientId: string } =>
      item.patientId !== undefined,
  );
  const inRange = (occurredAt: string, from: string, to: string) => {
    const date = clinicDate(occurredAt);
    return date >= from && date <= to;
  };
  const period = (from: string, to: string): SalesReportPeriod =>
    salesPeriodSummary(from, to, sales, billing, bounds.today);
  const current = period(bounds.currentFrom, bounds.currentTo);
  const previousComparable = period(
    bounds.previousFrom,
    bounds.previousComparableTo,
  );
  const previousAppointments = appointments.filter(
    (item) =>
      item.status === "completed" &&
      inRange(item.startsAt, bounds.previousFrom, bounds.previousFullTo),
  );
  const currentPatientIds = new Set(
    appointments
      .filter(
        (item) =>
          item.status === "completed" &&
          inRange(item.startsAt, bounds.currentFrom, bounds.currentTo),
      )
      .map((item) => item.patientId),
  );
  const lastByPatient = new Map<string, (typeof appointments)[number]>();
  for (const item of previousAppointments) {
    const last = lastByPatient.get(item.patientId);
    if (!last || item.startsAt > last.startsAt)
      lastByPatient.set(item.patientId, item);
  }
  const patientsWithoutReturn: PatientWithoutReturn[] = [
    ...lastByPatient.values(),
  ]
    .filter((item) => !currentPatientIds.has(item.patientId))
    .map((item) => {
      const next = appointments
        .filter(
          (candidate) =>
            candidate.patientId === item.patientId &&
            ["scheduled", "confirmed"].includes(candidate.status) &&
            clinicDate(candidate.startsAt) >= bounds.today,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      return {
        patientId: item.patientId,
        patientName: item.patientName,
        lastCompletedAt: item.startsAt,
        ...(next ? { nextAppointmentAt: next.startsAt } : {}),
      };
    })
    .sort((a, b) => b.lastCompletedAt.localeCompare(a.lastCompletedAt));
  const changeInCents =
    current.netSalesInCents - previousComparable.netSalesInCents;
  return {
    month,
    generatedAt: asOf.toISOString(),
    current,
    previousComparable,
    changeInCents,
    changePercent: salesChangePercent(
      current.netSalesInCents,
      previousComparable.netSalesInCents,
    ),
    sales: sales
      .filter((item) =>
        inRange(item.occurredAt, bounds.previousFrom, bounds.currentTo),
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    patientsWithoutReturn,
  };
}

/** Id da linha vendida, comum à venda e ao cancelamento (`<id>:sale` / `<id>:cancellation`). */
const lineId = (item: SaleMovement) =>
  item.id.replace(/:(sale|cancellation)$/, "");

/**
 * Vendas de `from` a `to` (datas da clínica, inclusivas). Cancelamento de venda feita no
 * período abate o líquido; o de venda anterior fica à parte, para o líquido não misturar
 * períodos.
 */
export function salesPeriodSummary(
  from: string,
  to: string,
  movements: SaleMovement[],
  billing: SalesBilling,
  today: string,
): SalesReportPeriod {
  const inRange = (value: string) => {
    const date = clinicDate(value);
    return date >= from && date <= to;
  };
  const sold = movements.filter(
    (item) => item.kind === "sale" && inRange(item.occurredAt),
  );
  const cancellations = movements.filter(
    (item) => item.kind === "cancellation" && inRange(item.occurredAt),
  );
  const ownCancellation = (item: SaleMovement) =>
    item.saleOccurredAt !== undefined && inRange(item.saleOccurredAt);
  const cancelledLine = new Map<string, number>();
  for (const item of cancellations.filter(ownCancellation))
    cancelledLine.set(lineId(item), -item.amountInCents);
  const sum = (items: SaleMovement[]) =>
    items.reduce((total, item) => total + item.amountInCents, 0);
  // Cancelamentos vêm negativos; os totais são positivos.
  const cancelledSum = (items: SaleMovement[]) =>
    items.reduce((total, item) => total - item.amountInCents, 0);

  const grossSalesInCents = sum(sold);
  const cancelledInPeriodSalesInCents = cancelledSum(
    cancellations.filter(ownCancellation),
  );
  const cancelledPriorSalesInCents = cancelledSum(
    cancellations.filter((item) => !ownCancellation(item)),
  );
  const customerDiscountInCents = sold.reduce(
    (total, item) => total + (item.customerDiscountInCents ?? 0),
    0,
  );
  const sourceKey = (item: SaleMovement) =>
    `${item.sourceType === "plan" ? "plan" : "tab"}:${item.sourceId}`;
  const sources = new Set(sold.map(sourceKey));

  const breakdown = (
    key: (item: SaleMovement) => string,
    label: (item: SaleMovement) => string,
  ) => {
    const rows = new Map<
      string,
      SalesBreakdownRow & { sources: Set<string> }
    >();
    for (const item of sold) {
      const id = key(item);
      const row = rows.get(id) ?? {
        key: id,
        label: label(item),
        sourceType: item.sourceType,
        salesCount: 0,
        quantity: 0,
        grossInCents: 0,
        cancelledInCents: 0,
        customerDiscountInCents: 0,
        netInCents: 0,
        ...(item.sourceType === "product" ? { costInCents: 0 } : {}),
        sources: new Set<string>(),
      };
      const cancelled = cancelledLine.get(lineId(item)) ?? 0;
      row.sources.add(sourceKey(item));
      row.quantity += item.quantity;
      row.grossInCents += item.amountInCents;
      row.cancelledInCents += cancelled;
      row.customerDiscountInCents += item.customerDiscountInCents ?? 0;
      row.netInCents += item.amountInCents - cancelled;
      if (row.costInCents !== undefined && !cancelled)
        row.costInCents += item.costInCents ?? 0;
      rows.set(id, row);
    }
    return [...rows.values()]
      .map(({ sources: lineSources, ...row }) => ({
        ...row,
        salesCount: lineSources.size,
      }))
      .sort(
        (a, b) =>
          b.netInCents - a.netInCents ||
          a.label.localeCompare(b.label, "pt-BR"),
      );
  };

  const buyers = new Map<string, SalesBuyer & { sources: Set<string> }>();
  for (const item of sold) {
    const buyer = buyers.get(item.patientId) ?? {
      patientId: item.patientId,
      patientName: item.patientName,
      salesCount: 0,
      netInCents: 0,
      firstPurchase:
        clinicDate(
          billing.firstSaleAt.get(item.patientId) ?? item.occurredAt,
        ) >= from,
      sources: new Set<string>(),
    };
    buyer.sources.add(sourceKey(item));
    buyer.netInCents +=
      item.amountInCents - (cancelledLine.get(lineId(item)) ?? 0);
    buyers.set(item.patientId, buyer);
  }
  const buyerList = [...buyers.values()].map(
    ({ sources: buyerSources, ...buyer }) => ({
      ...buyer,
      salesCount: buyerSources.size,
    }),
  );

  const soldSources = new Set(sold.map((item) => item.sourceId));
  const payment = { paidInCents: 0, openInCents: 0, overdueInCents: 0 };
  let settlementDiscountInCents = 0;
  for (const item of billing.receivables) {
    if (!soldSources.has(item.sourceId) || item.status === "cancelled")
      continue;
    if (item.status === "paid") {
      payment.paidInCents += item.amountInCents;
      settlementDiscountInCents += item.settlementDiscountInCents ?? 0;
    } else {
      payment.openInCents += item.amountInCents;
      if (item.dueDate < today) payment.overdueInCents += item.amountInCents;
    }
  }

  return {
    from,
    to,
    grossSalesInCents,
    cancelledSalesInCents:
      cancelledInPeriodSalesInCents + cancelledPriorSalesInCents,
    cancelledInPeriodSalesInCents,
    cancelledPriorSalesInCents,
    netSalesInCents: grossSalesInCents - cancelledInPeriodSalesInCents,
    salesCount: sources.size,
    averageTicketInCents: sources.size
      ? Math.round(grossSalesInCents / sources.size)
      : 0,
    buyers: buyerList.length,
    newBuyers: buyerList.filter((item) => item.firstPurchase).length,
    byType: breakdown(
      (item) => item.sourceType,
      (item) => typeLabels[item.sourceType],
    ),
    byItem: breakdown(
      (item) => `${item.sourceType}:${item.itemName}`,
      (item) => item.itemName,
    ),
    topBuyers: buyerList
      .sort(
        (a, b) =>
          b.netInCents - a.netInCents ||
          a.patientName.localeCompare(b.patientName, "pt-BR"),
      )
      .slice(0, TOP_BUYERS),
    payment,
    ...(customerDiscountInCents ? { customerDiscountInCents } : {}),
    ...(settlementDiscountInCents ? { settlementDiscountInCents } : {}),
  };
}
