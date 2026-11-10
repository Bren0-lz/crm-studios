import {
  buildPayroll,
  PAYROLL_CATEGORY_NAME,
  payrollAdvanceDescription,
  payrollEntryAmount,
  payrollPayableDescription,
  payrollPayableNotes,
  type FinancialCategory,
  type Payable,
  type PayrollEmployee,
  type PayrollAdvanceInput,
  type PayrollEmployeeInput,
  type PayrollEntry,
  type PayrollEntryInput,
  type PayrollLaunchInput,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import {
  payrollAdvanceInactiveError,
  payrollAdvanceManagedError,
  payrollEntryLaunchedError,
  payrollEntryLimitError,
  payrollEntryNoSalaryError,
  payrollLaunchTotals,
  payrollSalaryImmutableError,
  userManagedEmployeeError,
} from "../../modules/finance/payroll.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, today, uuid } from "./helpers.js";

/** Colaborador gravado (os nomes de filial e profissional são lidos na hora). */
export interface PayrollEmployeeRecord {
  id: string;
  clinicId: string;
  branchId: string;
  name: string;
  role?: string;
  professionalId?: string;
  /** Usuário dono do salário; ausente = cadastrado antes, direto na folha. */
  userId?: string;
  baseSalaryInCents: number;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

const toEntry = (
  record: PayrollEntry & { createdByUserId: string },
): PayrollEntry => {
  const entry: PayrollEntry & { createdByUserId?: string } =
    structuredClone(record);
  delete entry.createdByUserId;
  return entry;
};

/**
 * Folha de pagamento (memória): colaboradores, a folha da competência por filial, o
 * lançamento (uma despesa por colaborador com o que está pendente) e o desfazer.
 */
export function createPayrollRepository(context: MemoryRepositoryContext) {
  const toEmployee = (record: PayrollEmployeeRecord): PayrollEmployee => {
    const branch = context.branches.find((item) => item.id === record.branchId);
    const professional = record.professionalId
      ? context.professionals.find((item) => item.id === record.professionalId)
      : undefined;
    // Colaborador do usuário: o nome é sempre o atual do cadastro (o perfil também o muda).
    const user = record.userId
      ? context.users.find((item) => item.id === record.userId)
      : undefined;
    return {
      id: record.id,
      clinicId: record.clinicId,
      branchId: record.branchId,
      ...(branch ? { branchName: branch.name } : {}),
      name: user?.fullName ?? record.name,
      ...(record.role ? { role: record.role } : {}),
      ...(record.professionalId
        ? { professionalId: record.professionalId }
        : {}),
      ...(professional ? { professionalName: professional.fullName } : {}),
      ...(record.userId ? { userId: record.userId } : {}),
      baseSalaryInCents: record.baseSalaryInCents,
      active: record.active,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  };
  /** Filiais permitidas na leitura em curso, filtradas pelas pedidas (403 fora do acesso). */
  const selectedBranches = (clinicId: string, requested?: string[]) => {
    const readIds = context.branchScope.readIds();
    const allowed = context.branches.filter(
      (branch) =>
        branch.clinicId === clinicId &&
        branch.active &&
        (!readIds || readIds.includes(branch.id)),
    );
    if (requested?.some((id) => !allowed.some((branch) => branch.id === id)))
      throw new DomainError(
        "BRANCH_ACCESS_DENIED",
        "Uma das filiais escolhidas não está disponível para o seu usuário.",
        403,
      );
    return allowed
      .filter((branch) => !requested?.length || requested.includes(branch.id))
      .sort(
        (a, b) =>
          Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) ||
          a.name.localeCompare(b.name, "pt-BR"),
      );
  };
  const validateEmployee = (
    clinicId: string,
    input: PayrollEmployeeInput,
    currentId?: string,
  ) => {
    const professional = input.professionalId
      ? context.professionals.find(
          (item) =>
            item.clinicId === clinicId && item.id === input.professionalId,
        )
      : undefined;
    if (input.professionalId && !professional)
      throw new DomainError(
        "PROFESSIONAL_NOT_FOUND",
        "Profissional não encontrado.",
        404,
      );
    if (
      input.professionalId &&
      context.payrollEmployees.some(
        (item) =>
          item.clinicId === clinicId &&
          item.professionalId === input.professionalId &&
          item.id !== currentId,
      )
    )
      throw new DomainError(
        "PAYROLL_PROFESSIONAL_TAKEN",
        "Este profissional já está na folha de outro colaborador.",
        409,
      );
    if (
      input.branchId &&
      !context.branches.some(
        (item) => item.clinicId === clinicId && item.id === input.branchId,
      )
    )
      throw new DomainError("BRANCH_NOT_FOUND", "Filial não encontrada.", 404);
    const branchId =
      input.branchId ??
      (professional
        ? context.branchOf(professional)
        : context.writeBranchId(clinicId));
    if (professional && context.branchOf(professional) !== branchId)
      throw new DomainError(
        "BRANCH_MISMATCH",
        "O colaborador precisa ser da mesma filial do profissional.",
        409,
      );
    context.assertBranchInScope(branchId);
    return branchId;
  };
  const summary = (
    clinicId: string,
    competence: string,
    branchIds?: string[],
  ) => {
    const branches = selectedBranches(clinicId, branchIds),
      selected = new Set(branches.map((item) => item.id));
    const employees = context.payrollEmployees
      .filter(
        (item) => item.clinicId === clinicId && selected.has(item.branchId),
      )
      .map(toEmployee);
    const allEmployees = context.payrollEmployees.filter(
      (item) => item.clinicId === clinicId,
    );
    // Comissão segue o colaborador (a filial dele); sem colaborador, a do profissional.
    const inSelection = (professionalId: string) => {
      const employee = allEmployees.find(
        (item) => item.professionalId === professionalId,
      );
      if (employee) return selected.has(employee.branchId);
      const professional = context.professionals.find(
        (item) => item.id === professionalId,
      );
      return Boolean(
        professional && selected.has(context.branchOf(professional)),
      );
    };
    const payables = context.payables.filter(
      (item) =>
        item.clinicId === clinicId &&
        item.status !== "cancelled" &&
        item.payroll?.competence === competence &&
        employees.some((employee) => employee.id === item.payroll!.employeeId),
    );
    return buildPayroll({
      competence,
      branches: branches.map((item) => ({ id: item.id, name: item.name })),
      employees,
      commissions: context.commissions
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.competence === competence &&
            inSelection(item.professionalId),
        )
        .map((item) => {
          const service = context.services.find(
            (entry) => entry.id === item.serviceId,
          );
          return { ...item, ...(service ? { serviceName: service.name } : {}) };
        }),
      adjustments: context.commissionAdjustments.filter(
        (item) =>
          item.clinicId === clinicId &&
          item.competence === competence &&
          inSelection(item.professionalId),
      ),
      entries: context.payrollEntries
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.competence === competence &&
            employees.some((employee) => employee.id === item.employeeId),
        )
        .map(toEntry),
      payables,
      expenseCommissionIds: new Set(
        context.payables
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              item.commissionId &&
              item.status !== "cancelled",
          )
          .map((item) => item.commissionId!),
      ),
      professionals: context.professionals
        .filter((item) => item.clinicId === clinicId)
        .map((item) => ({
          id: item.id,
          fullName: item.fullName,
          branchId: context.branchOf(item),
        })),
    });
  };
  /** Categoria "Folha de pagamento": reaproveita (e reativa) a existente ou cria. */
  const defaultCategory = (clinicId: string) => {
    const name = PAYROLL_CATEGORY_NAME.toLocaleLowerCase();
    const existing = context.financialCategories.find(
      (item) =>
        item.clinicId === clinicId &&
        item.kind === "expense" &&
        item.name.toLocaleLowerCase() === name,
    );
    if (existing) {
      existing.active = true;
      return existing;
    }
    const category: FinancialCategory = {
      id: uuid(),
      clinicId,
      name: PAYROLL_CATEGORY_NAME,
      kind: "expense",
      dreGroup: "fixed_expense",
      active: true,
    };
    context.financialCategories.push(category);
    return category;
  };
  return {
    async listPayrollEmployees(clinicId: string) {
      const readIds = context.branchScope.readIds();
      return context.payrollEmployees
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            (!readIds || readIds.includes(item.branchId)),
        )
        .map(toEmployee)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },
    async updatePayrollEmployee(
      clinicId: string,
      actorId: string,
      id: string,
      input: PayrollEmployeeInput,
    ) {
      const record = context.payrollEmployees.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (!record) return null;
      if (record.userId) throw userManagedEmployeeError();
      context.assertBranchInScope(record.branchId);
      if (input.baseSalaryInCents !== record.baseSalaryInCents)
        throw payrollSalaryImmutableError();
      const branchId = validateEmployee(clinicId, input, id);
      const previous = toEmployee(record);
      record.branchId = branchId;
      record.name = input.name;
      if (input.role) record.role = input.role;
      else delete record.role;
      if (input.professionalId) record.professionalId = input.professionalId;
      else delete record.professionalId;
      record.baseSalaryInCents = input.baseSalaryInCents;
      record.active = input.active;
      record.updatedAt = now();
      context.recordAudit(
        clinicId,
        actorId,
        "payroll.employee_updated",
        "payroll_employee",
        {
          name: record.name,
          baseSalaryInCents: record.baseSalaryInCents,
          previousBaseSalaryInCents: previous.baseSalaryInCents,
          active: record.active,
        },
        record.id,
      );
      return toEmployee(record);
    },
    async getPayroll(
      clinicId: string,
      competence: string,
      branchIds?: string[],
    ) {
      return structuredClone(summary(clinicId, competence, branchIds));
    },
    async launchPayroll(
      clinicId: string,
      actorId: string,
      input: PayrollLaunchInput,
    ) {
      const category = input.categoryId
          ? context.financialCategories.find(
              (item) =>
                item.clinicId === clinicId &&
                item.id === input.categoryId &&
                item.kind === "expense" &&
                item.active,
            )
          : defaultCategory(clinicId),
        costCenter = input.costCenterId
          ? context.costCenters.find(
              (item) =>
                item.clinicId === clinicId &&
                item.id === input.costCenterId &&
                item.active,
            )
          : undefined;
      if (!category || (input.costCenterId && !costCenter))
        throw new DomainError(
          "FINANCIAL_CLASSIFICATION_NOT_FOUND",
          "Categoria de despesa ou centro de custo não encontrado.",
          404,
        );
      const current = summary(clinicId, input.competence, input.branchIds);
      const plan = payrollLaunchTotals(current, input.employeeIds);
      const timestamp = now(),
        postedOn = clinicDateOf(
          new Date(timestamp),
          context.clinicSettings.timezone,
        );
      const payables: Payable[] = plan.launch.map((entry) => {
        const payable: Payable = {
          id: uuid(),
          clinicId,
          branchId: entry.line.employee.branchId,
          description: payrollPayableDescription(
            input.competence,
            entry.line.employee.name,
            entry.complement,
          ),
          notes: payrollPayableNotes(entry.items),
          categoryId: category.id,
          categoryName: category.name,
          ...(costCenter
            ? { costCenterId: costCenter.id, costCenterName: costCenter.name }
            : {}),
          dueDate: input.dueDate,
          amountInCents: entry.amountInCents,
          postedOn,
          dreCompetence: input.competence,
          status: "open",
          overdue: input.dueDate < today(),
          createdAt: timestamp,
          updatedAt: timestamp,
          payroll: {
            employeeId: entry.line.employee.id,
            employeeName: entry.line.employee.name,
            competence: input.competence,
            salaryInCents: entry.salaryInCents,
            commissionInCents: entry.commissionInCents,
          },
        };
        context.payables.push(payable);
        for (const item of entry.items) {
          if (
            item.kind === "bonus" ||
            item.kind === "discount" ||
            item.kind === "advance"
          )
            context.payrollEntries.find(
              (row) => row.id === item.id,
            )!.payrollPayableId = payable.id;
          if (item.kind === "commission") {
            const commission = context.commissions.find(
              (row) => row.id === item.id,
            )!;
            commission.payrollPayableId = payable.id;
          }
          if (item.kind === "adjustment") {
            const adjustment = context.commissionAdjustments.find(
              (row) => row.id === item.id,
            )!;
            adjustment.payrollPayableId = payable.id;
          }
        }
        return payable;
      });
      context.recordAudit(clinicId, actorId, "payroll.launched", "payroll", {
        competence: input.competence,
        payableIds: payables.map((item) => item.id),
        totalInCents: payables.reduce(
          (sum, item) => sum + item.amountInCents,
          0,
        ),
        skipped: plan.skipped,
      });
      return structuredClone({ payables, skipped: plan.skipped });
    },
    async createPayrollEntry(
      clinicId: string,
      actorId: string,
      input: PayrollEntryInput,
    ) {
      const employee = context.payrollEmployees.find(
        (item) => item.clinicId === clinicId && item.id === input.employeeId,
      );
      if (!employee) return null;
      context.assertBranchInScope(employee.branchId);
      if (input.mode === "percent" && employee.baseSalaryInCents <= 0)
        throw payrollEntryNoSalaryError();
      const amountInCents = payrollEntryAmount(
        input.mode,
        input.value,
        employee.baseSalaryInCents,
      );
      if (amountInCents < 1) throw payrollEntryNoSalaryError();
      if (amountInCents > 2147483647) throw payrollEntryLimitError();
      const entry = {
        id: uuid(),
        clinicId,
        employeeId: employee.id,
        competence: input.competence,
        kind: input.kind,
        mode: input.mode,
        value: input.value,
        amountInCents,
        reason: input.reason,
        createdAt: now(),
        createdByUserId: actorId,
      };
      context.payrollEntries.push(entry);
      context.recordAudit(
        clinicId,
        actorId,
        "payroll.entry_created",
        "payroll_employee",
        {
          entryId: entry.id,
          competence: entry.competence,
          kind: entry.kind,
          mode: entry.mode,
          value: entry.value,
          amountInCents,
          reason: entry.reason,
        },
        employee.id,
      );
      return toEntry(entry);
    },
    async deletePayrollEntry(
      clinicId: string,
      actorId: string,
      entryId: string,
    ) {
      const index = context.payrollEntries.findIndex(
        (item) => item.clinicId === clinicId && item.id === entryId,
      );
      const entry = context.payrollEntries[index];
      if (!entry) return false;
      const employee = context.payrollEmployees.find(
        (item) => item.id === entry.employeeId,
      )!;
      context.assertBranchInScope(employee.branchId);
      if (entry.kind === "advance") throw payrollAdvanceManagedError();
      if (entry.payrollPayableId) throw payrollEntryLaunchedError();
      context.payrollEntries.splice(index, 1);
      context.recordAudit(
        clinicId,
        actorId,
        "payroll.entry_deleted",
        "payroll_employee",
        {
          entryId,
          competence: entry.competence,
          kind: entry.kind,
          amountInCents: entry.amountInCents,
          reason: entry.reason,
        },
        employee.id,
      );
      return true;
    },
    async createPayrollAdvance(
      clinicId: string,
      actorId: string,
      input: PayrollAdvanceInput,
    ) {
      const employee = context.payrollEmployees.find(
        (item) => item.clinicId === clinicId && item.id === input.employeeId,
      );
      if (!employee) return null;
      context.assertBranchInScope(employee.branchId);
      if (!employee.active) throw payrollAdvanceInactiveError();
      const category = defaultCategory(clinicId);
      const name = toEmployee(employee).name;
      const timestamp = now(),
        paidOn = clinicDateOf(
          new Date(input.paidAt ?? timestamp),
          context.clinicSettings.timezone,
        );
      const reason = input.reason?.trim() ?? "";
      const entryId = uuid();
      const payable: Payable = {
        id: uuid(),
        clinicId,
        branchId: employee.branchId,
        description: payrollAdvanceDescription(name, input.competence),
        ...(reason ? { notes: reason } : {}),
        categoryId: category.id,
        categoryName: category.name,
        dueDate: paidOn,
        amountInCents: input.amountInCents,
        postedOn: paidOn,
        dreCompetence: input.competence,
        status: "open",
        overdue: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        payrollAdvance: {
          entryId,
          employeeId: employee.id,
          employeeName: name,
          competence: input.competence,
        },
      };
      context.payables.push(payable);
      context.changePayable(
        clinicId,
        payable.id,
        "payment",
        input.paymentMethod ?? "pix",
        input.paidAt ? { paidAt: input.paidAt } : undefined,
      );
      const entry = {
        id: entryId,
        clinicId,
        employeeId: employee.id,
        competence: input.competence,
        kind: "advance" as const,
        mode: "amount" as const,
        value: input.amountInCents,
        amountInCents: input.amountInCents,
        reason,
        advancePayableId: payable.id,
        createdAt: timestamp,
        createdByUserId: actorId,
      };
      context.payrollEntries.push(entry);
      context.recordAudit(
        clinicId,
        actorId,
        "payroll.advance_created",
        "payroll_employee",
        {
          entryId,
          payableId: payable.id,
          competence: input.competence,
          amountInCents: input.amountInCents,
          paidOn,
          reason,
        },
        employee.id,
      );
      return toEntry(entry);
    },
    async deletePayrollAdvance(
      clinicId: string,
      actorId: string,
      entryId: string,
    ) {
      const index = context.payrollEntries.findIndex(
        (item) =>
          item.clinicId === clinicId &&
          item.id === entryId &&
          item.kind === "advance",
      );
      const entry = context.payrollEntries[index];
      if (!entry) return false;
      const employee = context.payrollEmployees.find(
        (item) => item.id === entry.employeeId,
      )!;
      context.assertBranchInScope(employee.branchId);
      if (entry.payrollPayableId) throw payrollEntryLaunchedError();
      const payable = context.payables.find(
        (item) => item.id === entry.advancePayableId,
      );
      if (payable) {
        if (payable.status === "paid")
          context.changePayable(clinicId, payable.id, "payment_reversal");
        payable.status = "cancelled";
        payable.overdue = false;
        payable.updatedAt = now();
        // Como no MySQL: o vale apagado deixa de ligar a despesa (a descrição continua).
        delete payable.payrollAdvance;
      }
      context.payrollEntries.splice(index, 1);
      context.recordAudit(
        clinicId,
        actorId,
        "payroll.advance_deleted",
        "payroll_employee",
        {
          entryId,
          ...(payable ? { payableId: payable.id } : {}),
          competence: entry.competence,
          amountInCents: entry.amountInCents,
          reason: entry.reason,
        },
        employee.id,
      );
      return true;
    },
    async cancelPayrollLaunch(
      clinicId: string,
      actorId: string,
      payableId: string,
    ) {
      const payable = context.payables.find(
        (item) =>
          item.clinicId === clinicId && item.id === payableId && item.payroll,
      );
      if (!payable || !context.inBranchScope(payable)) return null;
      if (payable.status !== "open")
        throw new DomainError(
          "PAYROLL_LAUNCH_NOT_OPEN",
          "Só dá para desfazer o lançamento de uma despesa da folha ainda não paga.",
          409,
        );
      payable.status = "cancelled";
      payable.overdue = false;
      payable.updatedAt = now();
      for (const item of context.commissions)
        if (item.payrollPayableId === payable.id) delete item.payrollPayableId;
      for (const item of context.commissionAdjustments)
        if (item.payrollPayableId === payable.id) delete item.payrollPayableId;
      for (const item of context.payrollEntries)
        if (item.payrollPayableId === payable.id) delete item.payrollPayableId;
      context.recordAudit(
        clinicId,
        actorId,
        "payroll.launch_cancelled",
        "payable",
        {
          competence: payable.payroll!.competence,
          employeeId: payable.payroll!.employeeId,
          amountInCents: payable.amountInCents,
        },
        payable.id,
      );
      return structuredClone(payable);
    },
  };
}
