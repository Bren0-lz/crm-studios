import {
  buildPayroll,
  payrollPayableDescription,
  payrollPayableNotes,
  type PayrollEmployee,
  type PayrollEmployeeInput,
  type PayrollLaunchInput,
} from "@crm/contracts";
import type { Pool, PoolClient } from "pg";
import { DomainError } from "../../repository.js";
import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import { payrollLaunchTotals } from "../../modules/finance/payroll.js";
import { loadCommissionAdjustments } from "./commission-reconciliation.js";
import type { PostgresRepositoryContext } from "./context.js";
import {
  hasDatabaseCode,
  mapPayable,
  payableColumns,
  type PayableRow,
} from "./mappers/finance.js";

type EmployeeRow = {
  id: string;
  clinicId: string;
  branchId: string;
  branchName: string | null;
  name: string;
  role: string | null;
  professionalId: string | null;
  professionalName: string | null;
  baseSalaryInCents: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};
const employeeSelect = `SELECT pe.id,pe.clinic_id AS "clinicId",pe.branch_id AS "branchId",b.name AS "branchName",pe.name,pe.role,
  pe.professional_id AS "professionalId",pr.full_name AS "professionalName",pe.base_salary_in_cents AS "baseSalaryInCents",
  pe.active,pe.created_at AS "createdAt",pe.updated_at AS "updatedAt"
  FROM payroll_employees pe
  LEFT JOIN branches b ON b.id=pe.branch_id
  LEFT JOIN professionals pr ON pr.id=pe.professional_id`;
