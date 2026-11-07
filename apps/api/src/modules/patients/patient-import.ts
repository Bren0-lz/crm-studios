import {
  patientImportFieldLabels,
  patientImportPhoneFields,
  patientImportInputSchema,
  patientProfileLabels,
  patientProfileValueLabels,
  patientResidenceTypeLabels,
  resolvePatientTags,
  withoutAutomaticPatientTags,
  type Patient,
  type PatientImportAnalysis,
  type PatientImportColumn,
  type PatientImportDuplicate,
  type PatientImportField,
  type PatientImportRow,
  type PatientImportInput,
  type PatientTag,
} from "@crm/contracts";
import {
  decodeCsvText,
  parseCsv,
  readXlsxRows,
} from "../../infrastructure/spreadsheet.js";
export { decodeCsvText, parseCsv, readXlsxRows };

type PhoneField = (typeof patientImportPhoneFields)[number];
/** Campos com valor próprio (os `*AreaCode` só completam o telefone). */
type ImportField = Exclude<PatientImportField, `${PhoneField}AreaCode`>;

/** Cabeçalhos aceitos, já normalizados (minúsculas, sem acentos, só letras e números). */
const profileHeaderSynonyms = Object.fromEntries(
  Object.entries(patientProfileLabels).map(([key, label]) => [
    key,
    [normalizeHeader(key), normalizeHeader(label)],
  ]),
);
const headerSynonyms: Partial<Record<ImportField, readonly string[]>> = {
  ...profileHeaderSynonyms,
  fullName: [
    "nome",
    "nomecompleto",
    "cliente",
    "nomedocliente",
    "nomecliente",
    "paciente",
    "nomedopaciente",
  ],
  cpf: ["cpf", "cpfdocliente"],
  phone: [
    "telefone",
    "celular",
    "fone",
    "tel",
    "telefonecelular",
    "telefoneprincipal",
  ],
  whatsapp: ["whatsapp", "whats", "wpp", "zap"],
  email: ["email", "correioeletronico"],
  birthDate: [
    "nascimento",
    "datadenascimento",
    "datanascimento",
    "dtnascimento",
    "aniversario",
  ],
  tags: ["etiquetas", "etiqueta", "tags", "tag"],
  notes: ["observacoes", "observacao", "obs", "notas", "anotacoes"],
  emergencyContactName: ["contatodeemergencia", "contatoemergencia"],
  emergencyContactPhone: ["telefonedeemergencia", "telefoneemergencia"],
};

const fieldLabels: Record<ImportField, string> = {
  ...patientProfileLabels,
  fullName: "nome",
  cpf: "CPF",
  phone: "telefone",
  whatsapp: "WhatsApp",
  email: "e-mail",
  birthDate: "data de nascimento",
  tags: "etiquetas",
  notes: "observações",
  emergencyContactName: "contato de emergência",
  emergencyContactPhone: "telefone de emergência",
};

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

function validDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Aceita dd/mm/aaaa ou aaaa-mm-dd; devolve aaaa-mm-dd ou null se inválida. */
function parseBirthDate(value: string): string | null {
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  let year: number;
  let month: number;
  let day: number;
  if (br) {
    [day, month, year] = [Number(br[1]), Number(br[2]), Number(br[3])];
  } else if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    return null;
  }
  if (!validDate(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function issueMessage(field: ImportField): string {
  switch (field) {
    default:
      return `${fieldLabels[field]} inválido.`;
    case "fullName":
      return "nome deve ter entre 3 e 160 caracteres.";
    case "cpf":
      return "CPF inválido (use 11 dígitos, com ou sem pontuação).";
    case "phone":
      return "telefone deve ter DDD (10 ou 11 dígitos).";
    case "whatsapp":
      return "WhatsApp deve ter DDD (10 ou 11 dígitos).";
    case "emergencyContactPhone":
      return "telefone de emergência deve ter DDD (10 ou 11 dígitos).";
    case "email":
      return "e-mail inválido.";
    case "birthDate":
      return "data de nascimento inválida (use dd/mm/aaaa).";
    case "tags":
      return "etiquetas: no máximo 20, cada uma com até 40 caracteres.";
    case "notes":
      return "observações devem ter no máximo 2000 caracteres.";
  }
}

function digitsOnly(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function emptyAnalysis(
  error: string,
  columns: PatientImportColumn[] = [],
  mapping: (PatientImportField | null)[] = [],
): PatientImportAnalysis {
  return {
    columns,
    mapping,
    rows: [],
    errors: [error],
    totals: { valid: 0, error: 0, duplicate: 0 },
  };
}

/**
 * Reconhece as colunas pelo título (sem diferenciar maiúsculas, acentos e pontuação):
 * `mapping[i]` é o campo da coluna `i` ou `null`. "DDD (Telefone)", como na planilha exportada,
 * vira o DDD separado do telefone correspondente. Cada campo fica com a primeira coluna que o usa.
 */
export function detectPatientImportMapping(
  header: readonly string[],
): (PatientImportField | null)[] {
  const used = new Set<PatientImportField>();
  return header.map((title) => {
    const normalized = normalizeHeader(title);
    const ddd = normalized.startsWith("ddd") ? normalized.slice(3) : undefined;
    for (const [field, synonyms] of Object.entries(headerSynonyms) as [
      ImportField,
      readonly string[],
    ][]) {
      const candidate: PatientImportField | undefined = synonyms.includes(
        normalized,
      )
        ? field
        : ddd &&
            synonyms.includes(ddd) &&
            (patientImportPhoneFields as readonly string[]).includes(field)
          ? (`${field as PhoneField}AreaCode` as const)
          : undefined;
      if (candidate && !used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    return null;
  });
}

function importColumns(
  header: readonly string[],
  dataRows: readonly (readonly string[])[],
): PatientImportColumn[] {
  return header.map((title, index) => {
    const samples: string[] = [];
    for (const row of dataRows) {
      const text = (row[index] ?? "").trim();
      if (text) samples.push(text.slice(0, 80));
      if (samples.length === 3) break;
    }
    return { index, title: title.trim(), samples };
  });
}

/**
 * Analisa as linhas lidas de CSV/XLSX: a primeira linha não vazia é o cabeçalho. `mapping` diz o
 * campo de cada coluna (ausente = reconhecido pelo título, ver `detectPatientImportMapping`).
 * Cada linha vira `valid`, `error` (com mensagens em pt-BR) ou `duplicate` (CPF ou telefone já na
 * base ou em uma linha válida anterior do arquivo). Com `configuredTags`, etiqueta fora da lista é
 * erro da linha e as aceitas passam a usar a grafia configurada (sem diferenciar maiúsculas/acentos).
 */
export function validatePatientImport(
  rows: readonly (readonly string[])[],
  existingPatients: readonly Patient[],
  configuredTags?: readonly Pick<PatientTag, "name">[],
  mapping?: readonly (PatientImportField | null)[],
): PatientImportAnalysis {
  const headerIndex = rows.findIndex((row) => !isBlankRow(row));
  const header = headerIndex >= 0 ? rows[headerIndex] : undefined;
  if (!header)
    return emptyAnalysis(
      "O arquivo está vazio. Inclua um cabeçalho com as colunas nome e telefone.",
    );

  // Linhas de dados podem ter mais células que o cabeçalho (coluna sem título); colunas vazias
  // no fim (comuns em XLSX com formatação) ficam de fora.
  const width = rows.reduce((max, row, index) => {
    if (index < headerIndex) return max;
    let last = row.length;
    while (last > max && (row[last - 1] ?? "").trim() === "") last -= 1;
    return Math.max(max, last);
  }, 0);
  const titles = Array.from(
    { length: width },
    (_, index) => header[index] ?? "",
  );
  const appliedMapping = mapping
    ? titles.map((_, index) => mapping[index] ?? null)
    : detectPatientImportMapping(titles);
  const columnInfo = importColumns(
    titles,
    rows.slice(headerIndex + 1).filter((row) => !isBlankRow(row)),
  );

  const columns = new Map<ImportField, number>();
  // A planilha exportada separa o telefone em "DDD (Telefone)" + "Telefone".
  const dddColumns = new Map<ImportField, number>();
  appliedMapping.forEach((field, index) => {
    if (!field) return;
    if (field.endsWith("AreaCode"))
      dddColumns.set(field.slice(0, -"AreaCode".length) as PhoneField, index);
    else columns.set(field as ImportField, index);
  });
  const missing = (["fullName", "phone"] as const).filter(
    (field) => !columns.has(field),
  );
  if (missing.length > 0) {
    const names = missing
      .map((field) => patientImportFieldLabels[field].toLowerCase())
      .join(" e ");
    return emptyAnalysis(
      `Escolha a coluna de ${names} da planilha.`,
      columnInfo,
      appliedMapping,
    );
  }

  const existingByCpf = new Map<string, Patient>();
  const existingByPhone = new Map<string, Patient>();
  for (const patient of existingPatients) {
    const cpf = digitsOnly(patient.cpf);
    if (cpf) existingByCpf.set(cpf, patient);
    const phone = digitsOnly(patient.phone);
    if (phone) existingByPhone.set(phone, patient);
  }
  const fileByCpf = new Map<string, number>();
  const fileByPhone = new Map<string, number>();

  const result: PatientImportRow[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    if (isBlankRow(row)) continue;
    const line = index + 1;
    const value = (field: ImportField): string => {
      const column = columns.get(field);
      const text = column === undefined ? "" : (row[column] ?? "").trim();
      const dddColumn = dddColumns.get(field);
      const ddd = digitsOnly(dddColumn === undefined ? "" : row[dddColumn]);
      return ddd.length === 2 && /^\d{8,9}$/.test(digitsOnly(text))
        ? ddd + digitsOnly(text)
        : text;
    };

    const fullName = value("fullName");
    const phone = value("phone");
    const errors: string[] = [];
    const raw: Record<string, unknown> = { fullName, phone };
    for (const field of [
      "cpf",
      "whatsapp",
      "email",
      "notes",
      "emergencyContactName",
      "emergencyContactPhone",
    ] as const) {
      const text = value(field);
      if (text) raw[field] = text;
    }
    const birth = value("birthDate");
    if (birth) {
      const parsed = parseBirthDate(birth);
      if (parsed) raw.birthDate = parsed;
      else errors.push(`Linha ${line}: ${issueMessage("birthDate")}`);
    }
    raw.tags = value("tags")
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    for (const key of Object.keys(
      patientProfileLabels,
    ) as (keyof typeof patientProfileLabels)[]) {
      const text = value(key);
      if (!text) continue;
      if (key === "interests")
        raw[key] = text
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      else if (key === "imageConsent")
        raw[key] = /^(sim|true|1)$/i.test(text)
          ? true
          : /^(não|nao|false|0)$/i.test(text)
            ? false
            : text;
      else if (key === "gender")
        raw[key] =
          Object.entries(patientProfileValueLabels).find(
            ([, label]) => normalizeHeader(label) === normalizeHeader(text),
          )?.[0] ?? text;
      else if (key === "residenceType")
        raw[key] =
          Object.entries(patientResidenceTypeLabels).find(
            ([, label]) => normalizeHeader(label) === normalizeHeader(text),
          )?.[0] ?? text;
      else if (key === "clientSince") raw[key] = parseBirthDate(text) ?? text;
      else raw[key] = text;
    }
    // CPF pode faltar na planilha (B6-05): o cliente entra com a etiqueta "Falta CPF".
    const parsed = patientImportInputSchema.safeParse(raw);
    if (!parsed.success) {
      const fields = new Set<ImportField>();
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && field in fieldLabels)
          fields.add(field as ImportField);
      }
      for (const field of fields) {
        errors.push(
          field === "phone" && phone === ""
            ? `Linha ${line}: telefone é obrigatório.`
            : `Linha ${line}: ${issueMessage(field)}`,
        );
      }
    }
    if (parsed.success && configuredTags) {
      // Etiqueta automática ("Pagamento atrasado") vinda da planilha é ignorada.
      const { tags, unknown } = resolvePatientTags(
        withoutAutomaticPatientTags(parsed.data.tags),
        configuredTags,
      );
      if (unknown.length > 0)
        errors.push(
          `Linha ${line}: ${unknown.length === 1 ? "etiqueta não configurada" : "etiquetas não configuradas"}: ${unknown.join(", ")}.`,
        );
      else parsed.data.tags = tags;
    }
    if (!parsed.success || errors.length > 0) {
      result.push({ line, status: "error", fullName, phone, errors });
      continue;
    }

    const input: PatientImportInput = parsed.data;
    const cpfKey = digitsOnly(input.cpf);
    const phoneKey = digitsOnly(input.phone);
    let duplicateOf: PatientImportDuplicate | undefined;
    const existingCpf = cpfKey ? existingByCpf.get(cpfKey) : undefined;
    const existingPhone = existingByPhone.get(phoneKey);
    const fileCpf = cpfKey ? fileByCpf.get(cpfKey) : undefined;
    const filePhone = fileByPhone.get(phoneKey);
    if (existingCpf) {
      duplicateOf = {
        kind: "existing",
        field: "cpf",
        patientId: existingCpf.id,
        fullName: existingCpf.fullName,
      };
    } else if (existingPhone) {
      duplicateOf = {
        kind: "existing",
        field: "phone",
        patientId: existingPhone.id,
        fullName: existingPhone.fullName,
      };
    } else if (fileCpf !== undefined) {
      duplicateOf = { kind: "row", field: "cpf", line: fileCpf };
    } else if (filePhone !== undefined) {
      duplicateOf = { kind: "row", field: "phone", line: filePhone };
    }

    if (duplicateOf) {
      result.push({
        line,
        status: "duplicate",
        fullName,
        phone,
        input,
        duplicateOf,
      });
      continue;
    }
    if (cpfKey) fileByCpf.set(cpfKey, line);
    fileByPhone.set(phoneKey, line);
    result.push({ line, status: "valid", fullName, phone, input });
  }

  const totals = { valid: 0, error: 0, duplicate: 0 };
  for (const row of result) totals[row.status] += 1;
  return {
    columns: columnInfo,
    mapping: appliedMapping,
    rows: result,
    errors: [],
    totals,
  };
}
