import { z } from "zod";

/**
 * Motivo opcional que a equipe escreve ao salvar uma edição. Viaja no corpo das requisições
 * PUT/PATCH como `changeReason` e vai para os metadados do evento no Histórico (`reason`).
 */
export const CHANGE_REASON_MAX_LENGTH = 500;

export const changeReasonSchema = z
  .string({ error: "O motivo da alteração precisa ser um texto." })
  .trim()
  .max(
    CHANGE_REASON_MAX_LENGTH,
    `O motivo da alteração pode ter até ${CHANGE_REASON_MAX_LENGTH} caracteres.`,
  )
  .optional();

/** Uma linha "campo: antes → depois" gravada em `metadata.changes`. */
export interface AuditChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export const auditChangeSchema = z.object({
  field: z.string(),
  label: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
});

/** Rótulo pt-BR do campo; com `format`, o valor é descrito por ele (vazio → `null`). */
export type AuditFieldLabel =
  | string
  | { label: string; format: (value: unknown) => string | null | undefined };

/** Texto exibido de um valor de cadastro; `null` quando vazio. */
export function auditValueText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number")
    return Number.isFinite(value) ? value.toLocaleString("pt-BR") : null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    return date ? `${date[3]}/${date[2]}/${date[1]}` : text;
  }
  if (Array.isArray(value)) {
    const items = value
      .map(auditValueText)
      .filter((item): item is string => item !== null);
    return items.length ? items.join(", ") : null;
  }
  return JSON.stringify(value);
}

/**
 * Campos alterados entre `before` e `after`, só entre os listados em `labels` (campos
 * internos nunca entram). Valores iguais depois de descritos não contam como mudança.
 */
export function diffAuditFields(
  before: object | null | undefined,
  after: object | null | undefined,
  labels: Record<string, AuditFieldLabel>,
): AuditChange[] {
  const read = (source: object | null | undefined, field: string): unknown =>
    source ? (source as Record<string, unknown>)[field] : undefined;
  return Object.entries(labels).flatMap(([field, config]) => {
    const describe = (value: unknown) =>
      typeof config === "string"
        ? auditValueText(value)
        : value === undefined || value === null
          ? null
          : config.format(value) || null;
    const previous = describe(read(before, field));
    const next = describe(read(after, field));
    if (previous === next) return [];
    return [
      {
        field,
        label: typeof config === "string" ? config : config.label,
        before: previous,
        after: next,
      },
    ];
  });
}

/** Metadados de uma edição: as mudanças e, quando houver, o motivo informado. */
export function auditEditMetadata(
  changes: AuditChange[],
  reason: string | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    changes,
    ...(reason ? { reason } : {}),
  };
}

/** Lê `metadata.changes` de um evento; ignora o que não tiver o formato esperado. */
export function auditChangesOf(metadata: unknown): AuditChange[] {
  if (!metadata || typeof metadata !== "object") return [];
  const parsed = z
    .array(auditChangeSchema)
    .safeParse((metadata as Record<string, unknown>).changes);
  return parsed.success ? parsed.data : [];
}
