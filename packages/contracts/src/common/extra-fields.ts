import { z } from "zod";

/**
 * "Outros" da importação (entrega 10): colunas da planilha sem campo correspondente ficam
 * guardadas como `{ título da coluna: valor }` no cliente e no lead (participante de evento).
 */
export const EXTRA_FIELDS_MAX_KEYS = 50;
export const EXTRA_FIELD_KEY_MAX = 120;
export const EXTRA_FIELD_VALUE_MAX = 500;
/** Rótulo da opção de mapeamento e da seção/coluna "Outros". */
export const EXTRA_FIELDS_LABEL = "Outros";

export type ExtraFields = Record<string, string>;

export const extraFieldsSchema = z
  .record(
    z.string().trim().min(1).max(EXTRA_FIELD_KEY_MAX),
    z
      .string()
      .trim()
      .min(1)
      .max(
        EXTRA_FIELD_VALUE_MAX,
        `Cada valor de "${EXTRA_FIELDS_LABEL}" pode ter até ${EXTRA_FIELD_VALUE_MAX} caracteres.`,
      ),
  )
  .refine(
    (fields) => Object.keys(fields).length <= EXTRA_FIELDS_MAX_KEYS,
    `"${EXTRA_FIELDS_LABEL}" aceita até ${EXTRA_FIELDS_MAX_KEYS} colunas.`,
  );

/** Chave a partir do título da coluna: só tira os espaços sobrando. */
export function extraFieldKey(title: string, columnIndex: number): string {
  const key = title.trim().replace(/\s+/g, " ").slice(0, EXTRA_FIELD_KEY_MAX);
  return key || `Coluna ${columnIndex + 1}`;
}

/**
 * Monta o "Outros" de uma linha: `columns` são os índices mapeados como "Outros". Célula vazia
 * fica de fora (a mescla nunca apaga nada); títulos repetidos ganham " (2)", " (3)"…
 */
export function extraFieldsFromRow(
  titles: readonly string[],
  columns: readonly number[],
  row: readonly string[],
): ExtraFields | undefined {
  const fields: ExtraFields = {};
  const used = new Map<string, number>();
  for (const column of columns) {
    const base = extraFieldKey(titles[column] ?? "", column);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    const value = (row[column] ?? "").trim();
    if (!value) continue;
    fields[count === 1 ? base : `${base} (${count})`] = value;
  }
  return Object.keys(fields).length ? fields : undefined;
}

/** Mescla sem apagar: chave igual fica com o valor novo (mesma regra do `JSON_MERGE_PATCH`). */
export function mergeExtraFields(
  current: ExtraFields | undefined,
  incoming: ExtraFields | undefined,
): ExtraFields | undefined {
  const merged = { ...current, ...incoming };
  return Object.keys(merged).length ? merged : undefined;
}

/** Texto das exportações: `chave: valor; chave: valor`. */
export function formatExtraFields(fields: ExtraFields | undefined): string {
  return Object.entries(fields ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}
