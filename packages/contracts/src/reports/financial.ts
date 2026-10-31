import { z } from "zod";
import type {
  DailyCashMovementKind,
  DailyCashPaymentMethod,
} from "../finance/types.js";

/**
 * Pró-labore configurado pelo admin: percentual retirado pelo sócio sobre o resultado do
 * caixa (`profit`, só quando positivo) ou sobre as entradas do período (`revenue`).
 */
export const proLaboreSettingsInputSchema = z.object({
  percentage: z
    .number()
    .min(0, "O percentual não pode ser negativo.")
    .max(100, "O percentual não pode passar de 100%.")
    .refine(
      (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6,
      "Use no máximo duas casas decimais.",
    ),
  base: z.enum(["profit", "revenue"]),
});

export type ProLaboreSettingsInput = z.infer<
  typeof proLaboreSettingsInputSchema
>;

export interface ProLaboreSettings extends ProLaboreSettingsInput {
  updatedAt?: string;
}

export const defaultProLaboreSettings: ProLaboreSettings = {
  percentage: 0,
  base: "profit",
};

export const proLaboreBaseLabels: Record<ProLaboreSettings["base"], string> = {
  profit: "do lucro do caixa",
  revenue: "das entradas",
};

/**
 * Por onde o dinheiro entrou ou saiu. A venda (comanda) não é origem: cada pagamento dela
 * vira uma linha por produto (`product_sale`) e por serviço avulso (`service_sale`).
 */
export type FinancialEntryOrigin =
  | "plan"
  | "product_sale"
  | "service_sale"
  | "manual_receivable"
  | "expense"
  | "payroll"
  | "commission";

export const financialEntryOriginLabels: Record<FinancialEntryOrigin, string> =
  {
    plan: "Venda de planos",
    product_sale: "Venda de produtos",
    service_sale: "Serviços avulsos",
    manual_receivable: "Receitas avulsas",
    expense: "Despesas",
    payroll: "Folha de pagamento",
    commission: "Pagamento de profissionais",
  };

/** Um movimento do caixa no período, com tudo o que permite filtrá-lo. */
export interface FinancialEntry {
  /**
   * `<tipo>:<id da origem>`, igual ao caixa do dia; na venda quebrada por item,
   * `<id do movimento>#<id do item>`.
   */
  id: string;
  direction: "in" | "out";
  kind: DailyCashMovementKind;
  /** ISO 8601 do evento (pagamento, estorno ou baixa). */
  occurredAt: string;
  /** Data (aaaa-mm-dd) no fuso da clínica. */
  date: string;
  description: string;
  /** Cliente, fornecedor ou profissional. */
  counterpart?: string;
  paymentMethod: DailyCashPaymentMethod;
  /**
   * Valor com sinal dentro da direção: entradas positivas e estornos de
   * recebimento negativos; saídas positivas e estornos de pagamento negativos.
   */
  amountInCents: number;
  origin: FinancialEntryOrigin;
  /** Categoria do lançamento; sem categoria, o nome da origem. */
  categoryId?: string;
  categoryName: string;
  costCenterName?: string;
  /** Ausente quando o registro não tem filial. */
  branchId?: string;
  /**
   * Quem recebeu o pagamento: id do profissional ou, para colaborador da folha sem
   * profissional ligado, `employee:<id do colaborador>`.
   */
  professionalId?: string;
  professionalName?: string;
}

/** Prefixo do id de quem recebe pela folha sem ser profissional da agenda. */
export const PAYROLL_EMPLOYEE_PREFIX = "employee:";

/** Quanto cada profissional ou colaborador recebeu (caixa) e gerou de comissão no período. */
export interface FinancialProfessional {
  id: string;
  name: string;
  /** Cargo do colaborador na folha, quando houver. */
  role?: string;
  branchId?: string;
  /** Comissões efetivamente pagas no período (data do pagamento). */
  paidInCents: number;
  /** Salário fixo pago pela folha no período (data do pagamento). */
  salaryPaidInCents: number;
  /** Comissões das competências do período (pagas ou não). */
  generatedInCents: number;
  /** Parte das competências do período ainda não paga. */
  openInCents: number;
}

/** `GET /reports/financial` (permissão `reports.dre`). */
export interface FinancialReport {
  from: string;
  to: string;
  generatedAt: string;
  /** Competências (AAAA-MM) somadas nas comissões geradas. */
  commissionMonths: string[];
  /** Filiais que o usuário acessa (para o filtro e o comparativo). */
  branches: Array<{ id: string; name: string }>;
  proLabore: ProLaboreSettings;
  /** Movimentos do caixa no período, em ordem cronológica. */
  entries: FinancialEntry[];
  professionals: FinancialProfessional[];
}

/** Maior período do relatório financeiro: o caixa de cada consulta é montado na hora. */
export const financialReportMaxDays = 366;

const financialPeriodShape = { from: z.iso.date(), to: z.iso.date() };

function refineFinancialPeriod(
  value: { from: string; to: string },
  context: z.core.$RefinementCtx,
) {
  if (value.from > value.to)
    context.addIssue({
      code: "custom",
      message: "A data inicial deve ser anterior à data final.",
      path: ["from"],
    });
  else if (
    (Date.parse(`${value.to}T00:00:00Z`) -
      Date.parse(`${value.from}T00:00:00Z`)) /
      86_400_000 >=
    financialReportMaxDays
  )
    context.addIssue({
      code: "custom",
      message: "Escolha um período de até 12 meses.",
      path: ["to"],
    });
}

export const financialReportFilterSchema = z
  .object(financialPeriodShape)
  .superRefine(refineFinancialPeriod);

const amountFilterSchema = z
  .string()
  .trim()
  .regex(/^(\d{1,9}([.,]\d{0,2})?)?$/, "Informe um valor como 150 ou 150,50.")
  .default("");

/** Valor em reais do filtro convertido para centavos; vazio = `null`. */
export function amountFilterInCents(value: string) {
  return value ? Math.round(Number(value.replace(",", ".")) * 100) : null;
}

/** Filtros do extrato detalhado; vazio = sem filtro. */
export const financialEntryFiltersSchema = z.object({
  search: z.string().max(200).default(""),
  direction: z.enum(["", "in", "out"]).default(""),
  origin: z
    .enum([
      "",
      "plan",
      "product_sale",
      "service_sale",
      "manual_receivable",
      "expense",
      "payroll",
      "commission",
    ])
    .default(""),
  category: z.string().max(200).default(""),
  costCenter: z.string().max(200).default(""),
  paymentMethod: z
    .enum([
      "",
      "pix",
      "card",
      "cash",
      "bank_transfer",
      "boleto",
      "other",
      "unspecified",
    ])
    .default(""),
  professionalId: z.string().max(64).default(""),
  counterpart: z.string().max(200).default(""),
  /** Datas (aaaa-mm-dd) dentro do período do relatório. */
  from: z.union([z.literal(""), z.iso.date()]).default(""),
  to: z.union([z.literal(""), z.iso.date()]).default(""),
  /** Faixa do valor absoluto, em reais ("150" ou "150,50"). */
  minAmount: amountFilterSchema,
  maxAmount: amountFilterSchema,
});
export type FinancialFilters = z.infer<typeof financialEntryFiltersSchema>;

export const emptyFinancialFilters: FinancialFilters =
  financialEntryFiltersSchema.parse({});

/**
 * `GET /reports/financial/export`: período do relatório (`periodFrom`/`periodTo`), filial
 * (`branchId`, vazio = todas) e os mesmos filtros do extrato.
 */
export const financialExportFilterSchema = financialEntryFiltersSchema
  .extend({
    periodFrom: financialPeriodShape.from,
    periodTo: financialPeriodShape.to,
    branchId: z.string().max(64).default(""),
  })
  .superRefine((value, context) =>
    refineFinancialPeriod(
      { from: value.periodFrom, to: value.periodTo },
      context,
    ),
  );
export type FinancialExportFilter = z.infer<typeof financialExportFilterSchema>;

/** Filial do movimento no filtro e no comparativo (sem filial = `NO_BRANCH`). */
export const NO_BRANCH = "sem-filial";

export function entryBranch(entry: FinancialEntry) {
  return entry.branchId ?? NO_BRANCH;
}

export function inBranch(entries: readonly FinancialEntry[], branchId: string) {
  return branchId
    ? entries.filter((entry) => entryBranch(entry) === branchId)
    : [...entries];
}

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Movimentos que passam nos filtros do extrato (busca sem acento). */
export function filterFinancialEntries(
  entries: readonly FinancialEntry[],
  filters: FinancialFilters,
) {
  const search = normalizeSearch(filters.search.trim());
  const min = amountFilterInCents(filters.minAmount);
  const max = amountFilterInCents(filters.maxAmount);
  return entries.filter(
    (entry) =>
      (min === null || Math.abs(entry.amountInCents) >= min) &&
      (max === null || Math.abs(entry.amountInCents) <= max) &&
      (!filters.direction || entry.direction === filters.direction) &&
      (!filters.origin || entry.origin === filters.origin) &&
      (!filters.category || entry.categoryName === filters.category) &&
      (!filters.costCenter ||
        (entry.costCenterName ?? "") === filters.costCenter) &&
      (!filters.paymentMethod ||
        entry.paymentMethod === filters.paymentMethod) &&
      (!filters.professionalId ||
        entry.professionalId === filters.professionalId) &&
      (!filters.counterpart ||
        (entry.counterpart ?? "") === filters.counterpart) &&
      (!filters.from || entry.date >= filters.from) &&
      (!filters.to || entry.date <= filters.to) &&
      (!search ||
        normalizeSearch(
          [
            entry.description,
            entry.counterpart,
            entry.categoryName,
            entry.costCenterName,
            entry.professionalName,
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(search)),
  );
}

/** Forma de pagamento como aparece no caixa e no extrato. */
export const cashPaymentMethodLabels: Record<DailyCashPaymentMethod, string> = {
  pix: "Pix",
  card: "Cartão",
  cash: "Dinheiro",
  bank_transfer: "Transferência",
  boleto: "Boleto",
  other: "Outro",
  unspecified: "Não informada",
};

export interface FinancialBreakdownRow {
  key: string;
  label: string;
  amountInCents: number;
  count: number;
  /** Participação no total da direção, entre 0 e 1 (0 quando o total não é positivo). */
  share: number;
}

/** Soma por chave os movimentos de uma direção, do maior para o menor valor. */
export function groupFinancialEntries(
  entries: readonly FinancialEntry[],
  direction: FinancialEntry["direction"],
  keyOf: (entry: FinancialEntry) => { key: string; label: string },
): FinancialBreakdownRow[] {
  const rows = new Map<string, FinancialBreakdownRow>();
  let total = 0;
  for (const entry of entries) {
    if (entry.direction !== direction) continue;
    const { key, label } = keyOf(entry);
    const row = rows.get(key) ?? {
      key,
      label,
      amountInCents: 0,
      count: 0,
      share: 0,
    };
    row.amountInCents += entry.amountInCents;
    row.count += 1;
    total += entry.amountInCents;
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      share: total > 0 ? row.amountInCents / total : 0,
    }))
    .sort(
      (a, b) =>
        b.amountInCents - a.amountInCents || a.label.localeCompare(b.label),
    );
}

export interface FinancialTotals {
  inflowInCents: number;
  outflowInCents: number;
  /** Entradas − saídas. */
  resultInCents: number;
  /** Base do pró-labore já limitada a zero. */
  proLaboreBaseInCents: number;
  proLaboreInCents: number;
  /** Resultado − pró-labore: o que fica no caixa da empresa. */
  retainedInCents: number;
  /** Resultado ÷ entradas, em % com uma casa; `null` sem entradas positivas. */
  marginPercent: number | null;
}

/** Totais do caixa e pró-labore de um conjunto de movimentos. */
export function financialTotals(
  entries: readonly FinancialEntry[],
  proLabore: ProLaboreSettingsInput,
): FinancialTotals {
  let inflowInCents = 0,
    outflowInCents = 0;
  for (const entry of entries)
    if (entry.direction === "in") inflowInCents += entry.amountInCents;
    else outflowInCents += entry.amountInCents;
  const resultInCents = inflowInCents - outflowInCents;
  const proLaboreBaseInCents = Math.max(
    0,
    proLabore.base === "revenue" ? inflowInCents : resultInCents,
  );
  const proLaboreInCents = Math.round(
    (proLaboreBaseInCents * proLabore.percentage) / 100,
  );
  return {
    inflowInCents,
    outflowInCents,
    resultInCents,
    proLaboreBaseInCents,
    proLaboreInCents,
    retainedInCents: resultInCents - proLaboreInCents,
    marginPercent:
      inflowInCents > 0
        ? Math.round((resultInCents / inflowInCents) * 1000) / 10
        : null,
  };
}
