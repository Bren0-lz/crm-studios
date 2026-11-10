import { randomUUID } from "node:crypto";
import type { PoolClient } from "../../infrastructure/mysql-client.js";
import type { MysqlRepositoryContext } from "./context.js";
import { defaultBranchOf } from "./sql.js";

type UserPayrollRow = {
  fullName: string;
  jobTitle: string | null;
  active: boolean;
  allBranches: boolean;
  firstBranchId: string | null;
  professionalId: string | null;
  professionalBranchId: string | null;
};

type EmployeeRow = {
  id: string;
  branchId: string;
  baseSalaryInCents: number;
  active: boolean;
};

/**
 * Colaborador da folha que pertence ao usuário: nasce e muda só pelo cadastro do usuário
 * ("recebe salário" e quanto). Nome, cargo, profissional e filial seguem o usuário; sem salário
 * o colaborador fica inativo (só aparece na folha com comissões do profissional ligado).
 * `salaryInCents` ausente mantém o salário gravado; `null` = não recebe. Roda na transação do
 * salvamento do usuário (que já trava a clínica).
 */
export async function syncUserPayroll(
  context: MysqlRepositoryContext,
  client: PoolClient,
  clinicId: string,
  actorUserId: string,
  userId: string,
  salaryInCents: number | null | undefined,
) {
  const user = (
    await client.query<UserPayrollRow>(
      `SELECT u.full_name AS "fullName",u.job_title AS "jobTitle",u.active,u.all_branches AS "allBranches",
         (SELECT ub.branch_id FROM user_branches ub WHERE ub.user_id=u.id ORDER BY ub.branch_id LIMIT 1) AS "firstBranchId",
         p.id AS "professionalId",p.branch_id AS "professionalBranchId"
       FROM users u
       LEFT JOIN professionals p ON p.id=(SELECT pr.id FROM professionals pr
         WHERE pr.clinic_id=u.clinic_id AND pr.user_id=u.id ORDER BY pr.created_at,pr.id LIMIT 1)
       WHERE u.clinic_id=$1 AND u.id=$2`,
      [clinicId, userId],
    )
  ).rows[0];
  if (!user) return;
  const employeeColumns = `id,branch_id AS "branchId",base_salary_in_cents AS "baseSalaryInCents",active`;
  let current = (
    await client.query<EmployeeRow>(
      `SELECT ${employeeColumns} FROM payroll_employees WHERE clinic_id=$1 AND user_id=$2 FOR UPDATE`,
      [clinicId, userId],
    )
  ).rows[0];
  // Colaborador cadastrado antes, já ligado ao profissional do usuário: passa a ser dele.
  if (!current && user.professionalId)
    current = (
      await client.query<EmployeeRow>(
        `SELECT ${employeeColumns} FROM payroll_employees
         WHERE clinic_id=$1 AND user_id IS NULL AND professional_id=$2 FOR UPDATE`,
        [clinicId, user.professionalId],
      )
    ).rows[0];
  const baseSalaryInCents =
    salaryInCents === undefined
      ? (current?.baseSalaryInCents ?? 0)
      : (salaryInCents ?? 0);
  if (!current && baseSalaryInCents <= 0 && !user.professionalId) return;
  const id = current?.id ?? randomUUID();
  // Um colaborador por profissional: o vínculo antigo de outro colaborador sai.
  if (user.professionalId)
    await client.query(
      `UPDATE payroll_employees SET professional_id=NULL,updated_at=NOW(6)
       WHERE clinic_id=$1 AND professional_id=$2 AND id<>$3`,
      [clinicId, user.professionalId, id],
    );
  const branchId =
    user.professionalBranchId ??
    current?.branchId ??
    (user.allBranches ? null : user.firstBranchId);
  const active = Boolean(user.active) && baseSalaryInCents > 0;
  const values = [
    clinicId,
    id,
    branchId,
    user.fullName,
    user.jobTitle || null,
    user.professionalId,
    baseSalaryInCents,
    active,
    userId,
  ];
  if (current)
    await client.query(
      `UPDATE payroll_employees SET branch_id=COALESCE($3,${defaultBranchOf("$1")}),name=$4,role=$5,
         professional_id=$6,base_salary_in_cents=$7,active=$8,user_id=$9,updated_at=NOW(6)
       WHERE clinic_id=$1 AND id=$2`,
      values,
    );
  else
    await client.query(
      `INSERT INTO payroll_employees(clinic_id,id,branch_id,name,role,professional_id,base_salary_in_cents,
         active,user_id,created_by_user_id)
       VALUES($1,$2,COALESCE($3,${defaultBranchOf("$1")}),$4,$5,$6,$7,$8,$9,$10)`,
      [...values, actorUserId],
    );
  // Auditado só o que muda o salário (o colaborador só de comissões nasce sem registro).
  if (
    current
      ? current.baseSalaryInCents !== baseSalaryInCents ||
        Boolean(current.active) !== active
      : baseSalaryInCents > 0
  )
    await context.addAdminAudit(
      client,
      clinicId,
      actorUserId,
      current ? "payroll.employee_updated" : "payroll.employee_created",
      "payroll_employee",
      id,
      {
        name: user.fullName,
        userId,
        baseSalaryInCents,
        ...(current
          ? { previousBaseSalaryInCents: current.baseSalaryInCents }
          : {}),
        active,
      },
    );
}
