import {
  EVENT_IMPORT_EXTRA_FIELD,
  EXTRA_FIELD_VALUE_MAX,
  EXTRA_FIELDS_MAX_KEYS,
  eventImportFieldLabels,
  eventLeadInputSchema,
  extraFieldsFromRow,
  extraFieldsSchema,
  type ContactImportAnalysis,
  type EventImportAnalysis,
  type EventImportField,
  type ExtraFields,
} from "@crm/contracts";
import type { z } from "zod";

const key = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
/** "Outros" nunca é reconhecido pelo título: a pessoa escolhe na tela de mapeamento. */
export const contactImportAliases: Record<
  Exclude<EventImportField, typeof EVENT_IMPORT_EXTRA_FIELD>,
  string[]
> = {
  fullName: ["nome", "nomecompleto", "cliente", "participante"],
  phone: ["telefone", "celular", "fone", "tel"],
  whatsapp: ["whatsapp", "whats", "wpp", "zap"],
  email: ["email"],
  cpf: ["cpf"],
  interest: ["interesse"],
  notes: ["observacoes", "observacao", "obs", "notas"],
  phoneAreaCode: ["ddd", "dddtelefone", "ddddotelefone"],
  whatsappAreaCode: ["dddwhatsapp", "ddddowhatsapp"],
};

/** O que muda entre as importações de contatos (participantes de evento, leads). */
export interface ContactImportSpec<Field extends string, Input> {
  aliases: Partial<Record<Field, string[]>>;
  labels: Readonly<Record<Field, string>>;
  parse: (raw: Record<string, string>) => z.ZodSafeParseResult<Input>;
  /** Plural do que a planilha traz, na mensagem de arquivo vazio ("participantes"). */
  noun: string;
}

/**
 * Nenhum campo é obrigatório. Na gravação (EN1), contato que já é participante do evento é
 * ignorado e o que já é cliente vira participante ligado a ele (`planEventParticipants`).
 */
export function validateEventImport(
  rows: string[][],
  eventId: string,
  mapping?: (EventImportField | null)[],
): EventImportAnalysis {
  return validateContactImport(
    rows,
    {
      aliases: contactImportAliases,
      labels: eventImportFieldLabels,
      parse: (raw) => eventLeadInputSchema.safeParse({ ...raw, eventId }),
      noun: "participantes",
    },
    mapping,
  );
}

/** Lê a planilha de contatos: títulos, mapeamento das colunas e validação de cada linha. */
export function validateContactImport<Field extends string, Input>(
  rows: string[][],
  spec: ContactImportSpec<Field, Input>,
  mapping?: (Field | null)[],
): ContactImportAnalysis<Field, Input & { extraFields?: ExtraFields }> {
  const { aliases, labels } = spec;
  const result: ContactImportAnalysis<
    Field,
    Input & { extraFields?: ExtraFields }
  > = {
    columns: [],
    mapping: [],
    rows: [],
    errors: [],
    totals: { valid: 0, error: 0 },
  };
  const blank = (row: string[]) => row.every((value) => !value.trim());
  const start = rows.findIndex((row) => !blank(row));
  if (start < 0) {
    result.errors.push(
      `O arquivo está vazio. Inclua os títulos das colunas e os ${spec.noun}.`,
    );
    return result;
  }
  const data = rows.slice(start + 1);
  const width = rows.slice(start).reduce((max, row) => {
    let last = row.length;
    while (last > max && !row[last - 1]?.trim()) last--;
    return Math.max(max, last);
  }, 0);
  const used = new Set<Field>();
  result.columns = Array.from({ length: width }, (_, index) => ({
    index,
    title: (rows[start]?.[index] ?? "").trim(),
    samples: data
      .map((row) => (row[index] ?? "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((value) => value.slice(0, 80)),
  }));
  result.mapping = result.columns.map(({ title, index }) => {
    if (mapping) return mapping[index] ?? null;
    const field = (Object.keys(aliases) as Field[]).find(
      (field) =>
        !used.has(field) &&
        (aliases[field]?.includes(key(title)) || key(field) === key(title)),
    );
    if (field) used.add(field);
    return field ?? null;
  });
  if (!result.mapping.some(Boolean)) {
    result.errors.push("Escolha ao menos uma coluna para importar.");
    return result;
  }
  const titles = result.columns.map(({ title }) => title);
  const extraColumns = result.mapping.flatMap((field, column) =>
    field === EVENT_IMPORT_EXTRA_FIELD ? [column] : [],
  );
  data.forEach((row, index) => {
    if (blank(row)) return;
    const raw: Record<string, string> = {};
    result.mapping.forEach((field, column) => {
      const value = (row[column] ?? "").trim();
      if (field && field !== EVENT_IMPORT_EXTRA_FIELD && value)
        raw[field] = value;
    });
    // Entrega 10: colunas "Outros" viram `{ título: valor }`.
    const extraFields = extraFieldsFromRow(titles, extraColumns, row);
    // Linhas com valores somente em colunas ignoradas não criam contatos vazios.
    if (
      !extraFields &&
      !Object.keys(raw).some((field) => !field.endsWith("AreaCode"))
    )
      return;
    for (const field of ["phone", "whatsapp"] as const) {
      const ddd = raw[`${field}AreaCode`]?.replace(/\D/g, "");
      const digits = raw[field]?.replace(/\D/g, "");
      if (ddd?.length === 2 && digits && /^\d{8,9}$/.test(digits))
        raw[field] = ddd + digits;
    }
    const parsed = spec.parse(raw);
    const extraValid =
      !extraFields || extraFieldsSchema.safeParse(extraFields).success;
    const errors = parsed.success
      ? []
      : parsed.error.issues.map(
          (issue) =>
            `${labels[issue.path[0] as Field] ?? "Campo"}: ${issue.message}`,
        );
    if (!extraValid)
      errors.push(
        `${labels[EVENT_IMPORT_EXTRA_FIELD as Field]}: até ${EXTRA_FIELDS_MAX_KEYS} colunas, cada valor com até ${EXTRA_FIELD_VALUE_MAX} caracteres.`,
      );
    const status = parsed.success && extraValid ? "valid" : "error";
    result.rows.push({
      line: start + index + 2,
      fullName: raw.fullName ?? "",
      phone: raw.phone ?? "",
      status,
      errors,
      ...(parsed.success && extraValid
        ? { input: { ...parsed.data, ...(extraFields ? { extraFields } : {}) } }
        : {}),
    });
    result.totals[status]++;
  });
  return result;
}
