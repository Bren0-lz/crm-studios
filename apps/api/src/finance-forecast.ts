import {
  nextPlanPeriod,
  planInstallmentSchedule,
  recurringPayableCompetences,
  recurringPayableDueDate,
  type FinanceForecast,
  type FinanceForecastFlow,
  type PatientPlan,
  type Payable,
  type Receivable,
  type RecurringPayable,
} from "@crm/contracts";

export interface FinanceForecastSources {
  /** Contas a receber; entram as em aberto (confirmado). */
  receivables: Pick<Receivable, "status" | "dueDate" | "amountInCents">[];
  /** Contas a pagar; entram as em aberto (confirmado). */
  payables: Pick<
    Payable,
    "status" | "dueDate" | "amountInCents" | "recurringPayableId" | "competence"
  >[];
  /** Planos; projetam as renovações automáticas futuras. */
  plans: Pick<
    PatientPlan,
    | "status"
    | "autoRenew"
    | "renewedByPlanId"
    | "validFrom"
    | "validUntil"
    | "firstDueDate"
    | "totalValueInCents"
    | "installments"
  >[];
  /** Despesas fixas; projetam as competências ainda não lançadas. */
  recurringPayables: Pick<
    RecurringPayable,
    | "id"
    | "active"
    | "startMonth"
    | "endMonth"
    | "resumedFromMonth"
    | "amountInCents"
    | "dayOfMonth"
  >[];
}

/** Limite de períodos projetados por plano (planos de poucos dias). */
const MAX_PROJECTED_PERIODS = 400;

function addMonthsToMonth(month: string, count: number) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, value! - 1 + count, 1))
    .toISOString()
    .slice(0, 7);
}

const emptyFlow = (): FinanceForecastFlow => ({
  inflowInCents: 0,
  outflowInCents: 0,
  balanceInCents: 0,
});

function addTo(flow: FinanceForecastFlow, direction: "in" | "out", amount: number) {
  if (direction === "in") {
    flow.inflowInCents += amount;
    flow.balanceInCents += amount;
  } else {
    flow.outflowInCents += amount;
    flow.balanceInCents -= amount;
  }
}

/**
 * Previsão de `months` meses a partir de `currentMonth` (inclusive).
 *
 * - Confirmado: parcelas a receber e contas a pagar em aberto, no mês do
 *   vencimento. As vencidas antes de `currentMonth` vão para `overdue`.
 * - Projetado (entrada): períodos seguintes dos planos ativos ou vencidos com
 *   renovação automática e ainda não renovados, encadeados com
 *   `nextPlanPeriod` e divididos com `planInstallmentSchedule` — a mesma regra
 *   da renovação real. O período atual do plano já tem parcelas lançadas e não
 *   é projetado. Parcela projetada com vencimento antes de `currentMonth`
 *   (renovação atrasada) conta no primeiro mês.
 * - Projetado (saída): competências das despesas fixas ativas de
 *   `currentMonth` em diante (respeitando início, fim e retomada) que ainda
 *   não têm conta a pagar lançada (de qualquer situação).
 */
export function buildFinanceForecast(
  currentMonth: string,
  months: number,
  sources: FinanceForecastSources,
  generatedAt: Date = new Date(),
): FinanceForecast {
  const monthKeys = Array.from({ length: months }, (_, index) =>
    addMonthsToMonth(currentMonth, index),
  );
  const endMonth = monthKeys.at(-1)!;
  const rows = new Map(
    monthKeys.map((month) => [
      month,
      { confirmed: emptyFlow(), projected: emptyFlow() },
    ]),
  );
  const overdue = emptyFlow();

  const confirm = (dueDate: string, direction: "in" | "out", amount: number) => {
    const month = dueDate.slice(0, 7);
    if (month < currentMonth) addTo(overdue, direction, amount);
    else {
      const row = rows.get(month);
      if (row) addTo(row.confirmed, direction, amount);
    }
  };
  const project = (dueDate: string, direction: "in" | "out", amount: number) => {
    const month = dueDate.slice(0, 7);
    const row = rows.get(month < currentMonth ? currentMonth : month);
    if (row) addTo(row.projected, direction, amount);
  };

  for (const item of sources.receivables) {
    if (item.status === "open") confirm(item.dueDate, "in", item.amountInCents);
  }
  for (const item of sources.payables) {
    if (item.status === "open") confirm(item.dueDate, "out", item.amountInCents);
  }

  for (const plan of sources.plans) {
    if (
      !plan.autoRenew ||
      plan.renewedByPlanId ||
      (plan.status !== "active" && plan.status !== "expired")
    )
      continue;
    let period = nextPlanPeriod(plan);
    for (
      let count = 0;
      period && count < MAX_PROJECTED_PERIODS && period.firstDueDate.slice(0, 7) <= endMonth;
      count += 1
    ) {
      for (const installment of planInstallmentSchedule({
        totalValueInCents: plan.totalValueInCents,
        installments: plan.installments,
        firstDueDate: period.firstDueDate,
      })) {
        project(installment.dueDate, "in", installment.amountInCents);
      }
      period = nextPlanPeriod(period);
    }
  }

  for (const model of sources.recurringPayables) {
    const generated = new Set(
      sources.payables
        .filter((item) => item.recurringPayableId === model.id)
        .map((item) => item.competence),
    );
    for (const competence of recurringPayableCompetences(model, endMonth)) {
      if (competence < currentMonth || generated.has(competence)) continue;
      project(
        recurringPayableDueDate(competence, model.dayOfMonth),
        "out",
        model.amountInCents,
      );
    }
  }

  const totals = {
    confirmed: emptyFlow(),
    projected: emptyFlow(),
    balanceInCents: 0,
  };
  const monthRows = monthKeys.map((month) => {
    const row = rows.get(month)!;
    addTo(totals.confirmed, "in", row.confirmed.inflowInCents);
    addTo(totals.confirmed, "out", row.confirmed.outflowInCents);
    addTo(totals.projected, "in", row.projected.inflowInCents);
    addTo(totals.projected, "out", row.projected.outflowInCents);
    return {
      month,
      confirmed: row.confirmed,
      projected: row.projected,
      balanceInCents: row.confirmed.balanceInCents + row.projected.balanceInCents,
    };
  });
  totals.balanceInCents =
    totals.confirmed.balanceInCents + totals.projected.balanceInCents;

  return {
    generatedAt: generatedAt.toISOString(),
    startMonth: currentMonth,
    endMonth,
    months: monthRows,
    overdue,
    totals,
  };
}
