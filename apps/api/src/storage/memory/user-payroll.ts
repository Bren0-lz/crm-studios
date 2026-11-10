import type { AuthenticatedUser } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";
import type { PayrollEmployeeRecord } from "./payroll.js";

/**
 * Colaborador da folha que pertence ao usuário: nasce e muda só pelo cadastro do usuário
 * ("recebe salário" e quanto). Nome, cargo, profissional e filial seguem o usuário; sem salário
 * o colaborador fica inativo (só aparece na folha com comissões do profissional ligado).
 * `salaryInCents` ausente mantém o salário gravado; `null` = não recebe.
 */
export function syncUserPayroll(
  context: MemoryRepositoryContext,
  actorUserId: string,
  user: AuthenticatedUser,
  salaryInCents: number | null | undefined,
) {
  const clinicId = user.clinicId;
  const professional = context.linkedProfessional(clinicId, user.id);
  let record = context.payrollEmployees.find(
    (item) => item.clinicId === clinicId && item.userId === user.id,
  );
  // Colaborador cadastrado antes, já ligado ao profissional do usuário: passa a ser dele.
  if (!record && professional)
    record = context.payrollEmployees.find(
      (item) =>
        item.clinicId === clinicId &&
        !item.userId &&
        item.professionalId === professional.id,
    );
  const baseSalaryInCents =
    salaryInCents === undefined
      ? (record?.baseSalaryInCents ?? 0)
      : (salaryInCents ?? 0);
  if (!record && baseSalaryInCents <= 0 && !professional) return;
  // Um colaborador por profissional: o vínculo antigo de outro colaborador sai.
  if (professional)
    for (const other of context.payrollEmployees)
      if (
        other !== record &&
        other.clinicId === clinicId &&
        other.professionalId === professional.id
      )
        delete other.professionalId;
  const branchId = professional
    ? context.branchOf(professional)
    : (record?.branchId ??
      (user.allBranches === false ? user.branchIds?.[0] : undefined) ??
      context.defaultBranchId(clinicId));
  const timestamp = now();
  const previous = record ? { ...record } : undefined;
  if (!record) {
    record = {
      id: uuid(),
      clinicId,
      branchId,
      name: user.fullName,
      baseSalaryInCents,
      active: false,
      createdByUserId: actorUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies PayrollEmployeeRecord;
    context.payrollEmployees.push(record);
  }
  record.userId = user.id;
  record.branchId = branchId;
  record.name = user.fullName;
  if (user.jobTitle) record.role = user.jobTitle;
  else delete record.role;
  if (professional) record.professionalId = professional.id;
  else delete record.professionalId;
  record.baseSalaryInCents = baseSalaryInCents;
  record.active = user.active && baseSalaryInCents > 0;
  record.updatedAt = timestamp;
  // Auditado só o que muda o salário (o colaborador só de comissões nasce sem registro).
  if (
    previous
      ? previous.baseSalaryInCents !== record.baseSalaryInCents ||
        previous.active !== record.active
      : baseSalaryInCents > 0
  )
    context.recordAudit(
      clinicId,
      actorUserId,
      previous ? "payroll.employee_updated" : "payroll.employee_created",
      "payroll_employee",
      {
        name: record.name,
        userId: user.id,
        baseSalaryInCents: record.baseSalaryInCents,
        ...(previous
          ? { previousBaseSalaryInCents: previous.baseSalaryInCents }
          : {}),
        active: record.active,
      },
      record.id,
    );
}
