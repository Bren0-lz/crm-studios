import {
  financialEntryOriginLabels,
  PAYROLL_EMPLOYEE_PREFIX,
  productItemName,
  type Branch,
  type CashMovement,
  type CommissionAdjustment,
  type CommissionEntry,
  type CostCenter,
  type FinancialCategory,
  type FinancialEntry,
  type FinancialEntryOrigin,
  type FinancialProfessional,
  type FinancialReport,
  type PatientTab,
  type Payable,
  type PayrollEmployee,
  type Professional,
  type ProLaboreSettings,
  type Receivable,
} from "@crm/contracts";
import { clinicDateOf } from "../finance/daily-cash.js";

export interface FinancialReportSources {
  movements: CashMovement[];
  receivables: Receivable[];
  payables: Payable[];
  /** Vendas (comandas), para quebrar cada recebimento por produto e serviço. */
  tabs: PatientTab[];
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  commissions: CommissionEntry[];
  adjustments: CommissionAdjustment[];
  professionals: Professional[];
  /** Colaboradores da folha (salário de quem não é profissional da agenda). */
  employees?: PayrollEmployee[];
  branches: Branch[];
  proLabore: ProLaboreSettings;
}

/** Competências (AAAA-MM) entre os meses de `from` e `to`. */
function monthsBetween(from: string, to: string) {
  const months: string[] = [];
  let year = Number(from.slice(0, 4)),
    month = Number(from.slice(5, 7));
  for (
    let current = from.slice(0, 7);
    current <= to.slice(0, 7);
    current = `${year}-${String(month).padStart(2, "0")}`
  ) {
    months.push(current);
    if (++month === 13) {
      month = 1;
      year++;
    }
  }
  return months;
}

function receivableOrigin(
  receivable: Receivable | undefined,
  tab: PatientTab | undefined,
) {
  if (receivable?.planId || receivable?.source === "plan")
    return "plan" as const;
  if (tab || receivable?.source === "tab") return "product_sale" as const;
  return "manual_receivable" as const;
}

/**
 * Divide `total` (centavos, com sinal) na proporção dos pesos; a soma das partes é sempre
 * `total`. Os centavos que sobram do arredondamento vão para os maiores restos. Sem peso,
 * divide em partes iguais.
 */
export function splitProportionally(total: number, weights: readonly number[]) {
  const sign = total < 0 ? -1 : 1,
    amount = Math.abs(total),
    sum = weights.reduce((acc, weight) => acc + Math.max(0, weight), 0),
    shares = weights.map((weight) =>
      sum > 0 ? (amount * Math.max(0, weight)) / sum : amount / weights.length,
    ),
    parts = shares.map(Math.floor);
  let left = amount - parts.reduce((acc, part) => acc + part, 0);
  const byRemainder = shares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; left > 0; i++, left--)
    parts[byRemainder[i % byRemainder.length]!.index]! += 1;
  return parts.map((part) => sign * part || 0);
}

/** Recebimento de uma venda em uma linha por produto e por serviço avulso. */
function splitTabEntry(entry: FinancialEntry, tab: PatientTab | undefined) {
  const lines = [
    ...(tab?.items ?? []).map((item) => ({
      id: item.id,
      origin: "product_sale" as const,
      description: `${productItemName(item)} × ${item.quantity}`,
      weight: item.totalInCents,
    })),
    ...(tab?.services ?? []).map((service) => ({
      id: service.id,
      origin: "service_sale" as const,
      description: `${service.serviceName} com ${service.professionalName}`,
      weight: service.amountInCents,
    })),
  ];
  if (!lines.length) return [entry];
  const amounts = splitProportionally(
    entry.amountInCents,
    lines.map((line) => line.weight),
  );
  return lines.map((line, index): FinancialEntry => ({
    ...entry,
    id: `${entry.id}#${line.id}`,
    origin: line.origin,
    description: line.description,
    amountInCents: amounts[index]!,
    // Sem categoria no recebimento, a categoria é o tipo do item.
    ...(entry.categoryId
      ? {}
      : { categoryName: financialEntryOriginLabels[line.origin] }),
  }));
}

