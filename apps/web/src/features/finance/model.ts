import type {
  DailyCash,
  DailyCashMovement,
  DailyCashMovementKind,
  DailyCashPaymentMethod,
  FinanceForecast,
  PaymentMethod,
  Receivable,
  RecurringPayable,
  RecurringPayableInput,
  RecurringPayableReminder,
} from "@crm/contracts";
import {
  cashPaymentMethodLabels,
  patientFirstName,
  paymentMethodWithInstallments,
  paymentPartsLabel,
  type PaymentReceipt,
} from "@crm/contracts";
import { currency, shortDate } from "../../shared/lib/formatting";
import type { ReceivableFilter } from "./types";

export function dailyCashGroups(cash: DailyCash) {
  const methods = cash.byPaymentMethod.map((item) => item.paymentMethod);
  for (const movement of cash.movements)
    if (!methods.includes(movement.paymentMethod))
      methods.push(movement.paymentMethod);
  return methods.map((method) => {
    const movements = cash.movements.filter(
      (movement) => movement.paymentMethod === method,
    );
    const total = cash.byPaymentMethod.find(
      (item) => item.paymentMethod === method,
    );
    const inflow =
      total?.inflowInCents ??
      movements
        .filter((movement) => movement.direction === "in")
        .reduce((sum, movement) => sum + movement.amountInCents, 0);
    const outflow =
      total?.outflowInCents ??
      movements
        .filter((movement) => movement.direction === "out")
        .reduce((sum, movement) => sum + movement.amountInCents, 0);
    return {
      method,
      label: dailyCashMethodLabels[method],
      inflow,
      outflow,
      balance: total?.balanceInCents ?? inflow - outflow,
      movements,
    };
  });
}

export const dailyCashKinds: Record<
  DailyCashMovementKind,
  { label: string; pill: string }
> = {
  receipt: { label: "Recebimento", pill: "paid" },
  receipt_reversal: { label: "Estorno", pill: "cancelled" },
  payable: { label: "Conta paga", pill: "open" },
  commission: { label: "Comissão", pill: "open" },
};

export const dailyCashMethodLabels: Record<DailyCashPaymentMethod, string> =
  cashPaymentMethodLabels;

export function dailyCashMovementAmount(movement: DailyCashMovement) {
  const effect =
    movement.direction === "in"
      ? movement.amountInCents
      : -movement.amountInCents;
  return { effect, text: signedCurrency(effect) };
}

export const forecastHorizons = [3, 6, 12] as const;

export function forecastIsEmpty(forecast: FinanceForecast) {
  const flows = [
    forecast.totals.confirmed,
    forecast.totals.projected,
    forecast.overdue,
  ];
  return flows.every(
    (flow) => flow.inflowInCents === 0 && flow.outflowInCents === 0,
  );
}

export function formatCompetence(month: string) {
  const [year, value] = month.split("-");
  return `${value}/${year}`;
}

export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export const paymentMethodOptions: { value: PaymentMethod; label: string }[] = [
  { value: "pix", label: "Pix" },
  { value: "card", label: "Cartão" },
  { value: "cash", label: "Dinheiro" },
  { value: "bank_transfer", label: "Transferência" },
  { value: "boleto", label: "Boleto" },
  { value: "other", label: "Outro" },
];

export const receivableFilterLabels: Record<ReceivableFilter, string> = {
  all: "Todas",
  open: "Em aberto",
  overdue: "Vencidas",
  paid: "Pagas",
  cancelled: "Canceladas",
};

export function receivableSituation(
  item: Pick<Receivable, "status" | "overdue" | "dueDate">,
  today: string,
) {
  if (item.status === "paid")
    return { key: "paid", label: "Paga", pill: "paid" };
  if (item.status === "cancelled")
    return { key: "cancelled", label: "Cancelada", pill: "cancelled" };
  if (item.overdue) {
    const days = Math.max(
      1,
      Math.round(
        (Date.parse(`${today}T12:00:00Z`) -
          Date.parse(`${item.dueDate}T12:00:00Z`)) /
          86_400_000,
      ),
    );
    return {
      key: "overdue",
      label: `Vencida há ${days} ${days === 1 ? "dia" : "dias"}`,
      pill: "overdue",
    };
  }
  return { key: "open", label: "Em aberto", pill: "open" };
}

export function recurringPayableInput(
  item: RecurringPayable,
  changes: Partial<RecurringPayableInput> = {},
): RecurringPayableInput {
  return {
    description: item.description,
    ...(item.supplier ? { supplier: item.supplier } : {}),
    categoryId: item.categoryId,
    costCenterId: item.costCenterId,
    amountType: item.amountType,
    amountInCents: item.amountInCents,
    dayOfMonth: item.dayOfMonth,
    ...(item.reminderDaysBefore !== undefined
      ? { reminderDaysBefore: item.reminderDaysBefore }
      : {}),
    startMonth: item.startMonth,
    ...(item.endMonth ? { endMonth: item.endMonth } : {}),
    active: item.active,
    ...changes,
  };
}

