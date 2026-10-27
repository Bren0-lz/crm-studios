import { DomainError } from "../../repository.js";
import { clinicDateOf, DEFAULT_CLINIC_TIMEZONE } from "./daily-cash.js";
import {
  type DreGroup,
  type DreReport,
  type Receivable,
  type Payable,
  type FinancialCategory,
  type CommissionEntry,
  type PatientTab,
} from "@crm/contracts";
const groups: DreGroup[] = [
  "unclassified",
  "service_revenue",
  "product_revenue",
  "tax",
  "service_cost",
  "product_cost",
  "variable_cost",
  "fixed_expense",
  "depreciation",
  "financial_result",
];
export function buildDre(
  from: string,
  to: string,
  receivables: Receivable[],
  payables: Payable[],
  categories: FinancialCategory[],
  commissions: CommissionEntry[],
  tabs: PatientTab[],
  costCenterId?: string,
  timezone = DEFAULT_CLINIC_TIMEZONE,
  adjustments: import("@crm/contracts").CommissionAdjustment[] = [],
): DreReport {
  const months: DreReport["months"] = [];
  let year = Number(from.slice(0, 4)),
    month = Number(from.slice(5, 7));
  const last = to.slice(0, 7);
  for (
    let current = `${year}-${String(month).padStart(2, "0")}`;
    current <= last;
    current = `${year}-${String(month).padStart(2, "0")}`
  ) {
    months.push({
      month: current,
      serviceRevenueInCents: 0,
      productRevenueInCents: 0,
      otherRevenueInCents: 0,
      expenses: Object.fromEntries(groups.map((group) => [group, 0])) as Record<
        DreGroup,
        number
      >,
      resultInCents: 0,
    });
    if (++month === 13) {
      month = 1;
      year++;
    }
  }
  const categoryTotals = new Map<
    string,
    { id: string; name: string; group: DreGroup; amountInCents: number }
  >();
  const addCategory = (
    id: string | undefined,
    amount: number,
    group: DreGroup,
  ) => {
    const key = id ?? "unclassified",
      category = categories.find((item) => item.id === id);
    const entry = categoryTotals.get(key) ?? {
      id: key,
      name: category?.name ?? "Não classificado",
      group,
      amountInCents: 0,
    };
    entry.amountInCents += amount;
    categoryTotals.set(key, entry);
  };
  for (const receivable of receivables) {
    if (
      receivable.status === "cancelled" ||
      (costCenterId && receivable.costCenterId !== costCenterId)
    )
      continue;
    const competence =
        receivable.competence ??
        clinicDateOf(new Date(receivable.createdAt), timezone).slice(0, 7),
      period = months.find((item) => item.month === competence);
    if (!period) continue;
    const category = categories.find(
        (item) => item.id === receivable.categoryId,
      ),
      tab = tabs.find((item) => item.receivableId === receivable.id);
    const productTotal =
        tab?.items.reduce((total, item) => total + item.totalInCents, 0) ?? 0,
      tabTotal = tab?.totalInCents ?? 0;
    const productRevenue =
      tabTotal > 0
        ? Math.round((receivable.amountInCents * productTotal) / tabTotal)
        : category?.dreGroup === "product_revenue"
          ? receivable.amountInCents
          : 0;
    period.productRevenueInCents += productRevenue;
    const remaining = receivable.amountInCents - productRevenue;
    if (receivable.planId || tab || category?.dreGroup === "service_revenue")
      period.serviceRevenueInCents += remaining;
    else period.otherRevenueInCents += remaining;
    addCategory(
      receivable.categoryId,
      receivable.amountInCents,
      category?.dreGroup ?? "unclassified",
    );
    if (tab)
      period.expenses.product_cost += tab.items.reduce(
        (total, item) => total + item.unitCostInCents * item.quantity,
        0,
      );
  }
  for (const payable of payables) {
    if (
      payable.status === "cancelled" ||
      (costCenterId && payable.costCenterId !== costCenterId)
    )
      continue;
    const period = months.find(
      (item) =>
        item.month ===
        (payable.dreCompetence ??
          payable.competence ??
          clinicDateOf(new Date(payable.createdAt), timezone).slice(0, 7)),
    );
    if (!period) continue;
    const category = categories.find((item) => item.id === payable.categoryId),
      group = category?.dreGroup ?? "unclassified",
      // Despesa da folha: a parte de comissão já entra como custo do serviço na competência.
      amount =
        payable.amountInCents - (payable.payroll?.commissionInCents ?? 0);
    if (!amount) continue;
    period.expenses[group] += amount;
    addCategory(payable.categoryId, amount, group);
  }
  if (!costCenterId)
    for (const commission of commissions) {
      const period = months.find(
        (item) => item.month === commission.competence,
      );
      if (
        period &&
        !payables.some(
          (item) =>
            item.commissionId === commission.id && item.status !== "cancelled",
        )
      )
        period.expenses.service_cost += commission.amountInCents;
    }
  if (!costCenterId)
    for (const adjustment of adjustments) {
      const period = months.find(
        (item) => item.month === adjustment.competence,
      );
      if (period) period.expenses.service_cost += adjustment.amountInCents;
    }
  for (const period of months)
    period.resultInCents =
      period.serviceRevenueInCents +
      period.productRevenueInCents +
      period.otherRevenueInCents -
      Object.values(period.expenses).reduce((total, value) => total + value, 0);
  const revenueInCents = months.reduce(
      (total, item) =>
        total +
        item.serviceRevenueInCents +
        item.productRevenueInCents +
        item.otherRevenueInCents,
      0,
    ),
    resultInCents = months.reduce(
      (total, item) => total + item.resultInCents,
      0,
    );
  return {
    from,
    to,
    months,
    totals: {
      revenueInCents,
      expensesInCents: revenueInCents - resultInCents,
      resultInCents,
    },
    categories: [...categoryTotals.values()],
  };
}

export function assertCategoryDreGroup(
  kind: "income" | "expense",
  group: DreGroup,
) {
  if (group === "unclassified" || group === "financial_result") return;
  if ((kind === "income") !== group.endsWith("revenue"))
    throw new DomainError(
      "DRE_CATEGORY_KIND",
      "O grupo da DRE deve ser compatível com receita ou despesa da categoria.",
      409,
    );
}
