import {
  buildPayroll,
  payrollPayableDescription,
  payrollPayableNotes,
  type Payable,
  type PayrollEmployee,
  type PayrollEmployeeInput,
  type PayrollLaunchInput,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import { payrollLaunchTotals } from "../../modules/finance/payroll.js";
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
  baseSalaryInCents: number;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

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
    return {
      id: record.id,
      clinicId: record.clinicId,
      branchId: record.branchId,
      ...(branch ? { branchName: branch.name } : {}),
      name: record.name,
      ...(record.role ? { role: record.role } : {}),
      ...(record.professionalId
        ? { professionalId: record.professionalId }
        : {}),
      ...(professional ? { professionalName: professional.fullName } : {}),
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
    async createPayrollEmployee(
      clinicId: string,
      actorId: string,
      input: PayrollEmployeeInput,
    ) {
      const branchId = validateEmployee(clinicId, input),
        timestamp = now();
      const record: PayrollEmployeeRecord = {
        id: uuid(),
        clinicId,
        branchId,
        name: input.name,
        ...(input.role ? { role: input.role } : {}),
        ...(input.professionalId
          ? { professionalId: input.professionalId }
          : {}),
        baseSalaryInCents: input.baseSalaryInCents,
        active: input.active,
        createdByUserId: actorId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      context.payrollEmployees.push(record);
      context.recordAudit(
        clinicId,
        actorId,
        "payroll.employee_created",
        "payroll_employee",
        { name: record.name, baseSalaryInCents: record.baseSalaryInCents },
        record.id,
      );
      return toEmployee(record);
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
      context.assertBranchInScope(record.branchId);
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
      const category = context.financialCategories.find(
          (item) =>
            item.clinicId === clinicId &&
            item.id === input.categoryId &&
            item.kind === "expense" &&
            item.active,
        ),
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
