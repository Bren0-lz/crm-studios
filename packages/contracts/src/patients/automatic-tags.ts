import { patientTagKey } from "./model.js";

/**
 * Etiqueta automática (QC7): cliente com parcela vencida e em aberto — mesma regra do motivo
 * `overdue_payment` dos Contatos sugeridos. Calculada na leitura; não é gravada nem editada à mão.
 */
export const OVERDUE_PAYMENT_TAG = "Pagamento atrasado";

/** Etiquetas calculadas pela API (não aparecem em Configurações › Etiquetas). */
export const automaticPatientTagNames: readonly string[] = [
  OVERDUE_PAYMENT_TAG,
];

/** Categoria das etiquetas automáticas (define a cor exibida). */
export const automaticPatientTagCategory = "financial" as const;

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
 * Aplica as etiquetas automáticas ao cliente: descarta qualquer cópia gravada e acrescenta
 * "Pagamento atrasado" quando o cliente está em `overdueIds`.
 */
export function withAutomaticPatientTags<
  T extends { id: string; tags: string[] },
>(patient: T, overdueIds: ReadonlySet<string>): T {
  const tags = withoutAutomaticPatientTags(patient.tags);
  if (overdueIds.has(patient.id)) tags.push(OVERDUE_PAYMENT_TAG);
  return { ...patient, tags };
}
