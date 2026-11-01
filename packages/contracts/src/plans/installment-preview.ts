import { planInstallmentSchedule } from "../agenda/model.js";
import { addMonthsToIsoDate } from "../common/model.js";
import { z } from "zod";
import {
  discountedPlanInstallments,
  type patientDiscountSchema,
} from "./discount.js";
import { allocatePlanRevenue } from "./model.js";

type PatientDiscount = z.infer<typeof patientDiscountSchema>;

/** Um pedaço do valor da parcela: soma (valor, centavo) ou abate (desconto, negativo). */
export interface InstallmentPreviewPart {
  label: string;
  amountInCents: number;
}

/** Parcela prevista antes de vender: valor final e de onde vem cada centavo. */
export interface InstallmentPreview {
  installmentNumber: number;
  installmentCount: number;
  /** Vencimento (ausente quando não há, ex.: cartão pago agora). */
  dueDate?: string;
  amountInCents: number;
  parts: InstallmentPreviewPart[];
}

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(cents / 100)
    .replace(/\u00a0/g, " ");

function planDiscountLabel(discount: PatientDiscount | undefined) {
  return discount?.type === "percentage"
    ? `Desconto do plano · ${discount.percent.toLocaleString("pt-BR")}%`
    : "Desconto do plano · valor fixo";
}

/** Quantidade válida de parcelas (1 a 36), mesmo com o campo ainda sendo digitado. */
function installmentCount(value: number) {
  return Math.min(36, Math.max(1, Math.trunc(value) || 1));
}

/** Divide o valor do jeito do CRM: parte inteira em todas e o resto nos primeiros centavos. */
function splitAmount(totalInCents: number, installments: number) {
  const count = installmentCount(installments);
  const base = Math.floor(totalInCents / count);
  const remainder = totalInCents % count;
  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

/**
 * Parcelas que a venda (ou renovação) do plano vai gerar, com a mesma conta da API
 * (`planInstallmentSchedule` + `discountedPlanInstallments`): divisão do valor, centavo
 * do arredondamento, 1º pagamento proporcional, desconto do plano (conforme o alcance e,
 * na renovação, o que já foi usado) e a parte do desconto geral do pedido.
 */
export function planInstallmentPreview(plan: {
  totalValueInCents: number;
  installments: number;
  firstDueDate: string;
  firstInstallmentInCents?: number | undefined;
  discount?: PatientDiscount | null | undefined;
  /** Na renovação: desconto do plano anterior (segue quando nenhum novo é informado). */
  previousDiscount?: PatientDiscount | null | undefined;
  orderDiscountInCents?: number | undefined;
}): InstallmentPreview[] {
  if (!z.iso.date().safeParse(plan.firstDueDate).success) return [];
  const installments = installmentCount(plan.installments);
  const terms = { ...plan, installments };
  const schedule = planInstallmentSchedule(terms);
  const planOnly = discountedPlanInstallments(
    schedule,
    plan.discount,
    plan.previousDiscount,
  );
  const final = discountedPlanInstallments(
    schedule,
    plan.discount,
    plan.previousDiscount,
    plan.orderDiscountInCents,
  );
  const base = Math.floor(plan.totalValueInCents / installments);
  return schedule.map((item, index) => {
    const parts: InstallmentPreviewPart[] = [];
    if (index === 0 && plan.firstInstallmentInCents !== undefined)
      parts.push({
        label: "Proporcional às aulas até o 1º vencimento",
        amountInCents: item.amountInCents,
      });
    else {
      parts.push({
        label:
          installments === 1
            ? "Valor do plano"
            : `Valor do plano (${money(plan.totalValueInCents)}) ÷ ${installments}`,
        amountInCents: base,
      });
      if (item.amountInCents > base)
        parts.push({
          label: "Centavo do arredondamento da divisão",
          amountInCents: item.amountInCents - base,
        });
    }
    const planOff = planOnly.installments[index]!.customerDiscountInCents;
    const orderOff =
      final.installments[index]!.customerDiscountInCents - planOff;
    if (planOff > 0)
      parts.push({
        label: planDiscountLabel(planOnly.discount),
        amountInCents: -planOff,
      });
    if (orderOff > 0)
      parts.push({
        label: "Desconto geral da compra",
        amountInCents: -orderOff,
      });
    return {
      installmentNumber: item.installmentNumber,
      installmentCount: installments,
      dueDate: item.dueDate,
      amountInCents: final.installments[index]!.amountInCents,
      parts,
    };
  });
}

/**
 * Parcelas de uma venda de itens (produtos): o total com desconto dividido como no CRM e,
 * em cada parcela, quanto vem de cada item e quanto é desconto. Com `firstDueDate`, uma
 * parcela por mês a partir dele.
 */
export function itemsInstallmentPreview(input: {
  items: readonly { label: string; grossInCents: number }[];
  discountInCents?: number | undefined;
  discountLabel?: string | undefined;
  installments: number;
  firstDueDate?: string | undefined;
}): InstallmentPreview[] {
  const gross = input.items.reduce((sum, item) => sum + item.grossInCents, 0);
  const discount = Math.min(gross, Math.max(0, input.discountInCents ?? 0));
  const count = installmentCount(input.installments);
  const firstDueDate =
    input.firstDueDate && z.iso.date().safeParse(input.firstDueDate).success
      ? input.firstDueDate
      : undefined;
  const grossShares = splitAmount(gross, count);
  const netShares = splitAmount(gross - discount, count);
  return netShares.map((amountInCents, index) => {
    const itemShares = allocatePlanRevenue(
      grossShares[index]!,
      input.items.map((item) => ({ totalValueInCents: item.grossInCents })),
    );
    const off = grossShares[index]! - amountInCents;
    const parts: InstallmentPreviewPart[] = input.items.map((item, at) => ({
      label:
        count === 1
          ? item.label
          : `${item.label} (${money(item.grossInCents)}) ÷ ${count}`,
      amountInCents: itemShares[at]!,
    }));
    if (off > 0)
      parts.push({
        label: input.discountLabel ?? "Desconto",
        amountInCents: -off,
      });
    return {
      installmentNumber: index + 1,
      installmentCount: count,
      ...(firstDueDate
        ? { dueDate: addMonthsToIsoDate(firstDueDate, index) }
        : {}),
      amountInCents,
      parts,
    };
  });
}
