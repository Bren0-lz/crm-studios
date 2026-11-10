import { z } from "zod";
import { competenceMonthSchema, paymentMethodSchema } from "../common/model.js";
import type { CommissionAdjustment } from "./commission-reconciliation.js";
import type { CommissionEntry, Payable } from "./types.js";

/**
 * Folha de pagamento: cada colaborador tem salário fixo e, se for profissional da agenda, as
 * comissões e os ajustes de comissão da competência. A folha é o único lugar que paga
 * comissão: lançar a folha cria uma despesa por colaborador (salário + comissões + ajustes) e
 * pagar essa despesa paga tudo o que ela inclui.
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
  /** Profissional da agenda cujas comissões entram na folha deste colaborador. */
  professionalId: z.uuid().optional(),
  /** Filial do colaborador; ausente = a do profissional ligado ou a filial em uso. */
  branchId: z.uuid().optional(),
  baseSalaryInCents: z
    .number("Informe o salário fixo.")
    .int("Informe o salário fixo.")
    .min(0, "O salário fixo não pode ser negativo.")
    .max(2147483647, "Salário acima do limite permitido."),
  active: z.boolean().default(true),
});
export type PayrollEmployeeInput = z.infer<typeof payrollEmployeeInputSchema>;

/** Lista de filiais na URL: `?branchIds=a,b` (ausente = todas as acessíveis). */
const branchIdListSchema = z
  .string()
  .transform((value) => value.split(",").filter(Boolean))
  .pipe(z.array(z.uuid()).max(100));

/** `GET /finance/payroll?competence=AAAA-MM&branchIds=a,b`. */
export const payrollQuerySchema = z.object({
  competence: competenceMonthSchema.optional(),
  branchIds: branchIdListSchema.optional(),
});

/** `POST /finance/payroll/launch`: lança o que está pendente na competência. */
export const payrollLaunchInputSchema = z.object({
  competence: competenceMonthSchema,
  /** Filiais incluídas; ausente = todas as acessíveis. */
  branchIds: z.array(z.uuid()).max(100).optional(),
  /** Só estes colaboradores; ausente = todos com valor pendente. */
  employeeIds: z.array(z.uuid()).min(1).max(500).optional(),
  dueDate: z.iso.date(),
  /** Ausente = categoria de despesa padrão "Folha de pagamento" (criada se faltar). */
  categoryId: z.uuid().optional(),
  costCenterId: z.uuid().optional(),
});

/** Nome da categoria de despesa usada por padrão no lançamento da folha. */
export const PAYROLL_CATEGORY_NAME = "Folha de pagamento";
export type PayrollLaunchInput = z.infer<typeof payrollLaunchInputSchema>;

/** Maior porcentagem aceita num desconto ou recompensa (em centésimos: 10000 = 100%). */
export const PAYROLL_ENTRY_MAX_PERCENT = 10000;

/**
 * `POST /finance/payroll/entries`: desconto ou recompensa do colaborador na competência. O
 * salário fixo não muda; o valor entra (recompensa) ou sai (desconto) do pagamento do mês.
 * `value` é em centavos (`amount`) ou em centésimos de porcentagem do salário fixo
 * (`percent`: 1050 = 10,5%). O valor em reais é calculado na hora e não muda depois.
 */
export const payrollEntryInputSchema = z
  .object({
    employeeId: z.uuid(),
    competence: competenceMonthSchema,
    kind: z.enum(["bonus", "discount"], "Escolha desconto ou recompensa."),
    mode: z.enum(
      ["amount", "percent"],
      "Escolha valor em reais ou porcentagem.",
    ),
    value: z
      .number("Informe o valor.")
      .int("Informe o valor.")
      .min(1, "Informe um valor maior que zero.")
      .max(2147483647, "Valor acima do limite permitido."),
    reason: z
      .string("Informe o motivo.")
      .trim()
      .min(3, "Informe o motivo.")
      .max(300, "O motivo pode ter até 300 caracteres."),
  })
  .refine(
    (input) =>
      input.mode !== "percent" || input.value <= PAYROLL_ENTRY_MAX_PERCENT,
    { message: "A porcentagem vai até 100%.", path: ["value"] },
  );
