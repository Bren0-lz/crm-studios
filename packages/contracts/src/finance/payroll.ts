import { z } from "zod";
import { competenceMonthSchema } from "../common/model.js";

/**
 * Folha de pagamento: só a parte salarial dos colaboradores. Cada colaborador tem um
 * salário fixo mensal; quem é profissional ligado soma as comissões da competência.
 */
export const payrollEmployeeInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do colaborador.")
    .max(160, "O nome pode ter até 160 caracteres."),
  role: z
    .string()
    .trim()
    .max(100, "O cargo pode ter até 100 caracteres.")
    .optional()
    .or(z.literal("")),
  /** Profissional cujas comissões entram na folha. */
  professionalId: z.uuid().optional(),
  baseSalaryInCents: z
    .number("Informe o salário fixo.")
    .int("Informe o salário fixo.")
    .min(0, "O salário fixo não pode ser negativo."),
  active: z.boolean().default(true),
});

export const payrollFilterSchema = z.object({
  competence: competenceMonthSchema.optional(),
});

export type PayrollEmployeeInput = z.infer<typeof payrollEmployeeInputSchema>;

export interface PayrollEmployee {
  id: string;
  clinicId: string;
  name: string;
  role?: string;
  professionalId?: string;
  professionalName?: string;
  baseSalaryInCents: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollLine {
  employee: PayrollEmployee;
  baseSalaryInCents: number;
  commissionInCents: number;
  /** Comissões da competência consideradas na linha. */
  commissionCount: number;
  totalInCents: number;
}

/** Folha de uma competência (`GET /finance/payroll?competence=AAAA-MM`). */
export interface PayrollSummary {
  competence: string;
  lines: PayrollLine[];
  baseSalaryInCents: number;
  commissionInCents: number;
  totalInCents: number;
}

/**
 * Monta a folha da competência: colaboradores ativos, salário fixo + comissões do mês do
 * profissional ligado (abertas ou pagas). Colaborador sem profissional não soma comissão.
 */
export function buildPayroll(
  employees: readonly PayrollEmployee[],
  commissions: readonly {
    professionalId: string;
    competence: string;
    amountInCents: number;
  }[],
  competence: string,
): PayrollSummary {
  const lines = employees
    .filter((employee) => employee.active)
    .map((employee): PayrollLine => {
      const entries = employee.professionalId
        ? commissions.filter(
            (item) =>
              item.professionalId === employee.professionalId &&
              item.competence === competence,
          )
        : [];
      const commissionInCents = entries.reduce(
        (sum, item) => sum + item.amountInCents,
        0,
      );
      return {
        employee,
        baseSalaryInCents: employee.baseSalaryInCents,
        commissionInCents,
        commissionCount: entries.length,
        totalInCents: employee.baseSalaryInCents + commissionInCents,
      };
    })
    .sort((a, b) => a.employee.name.localeCompare(b.employee.name, "pt-BR"));
  return {
    competence,
    lines,
    baseSalaryInCents: lines.reduce(
      (sum, line) => sum + line.baseSalaryInCents,
      0,
    ),
    commissionInCents: lines.reduce(
      (sum, line) => sum + line.commissionInCents,
      0,
    ),
    totalInCents: lines.reduce((sum, line) => sum + line.totalInCents, 0),
  };
}
