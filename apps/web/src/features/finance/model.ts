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
} from "@crm/contracts";
import { currency } from "../../shared/lib/formatting";
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

export const dailyCashMethodLabels: Record<DailyCashPaymentMethod, string> = {
  pix: "Pix",
  card: "Cartão",
  cash: "Dinheiro",
  bank_transfer: "Transferência",
  boleto: "Boleto",
  other: "Outro",
  unspecified: "Não informada",
};

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
    amountInCents: item.amountInCents,
    dayOfMonth: item.dayOfMonth,
    startMonth: item.startMonth,
    ...(item.endMonth ? { endMonth: item.endMonth } : {}),
    active: item.active,
    ...changes,
  };
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