export type PayrollEntryInput = z.infer<typeof payrollEntryInputSchema>;

/**
 * `POST /finance/payroll/advances`: vale (adiantamento) dado ao colaborador. Cria na hora uma
 * despesa já paga (sai do caixa em `paidAt`, padrão agora) na categoria "Folha de pagamento" e
 * um lançamento da folha que desconta o valor do pagamento de `competence`.
 */
export const payrollAdvanceInputSchema = z.object({
  employeeId: z.uuid("Escolha o colaborador."),
  competence: competenceMonthSchema,
  amountInCents: z
    .number("Informe o valor.")
    .int("Informe o valor.")
    .min(1, "Informe um valor maior que zero.")
    .max(2147483647, "Valor acima do limite permitido."),
  paidAt: z.iso.datetime({ offset: true }).optional(),
  paymentMethod: paymentMethodSchema.default("pix"),
  reason: z
    .string()
    .trim()
    .max(300, "O motivo pode ter até 300 caracteres.")
    .optional()
    .or(z.literal("")),
});
export type PayrollAdvanceInput = z.input<typeof payrollAdvanceInputSchema>;

/**
 * Desconto, recompensa ou vale gravado: `amountInCents` é sempre positivo (o tipo dá o sinal;
 * o vale desconta). O vale é sempre em reais e tem a despesa paga em `advancePayableId`.
 */
export interface PayrollEntry {
  id: string;
  clinicId: string;
  employeeId: string;
  competence: string;
  kind: "bonus" | "discount" | "advance";
  mode: "amount" | "percent";
  value: number;
  amountInCents: number;
  /** Vazio só no vale sem motivo. */
  reason: string;
  /** Despesa da folha que incluiu o lançamento; ausente = a lançar. */
  payrollPayableId?: string;
  /** Vale: a despesa paga na entrega. */
  advancePayableId?: string;
  createdAt: string;
}

/** Valor em centavos do desconto/recompensa: porcentagem sobre o salário fixo. */
export function payrollEntryAmount(
  mode: PayrollEntry["mode"],
  value: number,
  baseSalaryInCents: number,
) {
  return mode === "amount"
    ? value
    : Math.round((baseSalaryInCents * value) / 10000);
}