/** Texto do aviso de uma despesa fixa: quanto falta para o vencimento e se falta o valor. */
export function recurringReminderLabel(
  reminder: RecurringPayableReminder,
  today: string,
) {
  const days = Math.round(
    (Date.parse(`${reminder.dueDate}T12:00:00Z`) -
      Date.parse(`${today}T12:00:00Z`)) /
      86_400_000,
  );
  const when =
    days > 1
      ? `vence em ${days} dias`
      : days === 1
        ? "vence amanhã"
        : days === 0
          ? "vence hoje"
          : "vencida";
  return [
    `Conta de ${formatCompetence(reminder.competence)} ${when} (${shortDate.format(new Date(`${reminder.dueDate}T12:00:00`))})`,
    reminder.amountPending && "valor do mês a informar",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function recurringPayableStatus(
  item: RecurringPayable,
  currentMonth: string,
): "active" | "paused" | "ended" {
  // No mês final a despesa ainda gera conta: só depois dele fica encerrada.
  if (item.endMonth && item.endMonth < currentMonth) return "ended";
  return item.active ? "active" : "paused";
}

export const saoPauloTime = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export function signedCurrency(effectInCents: number) {
  return `${effectInCents < 0 ? "-" : "+"} ${currency.format(Math.abs(effectInCents) / 100)}`;
}

/** Mensagem pronta para enviar o recibo pelo WhatsApp (U40). */
export function receiptMessage(receipt: PaymentReceipt) {
  const installment =
    receipt.installmentCount && receipt.installmentCount > 1
      ? ` (parcela ${receipt.installmentNumber} de ${receipt.installmentCount})`
      : "";
  const method = receipt.paymentParts
    ? `, ${paymentPartsLabel(receipt.paymentParts, (cents) => currency.format(cents / 100))}`
    : receipt.paymentInstallments
      ? `, ${paymentMethodWithInstallments(receipt.paymentMethod, receipt.paymentInstallments)}`
      : "";
  const discount = receipt.customerDiscountInCents
    ? ` (com desconto de ${currency.format(receipt.customerDiscountInCents / 100)})`
    : "";
  return `Olá, ${patientFirstName(receipt.patientName)}! Segue o recibo ${receipt.receiptNumber}: recebemos ${currency.format(receipt.amountInCents / 100)}${discount} referente a ${receipt.description}${installment}, em ${new Date(receipt.paidAt).toLocaleDateString("pt-BR")}${method}. Obrigado! ${receipt.clinicName}`;
}

/** Explicações curtas dos termos financeiros (U41), usadas no HelpTip. */
export const financeTermHelp = {
  competence:
    "Mês a que a receita ou a despesa pertence no resultado (DRE), não importa quando foi paga.",
  posted:
    "Data em que o valor foi registrado no financeiro. Não muda o vencimento nem a competência.",
  costCenter:
    "Área que gerou a despesa (ex.: Pilates, administrativo). Serve para ver o resultado por área.",
  cashAvailable:
    "Quando o dinheiro fica de fato disponível (ex.: cartão que cai em 30 dias). É a data usada no caixa.",
} as const;

/** "Parcela 2 de 3 · Pago: Cartão · 3x": posição no parcelamento e como foi pago. */
export function receivableInstallmentLine(
  item: Pick<
    Receivable,
    | "installmentNumber"
    | "installmentCount"
    | "status"
    | "paymentMethod"
    | "paymentInstallments"
    | "customerDiscountInCents"
    | "paymentParts"
  >,
) {
  const money = (cents: number) => currency.format(cents / 100);
  return [
    item.installmentCount > 1
      ? `Parcela ${item.installmentNumber} de ${item.installmentCount}`
      : "",
    item.customerDiscountInCents
      ? `Desconto do cliente: ${currency.format(item.customerDiscountInCents / 100)}`
      : "",
    item.status === "paid" && item.paymentParts
      ? `Pago: ${paymentPartsLabel(item.paymentParts, money)}`
      : item.status === "paid" && item.paymentMethod
        ? `Pago: ${paymentMethodWithInstallments(item.paymentMethod, item.paymentInstallments)}`
        : "",
    // Aberta: as formas previstas na venda (sugeridas na baixa).
    item.status === "open" && item.paymentParts
      ? `Previsto: ${paymentPartsLabel(item.paymentParts, money)}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
