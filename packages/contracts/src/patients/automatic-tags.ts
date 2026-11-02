import { patientTagKey } from "./model.js";
import type { PatientTagCategory } from "./types.js";

/**
 * Etiqueta automática (QC7): cliente com parcela vencida e em aberto — mesma regra do motivo
 * `overdue_payment` dos Contatos sugeridos. Calculada na leitura; não é gravada nem editada à mão.
 */
export const OVERDUE_PAYMENT_TAG = "Pagamento atrasado";

/**
 * Etiqueta automática (B6-05): cliente sem CPF — em geral importado de planilha. Calculada na
 * leitura; sai sozinha quando o CPF é preenchido. Visível para todos os perfis.
 */
export const MISSING_CPF_TAG = "Falta CPF";

/** Etiquetas calculadas pela API (não aparecem em Configurações › Etiquetas). */
export const automaticPatientTagNames: readonly string[] = [
  OVERDUE_PAYMENT_TAG,
  MISSING_CPF_TAG,
];

const automaticPatientTagCategories: Record<string, PatientTagCategory> = {
  [patientTagKey(OVERDUE_PAYMENT_TAG)]: "financial",
  [patientTagKey(MISSING_CPF_TAG)]: "status",
};

/** Categoria de uma etiqueta automática (define a cor exibida); `undefined` se não for automática. */
export function automaticPatientTagCategoryOf(
  name: string,
): PatientTagCategory | undefined {
  return automaticPatientTagCategories[patientTagKey(name)];
}

export function isAutomaticPatientTag(name: string): boolean {
  const key = patientTagKey(name);
  return automaticPatientTagNames.some((tag) => patientTagKey(tag) === key);
}

/** Tira as etiquetas automáticas de uma lista informada à mão (são ignoradas na gravação). */
export function withoutAutomaticPatientTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => !isAutomaticPatientTag(tag));
}

/** Parcela vencida: em aberto e com vencimento antes de hoje (fuso da clínica). */
export function isOverdueReceivable(
  receivable: { status: string; dueDate: string },
  today: string,
): boolean {
  return receivable.status === "open" && receivable.dueDate < today;
}

/** Clientes com ao menos uma parcela vencida e em aberto. */
export function overduePatientIds(
  receivables: readonly {
    patientId?: string | null | undefined;
    status: string;
    dueDate: string;
  }[],
  today: string,
): string[] {
  const ids = new Set<string>();
  for (const receivable of receivables)
    if (receivable.patientId && isOverdueReceivable(receivable, today))
      ids.add(receivable.patientId);
  return [...ids];
}

/**
 * Cliente sem CPF que precisa dele. O cliente mesclado em outro perde o CPF na mescla e não
 * entra na regra.
 */
export function needsCpf(patient: {
  cpf?: string | null | undefined;
  mergedIntoPatientId?: string | null | undefined;
}): boolean {
  return !patient.cpf?.trim() && !patient.mergedIntoPatientId;
}

/** Cliente ao qual as etiquetas automáticas se aplicam. */
export interface AutomaticTagSubject {
  id: string;
  tags: string[];
  cpf?: string | null | undefined;
  mergedIntoPatientId?: string | null | undefined;
}

/**
 * Aplica as etiquetas automáticas ao cliente: descarta qualquer cópia gravada, acrescenta
 * "Pagamento atrasado" quando o cliente está em `overdueIds` (`null` = quem consulta não vê o
 * Financeiro) e "Falta CPF" quando o cadastro não tem CPF.
 */
export function withAutomaticPatientTags<T extends AutomaticTagSubject>(
  patient: T,
  overdueIds: ReadonlySet<string> | null,
): T {
  const tags = withoutAutomaticPatientTags(patient.tags);
  if (overdueIds?.has(patient.id)) tags.push(OVERDUE_PAYMENT_TAG);
  if (needsCpf(patient)) tags.push(MISSING_CPF_TAG);
  return { ...patient, tags };
}
