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

/**
 * Etiqueta automática: cliente importado pela planilha com CPF errado (dígitos não conferem).
 * Ele entra sem CPF e com esta etiqueta no lugar de "Falta CPF"; sai sozinha quando o CPF é
 * preenchido. Visível para todos os perfis.
 */
export const INVALID_CPF_TAG = "CPF inválido";

/**
 * Etiqueta automática (CD3): cliente importado pela planilha sem WhatsApp ou sem contato de
 * emergência (nome e telefone). Sai sozinha quando os dois são preenchidos.
 */
export const INCOMPLETE_REGISTRATION_TAG = "Cadastro incompleto";

/**
 * Etiqueta automática (CD3), só informativa: cliente importado pela planilha sem e-mail. Sai
 * sozinha quando o e-mail é preenchido.
 */
export const MISSING_EMAIL_TAG = "Sem e-mail";

/** Etiquetas calculadas pela API (não aparecem em Configurações › Etiquetas). */
export const automaticPatientTagNames: readonly string[] = [
  OVERDUE_PAYMENT_TAG,
  MISSING_CPF_TAG,
  INVALID_CPF_TAG,
  INCOMPLETE_REGISTRATION_TAG,
  MISSING_EMAIL_TAG,
];

const automaticPatientTagCategories: Record<string, PatientTagCategory> = {
  [patientTagKey(OVERDUE_PAYMENT_TAG)]: "financial",
  [patientTagKey(MISSING_CPF_TAG)]: "status",
  [patientTagKey(INVALID_CPF_TAG)]: "status",
  [patientTagKey(INCOMPLETE_REGISTRATION_TAG)]: "status",
  [patientTagKey(MISSING_EMAIL_TAG)]: "status",
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

/** Sem CPF porque o da planilha estava errado: "CPF inválido" no lugar de "Falta CPF". */
export function hasInvalidImportedCpf(patient: {
  cpf?: string | null | undefined;
  mergedIntoPatientId?: string | null | undefined;
  importedInvalidCpf?: string | null | undefined;
}): boolean {
  return needsCpf(patient) && Boolean(patient.importedInvalidCpf?.trim());
}

/** Contato que a importação aceita vazio (CD3). */
export interface ImportedContactFields {
  whatsapp?: string | null | undefined;
  emergencyContactName?: string | null | undefined;
  emergencyContactPhone?: string | null | undefined;
  email?: string | null | undefined;
}

/** Sem WhatsApp ou sem contato de emergência (nome e telefone). */
export function lacksRequiredContact(patient: ImportedContactFields): boolean {
  return (
    !patient.whatsapp?.trim() ||
    !patient.emergencyContactName?.trim() ||
    !patient.emergencyContactPhone?.trim()
  );
}

/** Sem e-mail. */
export function lacksEmail(patient: ImportedContactFields): boolean {
  return !patient.email?.trim();
}

/** Cliente importado pela planilha (CD3) e não mesclado em outro. */
function isImportedPatient(patient: {
  importedAt?: string | null | undefined;
  mergedIntoPatientId?: string | null | undefined;
}): boolean {
  return Boolean(patient.importedAt) && !patient.mergedIntoPatientId;
}

/**
 * Cadastro incompleto (CD3): cliente importado, não mesclado, sem WhatsApp ou sem contato de
 * emergência. Cadastro manual (sem `importedAt`) nunca entra na regra.
 */
export function needsCompleteRegistration(
  patient: ImportedContactFields & {
    importedAt?: string | null | undefined;
    mergedIntoPatientId?: string | null | undefined;
  },
): boolean {
  return isImportedPatient(patient) && lacksRequiredContact(patient);
}

/** Sem e-mail (CD3): cliente importado, não mesclado, sem e-mail. */
export function needsEmail(
  patient: ImportedContactFields & {
    importedAt?: string | null | undefined;
    mergedIntoPatientId?: string | null | undefined;
  },
): boolean {
  return isImportedPatient(patient) && lacksEmail(patient);
}

/** Cliente ao qual as etiquetas automáticas se aplicam. */
export interface AutomaticTagSubject extends ImportedContactFields {
  id: string;
  tags: string[];
  cpf?: string | null | undefined;
  mergedIntoPatientId?: string | null | undefined;
  importedAt?: string | null | undefined;
  importedInvalidCpf?: string | null | undefined;
}

/**
 * Aplica as etiquetas automáticas ao cliente: descarta qualquer cópia gravada, acrescenta
 * "Pagamento atrasado" quando o cliente está em `overdueIds` (`null` = quem consulta não vê o
 * Financeiro), "Falta CPF" quando o cadastro não tem CPF ("CPF inválido" se o da planilha estava
 * errado) e, só para clientes importados pela
 * planilha, "Cadastro incompleto" e "Sem e-mail" (CD3).
 */
export function withAutomaticPatientTags<T extends AutomaticTagSubject>(
  patient: T,
  overdueIds: ReadonlySet<string> | null,
): T {
  const tags = withoutAutomaticPatientTags(patient.tags);
  if (overdueIds?.has(patient.id)) tags.push(OVERDUE_PAYMENT_TAG);
  if (hasInvalidImportedCpf(patient)) tags.push(INVALID_CPF_TAG);
  else if (needsCpf(patient)) tags.push(MISSING_CPF_TAG);
  if (needsCompleteRegistration(patient))
    tags.push(INCOMPLETE_REGISTRATION_TAG);
  if (needsEmail(patient)) tags.push(MISSING_EMAIL_TAG);
  return { ...patient, tags };
}
