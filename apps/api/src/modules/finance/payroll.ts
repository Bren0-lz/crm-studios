import type { PayrollItem, PayrollLine, PayrollSummary } from "@crm/contracts";
import { DomainError } from "../../repository.js";

/** Despesa que o lançamento cria para um colaborador. */
export interface PayrollLaunchEntry {
  line: PayrollLine;
  /** Itens pendentes incluídos na despesa. */
  items: PayrollItem[];
  amountInCents: number;
  /** Salário + recompensas − descontos (custo de pessoal na DRE). */
  salaryInCents: number;
  /** Comissões + ajustes incluídos. */
  commissionInCents: number;
  /** Já havia despesa da folha para o colaborador na competência. */
  complement: boolean;
}

/**
 * O que o lançamento cria: uma despesa por colaborador com tudo o que está pendente na
 * competência. Pendente que soma zero ou negativo (ajustes de desconto maiores que o resto)
 * fica para depois e volta em `skipped`. Nada para lançar = PAYROLL_NOTHING_PENDING (409).
 */
export function payrollLaunchTotals(
  summary: PayrollSummary,
  employeeIds?: string[],
) {
  const launch: PayrollLaunchEntry[] = [];
  const skipped: {
    employeeId: string;
    employeeName: string;
    pendingInCents: number;
  }[] = [];
  for (const line of summary.branches.flatMap((branch) => branch.lines)) {
    if (employeeIds && !employeeIds.includes(line.employee.id)) continue;
    const items = line.items.filter((item) => item.status === "pending");
    if (!items.length) continue;
    const sum = (kinds: PayrollItem["kind"][]) =>
      items
        .filter((item) => kinds.includes(item.kind))
        .reduce((total, item) => total + item.amountInCents, 0);
    const amountInCents = sum([
      "salary",
      "commission",
      "adjustment",
      "bonus",
      "discount",
    ]);
    if (amountInCents <= 0) {
      skipped.push({
        employeeId: line.employee.id,
        employeeName: line.employee.name,
        pendingInCents: amountInCents,
      });
      continue;
    }
    if (amountInCents > 2147483647)
      throw new DomainError(
        "PAYROLL_AMOUNT_LIMIT",
        "O valor da folha excede o limite financeiro permitido.",
        409,
      );
    launch.push({
      line,
      items,
      amountInCents,
      salaryInCents: sum(["salary", "bonus", "discount"]),
      commissionInCents: sum(["commission", "adjustment"]),
      complement: line.payables.length > 0,
    });
  }
  if (!launch.length)
    throw new DomainError(
      "PAYROLL_NOTHING_PENDING",
      skipped.length
        ? "Os valores pendentes desta folha somam zero ou menos (ajustes de desconto); nada foi lançado."
        : "Não há valores pendentes para lançar nesta folha.",
      409,
    );
  return { launch, skipped };
}

/** Recusa mexer na comissão por fora da folha (pagar, conciliar a conta ou despesa avulsa). */
export function payrollOnlyError() {
  return new DomainError(
    "COMMISSION_PAID_BY_PAYROLL",
    "O pagamento de comissões é feito pela folha de pagamento (Financeiro › Folha).",
    409,
  );
}

/** O colaborador ligado a um usuário só muda pelo cadastro do usuário (Administração). */
export function userManagedEmployeeError() {
  return new DomainError(
    "PAYROLL_EMPLOYEE_MANAGED_BY_USER",
    "O salário deste colaborador é definido no cadastro do usuário (Administração › Usuários).",
    409,
  );
}

/** O salário fixo não muda pela folha: diferenças entram como desconto ou recompensa. */
export function payrollSalaryImmutableError() {
  return new DomainError(
    "PAYROLL_SALARY_IMMUTABLE",
    "O salário fixo não muda pela folha. Use um desconto ou uma recompensa.",
    409,
  );
}

export function payrollEntryNoSalaryError() {
  return new DomainError(
    "PAYROLL_ENTRY_NO_SALARY",
    "Este colaborador não tem salário fixo para calcular a porcentagem. Informe o valor em reais.",
    409,
  );
}

export function payrollEntryLaunchedError() {
  return new DomainError(
    "PAYROLL_ENTRY_LAUNCHED",
    "Este lançamento já está numa despesa da folha. Desfaça o lançamento antes de removê-lo.",
    409,
  );
}

export function payrollEntryLimitError() {
  return new DomainError(
    "PAYROLL_AMOUNT_LIMIT",
    "O valor excede o limite financeiro permitido.",
    409,
  );
}
