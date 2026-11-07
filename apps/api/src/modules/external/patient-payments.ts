import {
  type ExternalPatientPayment,
  type ExternalPatientPayments,
  type ExternalPatientPaymentsQuery,
  type ExternalPaymentEvent,
  type ExternalPaymentLine,
  type ExternalPaymentOrigin,
  type ExternalPaymentStatus,
  type PatientTab,
  type ReceivedPayment,
  type Receivable,
  type Service,
  type ServiceBusinessLine,
  type ServiceLineRef,
} from "@crm/contracts";
import { clinicDateOf } from "../finance/daily-cash.js";

/** Evento de baixa/estorno com o saldo que a baixa parcial gerou. */
export type PaymentEventSource = ReceivedPayment;

interface PaymentSources {
  /** Cobranças do cliente (as do resumo financeiro, já na filial da leitura). */
  receivables: readonly Receivable[];
  /** Baixas e estornos dessas cobranças, em ordem cronológica. */
  events: readonly PaymentEventSource[];
  /** Comandas por cobrança (`PatientTab.receivableId`). */
  tabs: ReadonlyMap<string, PatientTab>;
  productLines: ReadonlyMap<string, ServiceBusinessLine | null>;
  services: ReadonlyMap<string, Service>;
  today: string;
  timeZone: string;
}

interface Origin {
  origin: ExternalPaymentOrigin;
  sourceId?: string;
  services: ServiceLineRef[];
  productLines: (ServiceBusinessLine | null)[];
}

const event = (item: PaymentEventSource): ExternalPaymentEvent => ({
  id: item.id,
  occurredAt: item.occurredAt,
  amountInCents: Math.abs(item.amountInCents),
  ...(item.paymentMethod ? { paymentMethod: item.paymentMethod } : {}),
  ...(item.kind === "payment" && item.discountInCents
    ? { discountInCents: item.discountInCents }
    : {}),
});

/**
 * Histórico de pagamentos do cliente: uma linha por cobrança, com a origem (plano, comanda,
 * venda de produto ou lançamento manual), a situação, as baixas e os estornos. A baixa parcial
 * gera outra cobrança (o saldo), ligada pela baixa (`balanceReceivableId`): o saldo herda a
 * origem, os serviços e os produtos da cobrança de origem.
 */