const mapEmployee = (row: EmployeeRow): PayrollEmployee => ({
  id: row.id,
  clinicId: row.clinicId,
  branchId: row.branchId,
  ...(row.branchName ? { branchName: row.branchName } : {}),
  name: row.name,
  ...(row.role ? { role: row.role } : {}),
  ...(row.professionalId ? { professionalId: row.professionalId } : {}),
  ...(row.professionalName ? { professionalName: row.professionalName } : {}),
  baseSalaryInCents: row.baseSalaryInCents,
  active: row.active,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Folha de pagamento (PostgreSQL): colaboradores, a folha da competência por filial, o
 * lançamento (uma despesa por colaborador com o que está pendente) e o desfazer.
 */
export function createPayrollRepository(context: PostgresRepositoryContext) {
  async function findEmployee(
    client: Pool | PoolClient,
    clinicId: string,
    id: string,
  ) {
    const result = await client.query<EmployeeRow>(
      `${employeeSelect} WHERE pe.clinic_id=$1 AND pe.id=$2`,
      [clinicId, id],
    );
    return result.rows[0] ? mapEmployee(result.rows[0]) : null;
  }
  function assertBranchInScope(branchId: string) {
    const ids = context.branchReadIds();
    if (ids && !ids.includes(branchId))
      throw new DomainError(
        "BRANCH_ACCESS_DENIED",
        "Este registro é de uma filial que não está selecionada.",
        403,
      );
  }
  async function employeeBranch(
    client: PoolClient,
    clinicId: string,
    input: PayrollEmployeeInput,
  ) {
    const professional = input.professionalId
      ? (
          await client.query<{ branchId: string }>(
            `SELECT branch_id AS "branchId" FROM professionals WHERE clinic_id=$1 AND id=$2`,
            [clinicId, input.professionalId],
          )
        ).rows[0]
      : undefined;
    if (input.professionalId && !professional)
      throw new DomainError(
        "PROFESSIONAL_NOT_FOUND",
        "Profissional não encontrado.",
        404,
      );
    if (
      input.branchId &&
      !(
        await client.query(
          "SELECT id FROM branches WHERE clinic_id=$1 AND id=$2",
          [clinicId, input.branchId],
        )
      ).rowCount
    )
      throw new DomainError("BRANCH_NOT_FOUND", "Filial não encontrada.", 404);
    const branchId =
      input.branchId ??
      professional?.branchId ??
      context.branchWriteId() ??
      (
        await client.query<{ id: string }>(
          "SELECT id FROM branches WHERE clinic_id=$1 AND is_default",
          [clinicId],
        )
      ).rows[0]!.id;
    if (professional && professional.branchId !== branchId)
      throw new DomainError(
        "BRANCH_MISMATCH",
        "O colaborador precisa ser da mesma filial do profissional.",
        409,
      );
    assertBranchInScope(branchId);
    return branchId;
  }
  function takenProfessional(error: unknown): never {
    if (hasDatabaseCode(error, "23505"))
      throw new DomainError(
        "PAYROLL_PROFESSIONAL_TAKEN",
        "Este profissional já está na folha de outro colaborador.",
        409,
      );
    throw error;
  }
  /** Filiais permitidas na leitura em curso, filtradas pelas pedidas (403 fora do acesso). */
  async function selectedBranches(
    client: Pool | PoolClient,
    clinicId: string,
    requested?: string[],
  ) {
    const readIds = context.branchReadIds();
    const allowed = (
      await client.query<{ id: string; name: string }>(
        `SELECT id,name FROM branches WHERE clinic_id=$1 AND active AND ($2::uuid[] IS NULL OR id=ANY($2))
         ORDER BY is_default DESC,name`,
        [clinicId, readIds],
      )
    ).rows;
    if (requested?.some((id) => !allowed.some((branch) => branch.id === id)))
      throw new DomainError(
        "BRANCH_ACCESS_DENIED",
        "Uma das filiais escolhidas não está disponível para o seu usuário.",
        403,
      );
    return allowed.filter(
      (branch) => !requested?.length || requested.includes(branch.id),
    );
  }
  async function summary(
    client: Pool | PoolClient,
    clinicId: string,
    competence: string,
    branchIds?: string[],
  ) {
    const branches = await selectedBranches(client, clinicId, branchIds),
      selected = branches.map((item) => item.id);
    const [allEmployees, professionals, services, commissions, payables] =
      await Promise.all([
        client.query<EmployeeRow>(`${employeeSelect} WHERE pe.clinic_id=$1`, [
          clinicId,
        ]),
        client.query<{ id: string; fullName: string; branchId: string }>(
          `SELECT id,full_name AS "fullName",branch_id AS "branchId" FROM professionals WHERE clinic_id=$1`,
          [clinicId],
        ),
        client.query<{ id: string; name: string }>(
          "SELECT id,name FROM services WHERE clinic_id=$1",
          [clinicId],
        ),
        context.listCommissions(clinicId, competence, client),
        client.query<PayableRow>(
          `SELECT ${payableColumns} FROM payables py
           JOIN financial_categories fc ON fc.id = py.category_id
           LEFT JOIN cost_centers cc ON cc.id = py.cost_center_id
           WHERE py.clinic_id=$1 AND py.status<>'cancelled'
             AND (py.payroll_competence=$2 OR py.commission_id IS NOT NULL)`,
          [clinicId, competence],
        ),
      ]);
    const employees = allEmployees.rows.map(mapEmployee);
    const inSelection = (professionalId: string) => {
      const employee = employees.find(
        (item) => item.professionalId === professionalId,
      );
      if (employee) return selected.includes(employee.branchId);
      const professional = professionals.rows.find(
        (item) => item.id === professionalId,
      );
      return Boolean(professional && selected.includes(professional.branchId));
    };
    const visible = employees.filter((item) =>
      selected.includes(item.branchId),
    );
    const mapped = payables.rows.map(mapPayable);
    return buildPayroll({
      competence,
      branches,
      employees: visible,
      commissions: commissions
        .filter((item) => inSelection(item.professionalId))
        .map((item) => {
          const service = services.rows.find(
            (entry) => entry.id === item.serviceId,
          );
          return { ...item, ...(service ? { serviceName: service.name } : {}) };
        }),
      adjustments: (await loadCommissionAdjustments(client, clinicId)).filter(
        (item) =>
          item.competence === competence && inSelection(item.professionalId),
      ),
      payables: mapped.filter(
        (item) =>
          item.payroll?.competence === competence &&
          visible.some((employee) => employee.id === item.payroll!.employeeId),
      ),
      expenseCommissionIds: new Set(
        mapped.flatMap((item) =>
          item.commissionId ? [item.commissionId] : [],
        ),
      ),
      professionals: professionals.rows,
    });
  }
  return {
    async listPayrollEmployees(clinicId: string) {
      const result = await context.pool.query<EmployeeRow>(
        `${employeeSelect} WHERE pe.clinic_id=$1 AND ($2::uuid[] IS NULL OR pe.branch_id=ANY($2)) ORDER BY pe.name`,
        [clinicId, context.branchReadIds()],
      );
      return result.rows.map(mapEmployee);
    },
    async createPayrollEmployee(
      clinicId: string,
      actorId: string,
      input: PayrollEmployeeInput,
    ) {
      return context
        .inTransaction(async (client) => {
          const branchId = await employeeBranch(client, clinicId, input);
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO payroll_employees(clinic_id,branch_id,name,role,professional_id,base_salary_in_cents,active,created_by_user_id)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [
              clinicId,
              branchId,
              input.name,
              input.role || null,
              input.professionalId ?? null,
              input.baseSalaryInCents,
              input.active,
              actorId,
            ],
          );
          const id = inserted.rows[0]!.id;
          await context.addAdminAudit(
            client,
            clinicId,
            actorId,
            "payroll.employee_created",
            "payroll_employee",
            id,
            { name: input.name, baseSalaryInCents: input.baseSalaryInCents },
          );
          return (await findEmployee(client, clinicId, id))!;
        })
        .catch(takenProfessional);
    },
    async updatePayrollEmployee(
      clinicId: string,
      actorId: string,
      id: string,
      input: PayrollEmployeeInput,
    ) {
      return context
        .inTransaction(async (client) => {
          const previous = await findEmployee(client, clinicId, id);
          if (!previous) return null;
          assertBranchInScope(previous.branchId);
          const branchId = await employeeBranch(client, clinicId, input);
          await client.query(
            `UPDATE payroll_employees SET branch_id=$3,name=$4,role=$5,professional_id=$6,base_salary_in_cents=$7,active=$8,updated_at=now()
             WHERE clinic_id=$1 AND id=$2`,
            [
              clinicId,
              id,
              branchId,
              input.name,
              input.role || null,
              input.professionalId ?? null,
              input.baseSalaryInCents,
              input.active,
            ],
          );
          await context.addAdminAudit(
            client,
            clinicId,
            actorId,
            "payroll.employee_updated",
            "payroll_employee",
            id,
            {
              name: input.name,
              baseSalaryInCents: input.baseSalaryInCents,
              previousBaseSalaryInCents: previous.baseSalaryInCents,
              active: input.active,
            },
          );
          return findEmployee(client, clinicId, id);
        })
        .catch(takenProfessional);
    },
    async getPayroll(
      clinicId: string,
      competence: string,
      branchIds?: string[],
    ) {
      return summary(context.pool, clinicId, competence, branchIds);
    },
    async launchPayroll(
      clinicId: string,
      actorId: string,
      input: PayrollLaunchInput,
    ) {
      return context.inTransaction(async (client) => {
        // Mesmo lock da geração, da conciliação e dos pagamentos de comissão.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const classification = await client.query<{
          categoryId: string;
          costCenterId: string | null;
        }>(
          `SELECT fc.id AS "categoryId",cc.id AS "costCenterId" FROM financial_categories fc
           LEFT JOIN cost_centers cc ON cc.clinic_id=$1 AND cc.id=$3::uuid AND cc.active
           WHERE fc.clinic_id=$1 AND fc.id=$2 AND fc.kind='expense' AND fc.active
             AND ($3::uuid IS NULL OR cc.id IS NOT NULL)`,
          [clinicId, input.categoryId, input.costCenterId ?? null],
        );
        if (!classification.rows[0])
          throw new DomainError(
            "FINANCIAL_CLASSIFICATION_NOT_FOUND",
            "Categoria de despesa ou centro de custo não encontrado.",
            404,
          );
        const timezone =
          (
            await client.query<{ timezone: string }>(
              "SELECT timezone FROM clinics WHERE id=$1",
              [clinicId],
            )
          ).rows[0]?.timezone ?? "America/Sao_Paulo";
        const current = await summary(
          client,
          clinicId,
          input.competence,
          input.branchIds,
        );
        const plan = payrollLaunchTotals(current, input.employeeIds);
        const postedOn = clinicDateOf(new Date(), timezone);
        const ids: string[] = [];
        for (const entry of plan.launch) {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO payables
             (clinic_id,description,category_id,cost_center_id,due_date,amount_in_cents,notes,created_by_user_id,
              posted_on,dre_competence,branch_id,payroll_employee_id,payroll_competence,payroll_salary_in_cents,payroll_commission_in_cents)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12,$15,$13,$14) RETURNING id`,
            [
              clinicId,
              payrollPayableDescription(
                input.competence,
                entry.line.employee.name,
                entry.complement,
              ),
              input.categoryId,
              input.costCenterId ?? null,
              input.dueDate,
              entry.amountInCents,
              payrollPayableNotes(entry.items),
              actorId,
              postedOn,
              input.competence,
              entry.line.employee.branchId,
              entry.line.employee.id,
              entry.salaryInCents,
              entry.commissionInCents,
              input.competence,
            ],
          );
          const payableId = inserted.rows[0]!.id;
          ids.push(payableId);
          await client.query(
            `INSERT INTO payable_events(clinic_id,payable_id,actor_user_id,kind,amount_in_cents) VALUES($1,$2,$3,'created',$4)`,
            [clinicId, payableId, actorId, entry.amountInCents],
          );
          const commissionIds = entry.items
              .filter((item) => item.kind === "commission")
              .map((item) => item.id!),
            adjustmentIds = entry.items
              .filter((item) => item.kind === "adjustment")
              .map((item) => item.id!);
          const commissions = await client.query(
            `UPDATE commission_entries SET payroll_payable_id=$3
             WHERE clinic_id=$1 AND id=ANY($2::uuid[]) AND payroll_payable_id IS NULL AND status='open'`,
            [clinicId, commissionIds, payableId],
          );
          const adjustments = await client.query(
            `UPDATE commission_adjustments SET payroll_payable_id=$3
             WHERE clinic_id=$1 AND id=ANY($2::uuid[]) AND payroll_payable_id IS NULL AND status='open'`,
            [clinicId, adjustmentIds, payableId],
          );
          if (
            commissions.rowCount !== commissionIds.length ||
            adjustments.rowCount !== adjustmentIds.length
          )
            throw new DomainError(
              "PAYROLL_STALE",
              "As comissões mudaram durante o lançamento. Atualize a folha e tente de novo.",
              409,
            );
        }
        const payables = [];
        for (const id of ids)
          payables.push((await context.findPayable(client, clinicId, id))!);
        await context.addAdminAudit(
          client,
          clinicId,
          actorId,
          "payroll.launched",
          "payroll",
          undefined,
          {
            competence: input.competence,
            payableIds: ids,
            totalInCents: payables.reduce(
              (sum, item) => sum + item.amountInCents,
              0,
            ),
            skipped: plan.skipped,
          },
        );
        return { payables, skipped: plan.skipped };
      });
    },
    async cancelPayrollLaunch(
      clinicId: string,
      actorId: string,
      payableId: string,
    ) {
      return context.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const current = await client.query<{
          status: string;
          branchId: string;
          competence: string;
          employeeId: string;
          amountInCents: number;
        }>(
          `SELECT status,branch_id AS "branchId",payroll_competence AS competence,payroll_employee_id AS "employeeId",amount_in_cents AS "amountInCents"
           FROM payables WHERE clinic_id=$1 AND id=$2 AND payroll_employee_id IS NOT NULL FOR UPDATE`,
          [clinicId, payableId],
        );
        const row = current.rows[0];
        const readIds = context.branchReadIds();
        if (!row || (readIds && !readIds.includes(row.branchId))) return null;
        if (row.status !== "open")
          throw new DomainError(
            "PAYROLL_LAUNCH_NOT_OPEN",
            "Só dá para desfazer o lançamento de uma despesa da folha ainda não paga.",
            409,
          );
        await client.query(
          "UPDATE payables SET status='cancelled',updated_at=now() WHERE clinic_id=$1 AND id=$2",
          [clinicId, payableId],
        );
        await client.query(
          "UPDATE commission_entries SET payroll_payable_id=NULL WHERE clinic_id=$1 AND payroll_payable_id=$2",
          [clinicId, payableId],
        );
        await client.query(
          "UPDATE commission_adjustments SET payroll_payable_id=NULL WHERE clinic_id=$1 AND payroll_payable_id=$2",
          [clinicId, payableId],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorId,
          "payroll.launch_cancelled",
          "payable",
          payableId,
          {
            competence: row.competence,
            employeeId: row.employeeId,
            amountInCents: row.amountInCents,
          },
        );
        return context.findPayable(client, clinicId, payableId);
      });
    },
  };
}