/** "10%" / "10,5%" a partir dos centésimos. */
export function formatPayrollPercent(value: number) {
  return `${(value / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export interface PayrollEmployee {
  id: string;
  clinicId: string;
  branchId: string;
  branchName?: string;
  name: string;
  role?: string;
  professionalId?: string;
  professionalName?: string;
  /** Usuário dono do salário (cadastro em Administração › Usuários); ausente = anterior. */
  userId?: string;
  baseSalaryInCents: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * - `pending`: ainda não lançado; entra no próximo lançamento da folha.
 * - `launched`: incluído numa despesa da folha ainda não paga.
 * - `paid`: incluído numa despesa da folha já paga.
 * - `outside`: pago (ou lançado) fora da folha, antes da folha existir; só informativo.
 */
export type PayrollItemStatus = "pending" | "launched" | "paid" | "outside";

export interface PayrollItem {
  /** `bonus`/`discount`/`advance`: recompensa, desconto e vale (os dois últimos negativos). */
  kind:
    "salary" | "commission" | "adjustment" | "bonus" | "discount" | "advance";
  /** Id da comissão, do ajuste ou do desconto/recompensa/vale (ausente no salário). */
  id?: string;
  description: string;
  amountInCents: number;
  status: PayrollItemStatus;
  payableId?: string;
}

/** Despesa da folha já lançada para o colaborador na competência. */
export interface PayrollPayableSummary {
  id: string;
  description: string;
  amountInCents: number;
  status: "open" | "paid";
  dueDate: string;
}

export interface PayrollLine {
  employee: PayrollEmployee;
  items: PayrollItem[];
  salaryInCents: number;
  commissionInCents: number;
  adjustmentInCents: number;
  /** Recompensas menos descontos da competência. */
  extraInCents: number;
  /** Vales descontados na competência (negativo). */
  advanceInCents: number;
  totalInCents: number;
  /** O que ainda não foi lançado (salário, comissões, ajustes, descontos, recompensas e vales). */
  pendingInCents: number;
  payables: PayrollPayableSummary[];
}

export interface PayrollTotals {
  salaryInCents: number;
  commissionInCents: number;
  adjustmentInCents: number;
  extraInCents: number;
  advanceInCents: number;
  totalInCents: number;
  pendingInCents: number;
}

export interface PayrollBranch {
  branchId: string;
  branchName: string;
  lines: PayrollLine[];
  totals: PayrollTotals;
}

/** Profissional com comissão pendente na competência, sem colaborador na folha. */
export interface PayrollUnassignedProfessional {
  professionalId: string;
  professionalName: string;
  branchId?: string;
  pendingInCents: number;
  count: number;
}

/** Resultado de `POST /finance/payroll/launch`. */
export interface PayrollLaunchResult {
  payables: Payable[];
  /** Colaboradores cujo pendente soma zero ou menos (ajustes de desconto): não lançados. */
  skipped: {
    employeeId: string;
    employeeName: string;
    pendingInCents: number;
  }[];
}

/** Folha de uma competência (`GET /finance/payroll`). */
export interface PayrollSummary {
  competence: string;
  branches: PayrollBranch[];
  totals: PayrollTotals;
  unassigned: PayrollUnassignedProfessional[];
}

export interface PayrollSources {
  competence: string;
  /** Filiais exibidas, na ordem. */
  branches: { id: string; name: string }[];
  employees: PayrollEmployee[];
  /** Comissões da competência, com o serviço para a descrição. */
  commissions: (CommissionEntry & { serviceName?: string })[];
  /** Ajustes cuja comissão de origem é da competência. */
  adjustments: CommissionAdjustment[];
  /** Descontos, recompensas e vales da competência. */
  entries: PayrollEntry[];
  /** Despesas da folha da competência (sem as canceladas). */
  payables: Payable[];
  /** Comissões ligadas a uma despesa avulsa (fluxo anterior à folha). */
  expenseCommissionIds: ReadonlySet<string>;
  professionals: { id: string; fullName: string; branchId?: string }[];
}

const emptyTotals = (): PayrollTotals => ({
  salaryInCents: 0,
  commissionInCents: 0,
  adjustmentInCents: 0,
  extraInCents: 0,
  advanceInCents: 0,
  totalInCents: 0,
  pendingInCents: 0,
});

function addTotals(target: PayrollTotals, line: PayrollTotals) {
  target.salaryInCents += line.salaryInCents;
  target.commissionInCents += line.commissionInCents;
  target.adjustmentInCents += line.adjustmentInCents;
  target.extraInCents += line.extraInCents;
  target.advanceInCents += line.advanceInCents;
  target.totalInCents += line.totalInCents;
  target.pendingInCents += line.pendingInCents;
}

/** "Folha 10/2026 · Ana Souza" (com "(complemento)" a partir da segunda despesa). */
export function payrollPayableDescription(
  competence: string,
  employeeName: string,
  complement = false,
) {
  const [year, month] = competence.split("-");
  return `Folha ${month}/${year}${complement ? " (complemento)" : ""} · ${employeeName}`;
}

const signedEntry = (entry: PayrollEntry) =>
  entry.kind === "bonus" ? entry.amountInCents : -entry.amountInCents;

/** "Desconto (10% do salário) · Faltas" / "Recompensa · Meta batida" / "Vale · Mercado". */
export function payrollEntryDescription(
  entry: Pick<PayrollEntry, "kind" | "mode" | "value" | "reason">,
) {
  if (entry.kind === "advance")
    return entry.reason ? `Vale · ${entry.reason}` : "Vale";
  const label = entry.kind === "discount" ? "Desconto" : "Recompensa";
  const percent =
    entry.mode === "percent"
      ? ` (${formatPayrollPercent(entry.value)} do salário)`
      : "";
  return `${label}${percent} · ${entry.reason}`;
}

/** "Vale · Ana Souza (desconto em 11/2026)": descrição da despesa paga do vale. */
export function payrollAdvanceDescription(
  employeeName: string,
  competence: string,
) {
  const [year, month] = competence.split("-");
  return `Vale · ${employeeName} (desconto em ${month}/${year})`;
}

/**
 * Monta a folha da competência por filial: para cada colaborador, o salário, as comissões e
 * os ajustes, cada um com a situação (pendente, lançado, pago ou pago fora da folha).
 */
export function buildPayroll(sources: PayrollSources): PayrollSummary {
  const payableById = new Map(sources.payables.map((item) => [item.id, item]));
  const itemStatus = (
    payableId: string | undefined,
    paidOutside: boolean,
  ): PayrollItemStatus => {
    const payable = payableId ? payableById.get(payableId) : undefined;
    if (payable) return payable.status === "paid" ? "paid" : "launched";
    return paidOutside ? "outside" : "pending";
  };
  const employeeByProfessional = new Map(
    sources.employees
      .filter((item) => item.professionalId)
      .map((item) => [item.professionalId!, item]),
  );
  const lines = sources.employees.map((employee): PayrollLine => {
    const own = sources.payables.filter(
      (item) =>
        item.payroll?.employeeId === employee.id &&
        item.payroll.competence === sources.competence,
    );
    const items: PayrollItem[] = [];
    const entries = sources.entries.filter(
      (item) => item.employeeId === employee.id,
    );
    // A parte "salário" da despesa inclui descontos e recompensas; o salário é o resto.
    const salaryOf = (payable: Payable) =>
      payable.payroll!.salaryInCents -
      entries
        .filter((item) => item.payrollPayableId === payable.id)
        .reduce((total, item) => total + signedEntry(item), 0);
    const salaryPayable = own.find((item) => salaryOf(item) > 0);
    if (employee.baseSalaryInCents > 0 && (employee.active || salaryPayable))
      items.push({
        kind: "salary",
        description: "Salário fixo",
        amountInCents: salaryPayable
          ? salaryOf(salaryPayable)
          : employee.baseSalaryInCents,
        status: itemStatus(salaryPayable?.id, false),
        ...(salaryPayable ? { payableId: salaryPayable.id } : {}),
      });
    if (employee.professionalId) {
      for (const commission of sources.commissions)
        if (commission.professionalId === employee.professionalId)
          items.push({
            kind: "commission",
            id: commission.id,
            description: `Comissão${commission.serviceName ? ` · ${commission.serviceName}` : ""}`,
            amountInCents: commission.amountInCents,
            status: itemStatus(
              commission.payrollPayableId,
              commission.status === "paid" ||
                sources.expenseCommissionIds.has(commission.id),
            ),
            ...(commission.payrollPayableId
              ? { payableId: commission.payrollPayableId }
              : {}),
          });
      for (const adjustment of sources.adjustments)
        if (adjustment.professionalId === employee.professionalId)
          items.push({
            kind: "adjustment",
            id: adjustment.id,
            description: `Ajuste de comissão · ${adjustment.reason}`,
            amountInCents: adjustment.amountInCents,
            status: itemStatus(
              adjustment.payrollPayableId,
              adjustment.status === "paid",
            ),
            ...(adjustment.payrollPayableId
              ? { payableId: adjustment.payrollPayableId }
              : {}),
          });
    }
    for (const entry of entries)
      items.push({
        kind: entry.kind,
        id: entry.id,
        description: payrollEntryDescription(entry),
        amountInCents: signedEntry(entry),
        status: itemStatus(entry.payrollPayableId, false),
        ...(entry.payrollPayableId
          ? { payableId: entry.payrollPayableId }
          : {}),
      });
    const sum = (...kinds: PayrollItem["kind"][]) =>
      items
        .filter((item) => kinds.includes(item.kind))
        .reduce((total, item) => total + item.amountInCents, 0);
    const salaryInCents = sum("salary"),
      commissionInCents = sum("commission"),
      adjustmentInCents = sum("adjustment"),
      extraInCents = sum("bonus", "discount"),
      advanceInCents = sum("advance");
    return {
      employee,
      items,
      salaryInCents,
      commissionInCents,
      adjustmentInCents,
      extraInCents,
      advanceInCents,
      totalInCents:
        salaryInCents +
        commissionInCents +
        adjustmentInCents +
        extraInCents +
        advanceInCents,
      pendingInCents: items
        .filter((item) => item.status === "pending")
        .reduce((total, item) => total + item.amountInCents, 0),
      payables: own.map((item) => ({
        id: item.id,
        description: item.description,
        amountInCents: item.amountInCents,
        status: item.status === "paid" ? "paid" : "open",
        dueDate: item.dueDate,
      })),
    };
  });
  // Inativo só aparece se ainda tem algo na competência.
  const visible = lines.filter(
    (line) => line.employee.active || line.items.length > 0,
  );
  const branches = sources.branches.map((branch): PayrollBranch => {
    const own = visible
      .filter((line) => line.employee.branchId === branch.id)
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name, "pt-BR"));
    const totals = emptyTotals();
    for (const line of own) addTotals(totals, line);
    return { branchId: branch.id, branchName: branch.name, lines: own, totals };
  });
  const totals = emptyTotals();
  for (const branch of branches) addTotals(totals, branch.totals);
  const unassigned = new Map<string, PayrollUnassignedProfessional>();
  const pendingWithoutEmployee = (professionalId: string, amount: number) => {
    if (employeeByProfessional.has(professionalId)) return;
    const professional = sources.professionals.find(
      (item) => item.id === professionalId,
    );
    if (!professional) return;
    const row = unassigned.get(professionalId) ?? {
      professionalId,
      professionalName: professional.fullName,
      ...(professional.branchId ? { branchId: professional.branchId } : {}),
      pendingInCents: 0,
      count: 0,
    };
    row.pendingInCents += amount;
    row.count += 1;
    unassigned.set(professionalId, row);
  };
  for (const commission of sources.commissions)
    if (
      !commission.payrollPayableId &&
      commission.status === "open" &&
      !sources.expenseCommissionIds.has(commission.id)
    )
      pendingWithoutEmployee(
        commission.professionalId,
        commission.amountInCents,
      );
  for (const adjustment of sources.adjustments)
    if (!adjustment.payrollPayableId && adjustment.status === "open")
      pendingWithoutEmployee(
        adjustment.professionalId,
        adjustment.amountInCents,
      );
  return {
    competence: sources.competence,
    branches,
    totals,
    unassigned: [...unassigned.values()].sort((a, b) =>
      a.professionalName.localeCompare(b.professionalName, "pt-BR"),
    ),
  };
}

/**
 * Observação da despesa da folha: quanto o colaborador recebe de salário, de comissões e de
 * ajustes ("Comissões (12): R$ 840,00"). O detalhe de cada comissão fica na tela da folha.
 */
export function payrollPayableNotes(items: PayrollItem[]) {
  const money = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const labels = {
    salary: "Salário fixo",
    commission: "Comissões",
    adjustment: "Ajustes de comissão",
    bonus: "Recompensas",
    discount: "Descontos",
    advance: "Vales",
  } as const;
  return (
    [
      "salary",
      "commission",
      "adjustment",
      "bonus",
      "discount",
      "advance",
    ] as const
  )
    .map((kind) => {
      const own = items.filter((item) => item.kind === kind);
      if (!own.length) return "";
      const total = own.reduce((sum, item) => sum + item.amountInCents, 0);
      return `${labels[kind]}${kind === "salary" ? "" : ` (${own.length})`}: ${money(total)}`;
    })
    .filter(Boolean)
    .join("\n");
}