export function patientPayments(
  patient: { id: string; fullName: string },
  sources: PaymentSources,
  query: ExternalPatientPaymentsQuery,
): ExternalPatientPayments {
  const byId = new Map(sources.receivables.map((item) => [item.id, item]));
  const eventsOf = new Map<string, PaymentEventSource[]>();
  /** Saldo → cobrança de origem; origem → saldo da baixa em vigor. */
  const balanceOf = new Map<string, string>();
  const balanceFor = new Map<string, string>();
  for (const item of sources.events) {
    const list = eventsOf.get(item.receivableId) ?? [];
    list.push(item);
    eventsOf.set(item.receivableId, list);
    if (item.kind === "payment" && item.balanceReceivableId) {
      balanceOf.set(item.balanceReceivableId, item.receivableId);
      balanceFor.set(item.receivableId, item.balanceReceivableId);
    }
  }

  const serviceRef = (service: { id: string; name: string }) => {
    const registered = sources.services.get(service.id);
    return {
      id: service.id,
      name: registered?.name ?? service.name,
      businessLine: registered?.businessLine ?? null,
    };
  };
  const ownOrigin = (receivable: Receivable): Origin => {
    const tab = sources.tabs.get(receivable.id);
    const services = (receivable.services ?? []).map(serviceRef);
    if (receivable.source === "plan" || receivable.planId)
      return {
        origin: "plan",
        ...(receivable.planId ? { sourceId: receivable.planId } : {}),
        services,
        productLines: [],
      };
    if (tab) {
      const productLines = [
        ...new Set(
          tab.items.map(
            (item) => sources.productLines.get(item.productId) ?? null,
          ),
        ),
      ];
      return {
        // Comanda só com produtos é uma venda de produto.
        origin: services.length || !tab.items.length ? "tab" : "sale",
        sourceId: tab.id,
        services,
        productLines,
      };
    }
    return { origin: "manual", services, productLines: [] };
  };
  const origins = new Map<string, Origin>();
  const originOf = (
    receivable: Receivable,
    seen = new Set<string>(),
  ): Origin => {
    const cached = origins.get(receivable.id);
    if (cached) return cached;
    const own = ownOrigin(receivable);
    const parent = byId.get(balanceOf.get(receivable.id) ?? "");
    seen.add(receivable.id);
    const result: Origin =
      own.origin === "manual" && parent && !seen.has(parent.id)
        ? originOf(parent, seen)
        : own;
    origins.set(receivable.id, result);
    return result;
  };
  /** Saldo ainda devido na cadeia de saldos da baixa parcial. */
  const owesBalance = (
    receivableId: string,
    seen = new Set<string>(),
  ): boolean => {
    if (seen.has(receivableId)) return false;
    seen.add(receivableId);
    const balance = byId.get(receivableId);
    if (!balance) return false;
    if (balance.status === "open") return true;
    const next = balance.status === "paid" && balanceFor.get(balance.id);
    return next ? owesBalance(next, seen) : false;
  };

  const rows = sources.receivables.map((receivable): ExternalPatientPayment => {
    const events = eventsOf.get(receivable.id) ?? [];
    const payments = events.filter((item) => item.kind === "payment");
    const reversals = events.filter((item) => item.kind === "reversal");
    const paid = receivable.status === "paid";
    const balance = paid ? balanceFor.get(receivable.id) : undefined;
    const status: ExternalPaymentStatus =
      receivable.status === "cancelled"
        ? "cancelled"
        : paid
          ? balance && owesBalance(balance)
            ? "partially_paid"
            : "paid"
          : receivable.dueDate < sources.today
            ? "overdue"
            : "open";
    const origin = originOf(receivable);
    const parent = balanceOf.get(receivable.id);
    return {
      id: receivable.id,
      ...(receivable.branchId ? { branchId: receivable.branchId } : {}),
      origin: origin.origin,
      ...(origin.sourceId ? { sourceId: origin.sourceId } : {}),
      description: receivable.description,
      installmentNumber:
        receivable.balanceOfInstallment ?? receivable.installmentNumber,
      installmentCount: receivable.installmentCount,
      dueDate: receivable.dueDate,
      amountInCents: receivable.amountInCents,
      discountInCents:
        (receivable.customerDiscountInCents ?? 0) +
        (paid ? (receivable.settlementDiscountInCents ?? 0) : 0),
      status,
      reversed: reversals.length > 0,
      paidInCents:
        payments.reduce((total, item) => total + item.amountInCents, 0) -
        reversals.reduce(
          (total, item) => total + Math.abs(item.amountInCents),
          0,
        ),
      ...(paid && receivable.paidAt ? { paidAt: receivable.paidAt } : {}),
      ...(paid && receivable.paymentMethod
        ? { paymentMethod: receivable.paymentMethod }
        : {}),
      ...(balance ? { balanceReceivableId: balance } : {}),
      ...(parent && byId.has(parent) ? { balanceOfReceivableId: parent } : {}),
      payments: payments.map(event),
      reversals: reversals.map(event),
      services: origin.services,
      productLines: origin.productLines,
    };
  });

  const lineOf = (line: ServiceBusinessLine | null): ExternalPaymentLine =>
    line ?? "other";
  const paidDates = new Map(
    [...eventsOf].map(([id, list]) => [
      id,
      list
        .filter((item) => item.kind === "payment")
        .map((item) => clinicDateOf(item.occurredAt, sources.timeZone)),
    ]),
  );
  const inPeriod = (date: string) =>
    (!query.from || date >= query.from) && (!query.to || date <= query.to);
  const filtered = rows.filter((row) => {
    if (
      query.status.length &&
      !query.status.some((item) =>
        item === "reversed" ? row.reversed : item === row.status,
      )
    )
      return false;
    if (query.origin.length && !query.origin.includes(row.origin)) return false;
    if (
      query.serviceId.length &&
      !row.services.some((service) => query.serviceId.includes(service.id))
    )
      return false;
    if (query.businessLine.length) {
      const lines = [
        ...row.services.map((service) => lineOf(service.businessLine)),
        ...row.productLines.map(lineOf),
      ];
      if (!query.businessLine.some((line) => lines.includes(line)))
        return false;
    }
    if (query.from || query.to) {
      if (query.dateField === "due") return inPeriod(row.dueDate);
      return (paidDates.get(row.id) ?? []).some(inPeriod);
    }
    return true;
  });
  const createdAt = new Map(
    sources.receivables.map((item) => [item.id, item.createdAt]),
  );
  filtered.sort(
    (left, right) =>
      right.dueDate.localeCompare(left.dueDate) ||
      (createdAt.get(right.id) ?? "").localeCompare(
        createdAt.get(left.id) ?? "",
      ) ||
      right.installmentNumber - left.installmentNumber ||
      left.id.localeCompare(right.id),
  );
  const sum = (pick: (row: ExternalPatientPayment) => number) =>
    filtered.reduce((total, row) => total + pick(row), 0);
  return {
    patientId: patient.id,
    patientName: patient.fullName,
    referenceDate: sources.today,
    totals: {
      count: filtered.length,
      amountInCents: sum((row) => row.amountInCents),
      paidInCents: sum((row) => row.paidInCents),
      openInCents: sum((row) =>
        row.status === "open" || row.status === "overdue"
          ? row.amountInCents
          : 0,
      ),
      overdueInCents: sum((row) =>
        row.status === "overdue" ? row.amountInCents : 0,
      ),
    },
    payments: filtered,
  };
}
