import {
  financialEntryOriginLabels,
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
  type Payable,
  type Professional,
  type ProLaboreSettings,
  type Receivable,
} from "@crm/contracts";
import { clinicDateOf } from "../finance/daily-cash.js";

export interface FinancialReportSources {
  movements: CashMovement[];
  receivables: Receivable[];
  payables: Payable[];
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  commissions: CommissionEntry[];
  adjustments: CommissionAdjustment[];
  professionals: Professional[];
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

function receivableOrigin(receivable: Receivable | undefined) {
  if (receivable?.planId || receivable?.source === "plan")
    return "plan" as const;
  if (receivable?.source === "tab") return "tab" as const;
  return "manual_receivable" as const;
}

/**
 * Relatório financeiro do período: cada movimento do caixa com a origem, categoria,
 * centro de custo, filial e profissional, mais o que cada profissional recebeu.
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
  const commissions = new Map(
    sources.commissions.map((item) => [item.id, item]),
  );
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

  const entries = sources.movements.map((movement): FinancialEntry => {
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
        origin = receivableOrigin(receivable);
      return {
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
    }
    if (movement.payableId) {
      const payable = payables.get(movement.payableId),
        commission = payable?.commissionId
          ? commissions.get(payable.commissionId)
          : undefined,
        origin = commission ? ("commission" as const) : ("expense" as const);
      return {
        ...base,
        origin,
        ...(payable?.categoryId ? { categoryId: payable.categoryId } : {}),
        categoryName:
          payable?.categoryName || categoryName(payable?.categoryId, origin),
        ...(payable?.costCenterName
          ? { costCenterName: payable.costCenterName }
          : {}),
        ...(payable?.branchId ? { branchId: payable.branchId } : {}),
        ...(commission
          ? {
              professionalId: commission.professionalId,
              professionalName: commission.professionalName,
            }
          : {}),
      };
    }
    const commission = movement.commissionId
        ? commissions.get(movement.commissionId)
        : undefined,
      professional = commission
        ? professionals.get(commission.professionalId)
        : undefined,
      // Profissional sem filial pertence à filial padrão.
      branchId = professional?.branchId ?? defaultBranchId;
    return {
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
    };
  });
  const commissionMonths = monthsBetween(from, to);
  const people = new Map<string, FinancialProfessional>();
  const person = (id: string, name: string) => {
    const current = people.get(id);
    if (current) return current;
    const branchId = professionals.get(id)?.branchId ?? defaultBranchId;
    const created: FinancialProfessional = {
      id,
      name: professionals.get(id)?.fullName ?? name,
      ...(branchId ? { branchId } : {}),
      paidInCents: 0,
      generatedInCents: 0,
      openInCents: 0,
    };
    people.set(id, created);
    return created;
  };
  for (const entry of entries)
    if (entry.professionalId)
      person(entry.professionalId, entry.professionalName ?? "").paidInCents +=
        entry.amountInCents;
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
          item.generatedInCents !== 0 ||
          item.openInCents !== 0,
      )
      .sort(
        (a, b) =>
          b.paidInCents - a.paidInCents ||
          b.generatedInCents - a.generatedInCents ||
          a.name.localeCompare(b.name),
      ),
  };
}
