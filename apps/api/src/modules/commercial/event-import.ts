import {
  eventImportFieldLabels,
  eventLeadInputSchema,
  type EventImportAnalysis,
  type EventImportField,
} from "@crm/contracts";

const key = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const aliases: Record<EventImportField, string[]> = {
  fullName: ["nome", "nomecompleto", "cliente", "participante"],
  phone: ["telefone", "celular", "fone", "tel"],
  whatsapp: ["whatsapp", "whats", "wpp", "zap"],
  email: ["email"],
  interest: ["interesse"],
  notes: ["observacoes", "observacao", "obs", "notas"],
  phoneAreaCode: ["ddd", "dddtelefone", "ddddotelefone"],
  whatsappAreaCode: ["dddwhatsapp", "ddddowhatsapp"],
};

/** Nenhum campo é obrigatório; contatos repetidos continuam sendo participantes distintos. */
export function validateEventImport(
  rows: string[][],
  eventId: string,
  mapping?: (EventImportField | null)[],
): EventImportAnalysis {
  const result: EventImportAnalysis = {
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
      "O arquivo está vazio. Inclua os títulos das colunas e os participantes.",
    );
    return result;
  }
  const data = rows.slice(start + 1);
  const width = rows.slice(start).reduce((max, row) => {
    let last = row.length;
    while (last > max && !row[last - 1]?.trim()) last--;
    return Math.max(max, last);
  }, 0);
  const used = new Set<EventImportField>();
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
    const field = (Object.keys(aliases) as EventImportField[]).find(
      (field) =>
        !used.has(field) &&
        (aliases[field].includes(key(title)) || key(field) === key(title)),
    );
    if (field) used.add(field);
    return field ?? null;
  });
  if (!result.mapping.some(Boolean)) {
    result.errors.push("Escolha ao menos uma coluna para importar.");
    return result;
  }
  data.forEach((row, index) => {
    if (blank(row)) return;
    const raw: Record<string, string> = {};
    result.mapping.forEach((field, column) => {
      const value = (row[column] ?? "").trim();
      if (field && value) raw[field] = value;
    });
    // Linhas com valores somente em colunas ignoradas não criam participantes vazios.
    if (!Object.keys(raw).some((field) => !field.endsWith("AreaCode"))) return;
    for (const field of ["phone", "whatsapp"] as const) {
      const ddd = raw[`${field}AreaCode`]?.replace(/\D/g, "");
      const digits = raw[field]?.replace(/\D/g, "");
      if (ddd?.length === 2 && digits && /^\d{8,9}$/.test(digits))
        raw[field] = ddd + digits;
    }
    const parsed = eventLeadInputSchema.safeParse({ ...raw, eventId });
    const errors = parsed.success
      ? []
      : parsed.error.issues.map(
          (issue) =>
            `${eventImportFieldLabels[issue.path[0] as EventImportField] ?? "Campo"}: ${issue.message}`,
        );
    const status = parsed.success ? "valid" : "error";
    result.rows.push({
      line: start + index + 2,
      fullName: raw.fullName ?? "",
      phone: raw.phone ?? "",
      status,
      errors,
      ...(parsed.success ? { input: parsed.data } : {}),
    });
    result.totals[status]++;
  });
  return result;
}
