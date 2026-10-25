import { z } from "zod";
export const financialEntryFilterSchema = z
  .object({
    dateField: z
      .enum(["dueDate", "postedOn", "paidAt", "cashAvailableAt"])
      .default("dueDate"),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    competence: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    categoryId: z.uuid().optional(),
    costCenterId: z.uuid().optional(),
    supplierId: z.uuid().optional(),
    paymentMethod: z
      .enum([
        "pix",
        "card",
        "cash",
        "bank_transfer",
        "boleto",
        "other",
        "unspecified",
      ])
      .optional(),
    status: z.enum(["open", "paid", "cancelled", "overdue"]).optional(),
    /** Parceladas: parcela de um parcelamento ou paga em várias vezes na forma (cartão 3x). */
    installments: z.enum(["installments", "single"]).optional(),
    search: z.string().max(200).optional(),
  })
  .refine((filter) => !filter.from || !filter.to || filter.to >= filter.from, {
    path: ["to"],
    message: "A data final deve ser posterior à inicial.",
  });
export type FinancialEntryFilter = z.infer<typeof financialEntryFilterSchema>;
export interface FilterableFinancialEntry {
  description: string;
  status: string;
  createdAt: string;
  dueDate: string;
  overdue: boolean;
  patientName?: string | undefined;
  supplier?: string | undefined;
  supplierId?: string | undefined;
  postedOn?: string | undefined;
  paidAt?: string | undefined;
  cashAvailableAt?: string | undefined;
  competence?: string | undefined;
  dreCompetence?: string | undefined;
  categoryId?: string | undefined;
  costCenterId?: string | undefined;
  paymentMethod?: string | undefined;
  installmentCount?: number | undefined;
  paymentInstallments?: number | undefined;
}

/** A conta faz parte de um parcelamento (plano em N vezes) ou foi paga parcelada na forma. */
export function isInstallmentEntry(
  entry: Pick<
    FilterableFinancialEntry,
    "installmentCount" | "paymentInstallments"
  >,
) {
  return (
    (entry.installmentCount ?? 1) > 1 || (entry.paymentInstallments ?? 1) > 1
  );
}
const normalized = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
export function matchesFinancialEntry(
  entry: FilterableFinancialEntry,
  filter: FinancialEntryFilter,
  timezone = "America/Sao_Paulo",
) {
  const localDate = (date: string) =>
    date.length === 10
      ? date
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(date));
  const instant =
    filter.dateField === "postedOn"
      ? (entry.postedOn ?? entry.createdAt)
      : entry[filter.dateField];
  const date = instant ? localDate(instant) : undefined;
  if (
    (filter.from || filter.to) &&
    (!date ||
      (filter.from && date < filter.from) ||
      (filter.to && date > filter.to))
  )
    return false;
  if (
    filter.competence &&
    (entry.dreCompetence ??
      entry.competence ??
      localDate(entry.createdAt).slice(0, 7)) !== filter.competence
  )
    return false;
  if (
    filter.status &&
    (filter.status === "overdue"
      ? !(entry.status === "open" && entry.overdue)
      : entry.status !== filter.status)
  )
    return false;
  for (const key of ["categoryId", "costCenterId", "supplierId"] as const)
    if (filter[key] && entry[key] !== filter[key]) return false;
  if (
    filter.paymentMethod &&
    (entry.paymentMethod ?? "unspecified") !== filter.paymentMethod
  )
    return false;
  if (
    filter.installments &&
    isInstallmentEntry(entry) !== (filter.installments === "installments")
  )
    return false;
  return (
    !filter.search ||
    normalized(
      [entry.description, entry.patientName, entry.supplier]
        .filter(Boolean)
        .join(" "),
    ).includes(normalized(filter.search))
  );
}
