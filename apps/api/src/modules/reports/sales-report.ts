import type {
  Appointment,
  ContractedItem,
  PatientWithoutReturn,
  ReceivedPayment,
  SaleMovement,
  SalesReport,
  SalesPeriodReport,
  SalesReportPeriod,
} from "@crm/contracts";
import { salesChangePercent } from "@crm/contracts";

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
  payments: ReceivedPayment[],
  allAppointments: Appointment[],
  asOf = new Date(),
): SalesReport {
  return buildReport(
    month,
    sales,
    payments,
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
  payments: ReceivedPayment[],
  appointments: Appointment[],
  asOf = new Date(),
): SalesPeriodReport {
  const bounds = salesPeriodBounds(from, to, asOf);
  const data = buildReport(
    from.slice(0, 7),
    sales,
    payments,
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
    sales: data.sales.filter(selected),
    payments: data.payments.filter(selected),
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
  payments: ReceivedPayment[],
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
  const period = (from: string, to: string): SalesReportPeriod => {
    const movements = sales.filter((item) =>
      inRange(item.occurredAt, from, to),
    );
    const attended = new Set(
      appointments
        .filter(
          (item) =>
            item.status === "completed" && inRange(item.startsAt, from, to),
        )
        .map((item) => item.patientId),
    );
    const grossSalesInCents = movements
      .filter((item) => item.kind === "sale")
      .reduce((sum, item) => sum + item.amountInCents, 0);
    const cancelledSalesInCents = -movements
      .filter((item) => item.kind === "cancellation")
      .reduce((sum, item) => sum + item.amountInCents, 0);
    return {
      from,
      to,
      grossSalesInCents,
      cancelledSalesInCents,
      netSalesInCents: grossSalesInCents - cancelledSalesInCents,
      receivedInCents: payments
        .filter((item) => inRange(item.occurredAt, from, to))
        .reduce((sum, item) => sum + item.amountInCents, 0),
      attendedPatients: attended.size,
    };
  };
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
    payments: payments
      .filter((item) =>
        inRange(item.occurredAt, bounds.previousFrom, bounds.currentTo),
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    patientsWithoutReturn,
  };
}
