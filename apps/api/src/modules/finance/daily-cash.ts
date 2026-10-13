import {
  paymentMethodSchema,
  type CommissionEntry,
  type DailyCash,
  type DailyCashMethodTotal,
  type DailyCashMovement,
  type DailyCashPaymentMethod,
  type Payable,
  type ReceivedPayment,
} from "@crm/contracts";

export const DEFAULT_CLINIC_TIMEZONE = "America/Sao_Paulo";

export interface DailyCashSources {
  /** Eventos de recebimento (`payment`) e estorno (`reversal`, valor negativo). */
  receipts: ReceivedPayment[];
  /** Contas a pagar; entram as pagas, pela data de `paidAt`. */
  payables: Payable[];
  /** Comissões; entram as pagas, pela data de `paidAt`. */
  commissions: CommissionEntry[];
}

/** Data (aaaa-mm-dd) de um instante no fuso informado. */
export function clinicDateOf(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

const methodOrder: DailyCashPaymentMethod[] = [
  ...paymentMethodSchema.options,
  "unspecified",
];

/**
 * Forma de pagamento do estorno: a do pagamento mais recente do mesmo
 * recebível até o estorno (o estorno em si não registra forma).
 */
function reversalMethod(
  reversal: ReceivedPayment,
  receipts: ReceivedPayment[],
): DailyCashPaymentMethod {
  if (reversal.paymentMethod) return reversal.paymentMethod;
  const original = receipts
    .filter(
      (item) =>
        item.kind === "payment" &&
        item.receivableId === reversal.receivableId &&
        item.paymentMethod &&
        Date.parse(item.occurredAt) <= Date.parse(reversal.occurredAt),
    )
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
  return original?.paymentMethod ?? "unspecified";
}

/**
 * Caixa do dia: entradas (recebimentos e estornos, com sinal) e saídas
 * (contas pagas e comissões pagas) cuja data do evento, no fuso da clínica,
 * é `date`. Os dados podem vir de qualquer período; o filtro é feito aqui.
 */
export function buildDailyCash(
  date: string,
  sources: DailyCashSources,
  timeZone: string = DEFAULT_CLINIC_TIMEZONE,
  generatedAt: Date = new Date(),
): DailyCash {
  const onDate = (value: string | undefined) =>
    value !== undefined && clinicDateOf(value, timeZone) === date;
  const movements: DailyCashMovement[] = [];

  for (const item of sources.receipts) {
    if (!onDate(item.occurredAt)) continue;
    const reversal = item.kind === "reversal";
    movements.push({
      id: `${reversal ? "receipt_reversal" : "receipt"}:${item.id}`,
      kind: reversal ? "receipt_reversal" : "receipt",
      direction: "in",
      occurredAt: item.occurredAt,
      description: item.description,
      counterpart: item.patientName,
      paymentMethod: reversal
        ? reversalMethod(item, sources.receipts)
        : (item.paymentMethod ?? "unspecified"),
      amountInCents: reversal
        ? -Math.abs(item.amountInCents)
        : item.amountInCents,
    });
  }
  for (const item of sources.payables) {
    if (item.status !== "paid" || !onDate(item.paidAt)) continue;
    movements.push({
      id: `payable:${item.id}`,
      kind: "payable",
      direction: "out",
      occurredAt: item.paidAt!,
      description: item.description,
      ...(item.supplier ? { counterpart: item.supplier } : {}),
      paymentMethod: item.paymentMethod ?? "unspecified",
      amountInCents: item.amountInCents,
    });
  }
  for (const item of sources.commissions) {
    if (item.status !== "paid" || !onDate(item.paidAt)) continue;
    movements.push({
      id: `commission:${item.id}`,
      kind: "commission",
      direction: "out",
      occurredAt: item.paidAt!,
      description: `Comissão ${item.competence}`,
      counterpart: item.professionalName,
      // A baixa de comissão não registra forma de pagamento.
      paymentMethod: "unspecified",
      amountInCents: item.amountInCents,
    });
  }
  movements.sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      a.id.localeCompare(b.id),
  );

  const totals = new Map<DailyCashPaymentMethod, DailyCashMethodTotal>();
  for (const movement of movements) {
    const total = totals.get(movement.paymentMethod) ?? {
      paymentMethod: movement.paymentMethod,
      inflowInCents: 0,
      outflowInCents: 0,
      balanceInCents: 0,
    };
    if (movement.direction === "in") {
      total.inflowInCents += movement.amountInCents;
      total.balanceInCents += movement.amountInCents;
    } else {
      total.outflowInCents += movement.amountInCents;
      total.balanceInCents -= movement.amountInCents;
    }
    totals.set(movement.paymentMethod, total);
  }
  const byPaymentMethod = methodOrder
    .map((method) => totals.get(method))
    .filter((item): item is DailyCashMethodTotal => item !== undefined);
  const totalInflowInCents = byPaymentMethod.reduce(
    (sum, item) => sum + item.inflowInCents,
    0,
  );
  const totalOutflowInCents = byPaymentMethod.reduce(
    (sum, item) => sum + item.outflowInCents,
    0,
  );
  return {
    date,
    generatedAt: generatedAt.toISOString(),
    byPaymentMethod,
    totalInflowInCents,
    totalOutflowInCents,
    balanceInCents: totalInflowInCents - totalOutflowInCents,
    movements,
  };
}