/**
 * Relatório financeiro do período: cada movimento do caixa com a origem, categoria,
 * centro de custo, filial e profissional, mais o que cada profissional ou colaborador
 * recebeu (comissões e salário da folha).
 */
export function buildFinancialReport(
  from: string,
  to: string,
  sources: FinancialReportSources,
  timeZone: string,
  generatedAt: Date = new Date(),
): FinancialReport {
  const receivables = new Map(
    sources.receivables.map((item) => [item.id, item]),
  );
  const payables = new Map(sources.payables.map((item) => [item.id, item]));
  const tabsByReceivable = new Map(
    sources.tabs.flatMap((tab) =>
      tab.receivableId ? [[tab.receivableId, tab] as const] : [],
    ),
  );
  const commissions = new Map(
    sources.commissions.map((item) => [item.id, item]),
  );
  // Despesa da folha: o profissional das comissões e ajustes que ela paga.
  const payrollProfessionals = new Map(
    [...sources.commissions, ...sources.adjustments].flatMap((item) =>
      item.payrollPayableId ? [[item.payrollPayableId, item] as const] : [],
    ),
  );
  const employees = new Map(
    (sources.employees ?? []).map((item) => [item.id, item]),
  );
  /** Quanto de cada movimento da folha é comissão e quanto é salário. */
  const commissionShare = new Map<string, number>();
  const salaryShare = new Map<string, number>();
  const categories = new Map(sources.categories.map((item) => [item.id, item]));
  const costCenters = new Map(
    sources.costCenters.map((item) => [item.id, item.name]),
  );
  const professionals = new Map(
    sources.professionals.map((item) => [item.id, item]),
  );
  const defaultBranchId = sources.branches.find(
    (branch) => branch.isDefault,
  )?.id;
  const categoryName = (id: string | undefined, origin: FinancialEntryOrigin) =>
    (id && categories.get(id)?.name) || financialEntryOriginLabels[origin];

  const entries = sources.movements.flatMap((movement): FinancialEntry[] => {
    const base = {
      id: movement.id,
      direction: movement.direction,
      kind: movement.kind,
      occurredAt: movement.occurredAt,
      date: clinicDateOf(movement.occurredAt, timeZone),
      description: movement.description,
      ...(movement.counterpart ? { counterpart: movement.counterpart } : {}),
      paymentMethod: movement.paymentMethod,
      amountInCents: movement.amountInCents,
    };
    if (movement.receivableId) {
      const receivable = receivables.get(movement.receivableId),
        tab = tabsByReceivable.get(movement.receivableId),
        origin = receivableOrigin(receivable, tab);
      const entry: FinancialEntry = {
        ...base,
        origin,
        ...(receivable?.categoryId
          ? { categoryId: receivable.categoryId }
          : {}),
        categoryName: categoryName(receivable?.categoryId, origin),
        ...(receivable?.costCenterId && costCenters.has(receivable.costCenterId)
          ? { costCenterName: costCenters.get(receivable.costCenterId)! }
          : {}),
        ...(receivable?.branchId ? { branchId: receivable.branchId } : {}),
      };
      return origin === "product_sale" ? splitTabEntry(entry, tab) : [entry];
    }
    if (movement.payableId) {
      const payable = payables.get(movement.payableId),
        commission = payable?.commissionId
          ? commissions.get(payable.commissionId)
          : undefined,
        origin = commission
          ? ("commission" as const)
          : payable?.payroll
            ? ("payroll" as const)
            : ("expense" as const),
        employee = payable?.payroll
          ? employees.get(payable.payroll.employeeId)
          : undefined,
        // Folha: o profissional das comissões, o profissional ligado ao colaborador ou o
        // próprio colaborador (quem não atende na agenda recebe só salário).
        paidTo =
          commission ??
          (payable?.payroll
            ? (payrollProfessionals.get(payable.id) ??
              (employee?.professionalId
                ? {
                    professionalId: employee.professionalId,
                    professionalName:
                      employee.professionalName ?? employee.name,
                  }
                : {
                    professionalId: `${PAYROLL_EMPLOYEE_PREFIX}${payable.payroll.employeeId}`,
                    professionalName: payable.payroll.employeeName,
                  }))
            : undefined);
      // A despesa da folha soma salário e comissões: cada parte é contada separada.
      if (payable?.payroll) {
        const sign = Math.sign(movement.amountInCents);
        commissionShare.set(
          movement.id,
          sign * payable.payroll.commissionInCents,
        );
        salaryShare.set(movement.id, sign * payable.payroll.salaryInCents);
      }
      return [
        {
          ...base,
          origin,
          ...(payable?.categoryId ? { categoryId: payable.categoryId } : {}),
          categoryName:
            payable?.categoryName || categoryName(payable?.categoryId, origin),
          ...(payable?.costCenterName
            ? { costCenterName: payable.costCenterName }
            : {}),
          ...(payable?.branchId ? { branchId: payable.branchId } : {}),
          ...(paidTo
            ? {
                professionalId: paidTo.professionalId,
                professionalName: paidTo.professionalName,
              }
            : {}),
        },
      ];
    }
    const commission = movement.commissionId
        ? commissions.get(movement.commissionId)
        : undefined,
      professional = commission
        ? professionals.get(commission.professionalId)
        : undefined,
      // Profissional sem filial pertence à filial padrão.
      branchId = professional?.branchId ?? defaultBranchId;
    return [
      {
        ...base,
        origin: "commission",
        categoryName: financialEntryOriginLabels.commission,
        ...(branchId ? { branchId } : {}),
        ...(commission
          ? {
              professionalId: commission.professionalId,
              professionalName: commission.professionalName,
            }
          : {}),
      },
    ];
  });
  const commissionMonths = monthsBetween(from, to);
  const people = new Map<string, FinancialProfessional>();
  const employeeOf = (id: string) =>
    id.startsWith(PAYROLL_EMPLOYEE_PREFIX)
      ? employees.get(id.slice(PAYROLL_EMPLOYEE_PREFIX.length))
      : [...employees.values()].find((item) => item.professionalId === id);
  const person = (id: string, name: string) => {
    const current = people.get(id);
    if (current) return current;
    const employee = employeeOf(id);
    const branchId =
      professionals.get(id)?.branchId ?? employee?.branchId ?? defaultBranchId;
    const created: FinancialProfessional = {
      id,
      name: professionals.get(id)?.fullName ?? name,
      ...(employee?.role ? { role: employee.role } : {}),
      ...(branchId ? { branchId } : {}),
      paidInCents: 0,
      salaryPaidInCents: 0,
      generatedInCents: 0,
      openInCents: 0,
    };
    people.set(id, created);
    return created;
  };
  for (const entry of entries)
    if (entry.professionalId) {
      const target = person(entry.professionalId, entry.professionalName ?? "");
      target.paidInCents +=
        commissionShare.get(entry.id) ?? entry.amountInCents;
      target.salaryPaidInCents += salaryShare.get(entry.id) ?? 0;
    }
  for (const item of [...sources.commissions, ...sources.adjustments]) {
    if (!commissionMonths.includes(item.competence)) continue;
    const target = person(item.professionalId, item.professionalName);
    target.generatedInCents += item.amountInCents;
    if (item.status === "open") target.openInCents += item.amountInCents;
  }

  return {
    from,
    to,
    generatedAt: generatedAt.toISOString(),
    commissionMonths,
    branches: sources.branches
      .filter((branch) => branch.active)
      .map(({ id, name }) => ({ id, name })),
    proLabore: sources.proLabore,
    entries,
    professionals: [...people.values()]
      .filter(
        (item) =>
          item.paidInCents !== 0 ||
          item.salaryPaidInCents !== 0 ||
          item.generatedInCents !== 0 ||
          item.openInCents !== 0,
      )
      .sort(
        (a, b) =>
          b.paidInCents +
            b.salaryPaidInCents -
            (a.paidInCents + a.salaryPaidInCents) ||
          b.generatedInCents - a.generatedInCents ||
          a.name.localeCompare(b.name),
      ),
  };
}
