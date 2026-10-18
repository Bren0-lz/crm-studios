import {
  patientInputSchema,
  patientProfileLabels,
  patientProfileValueLabels,
  resolvePatientTags,
  withoutAutomaticPatientTags,
  type Patient,
  type PatientImportAnalysis,
  type PatientImportDuplicate,
  type PatientImportRow,
  type PatientInput,
  type PatientTag,
} from "@crm/contracts";
import ExcelJS from "exceljs";

type ImportField =
  | keyof typeof patientProfileLabels
  | "fullName"
  | "cpf"
  | "phone"
  | "whatsapp"
  | "email"
  | "birthDate"
  | "tags"
  | "notes";

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
};

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function detectSeparator(text: string): ";" | "," {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && char === ";") semicolons += 1;
    else if (!quoted && char === ",") commas += 1;
  }
  return semicolons >= commas && semicolons > 0 ? ";" : ",";
}

/**
 * Decodifica o conteúdo de um CSV: UTF-8 quando válido; senão Windows-1252 (Latin-1),
 * padrão do "CSV" salvo pelo Excel em português.
 */
export function decodeCsvText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Lê CSV com separador `;` ou `,` (detectado pela primeira linha), aspas duplas e BOM. */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith("﻿") ? text.slice(1) : text;
  if (source.length === 0) return [];
  const separator = detectSeparator(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(cell);
      cell = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function isoDateFromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return isoDateFromUtc(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if ("richText" in value)
    return value.richText.map((part) => part.text).join("");
  // Em planilhas reais o texto de um link pode vir como rich text.
  if ("hyperlink" in value)
    return cellToString(value.text as ExcelJS.CellValue);
  if ("formula" in value || "sharedFormula" in value) {
    const result = value.result;
    if (result === undefined) return "";
    if (result instanceof Date) return isoDateFromUtc(result);
    return typeof result === "object" ? "" : String(result);
  }
  return "";
}

/** Lê as linhas da primeira aba de um XLSX como texto (datas viram aaaa-mm-dd). */
export async function readXlsxRows(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  const columnCount = sheet.columnCount;
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cells: string[] = [];
    for (let column = 1; column <= columnCount; column += 1) {
      cells.push(cellToString(row.getCell(column).value));
    }
    rows.push(cells);
  }
  return rows;
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

function emptyAnalysis(error: string): PatientImportAnalysis {
  return {
    rows: [],
    errors: [error],
    totals: { valid: 0, error: 0, duplicate: 0 },
  };
}

/**
 * Analisa as linhas lidas de CSV/XLSX: a primeira linha não vazia é o cabeçalho. Cada linha vira
 * `valid`, `error` (com mensagens em pt-BR) ou `duplicate` (CPF ou telefone já na base ou em uma
 * linha válida anterior do arquivo). Com `configuredTags`, etiqueta fora da lista é erro da linha
 * e as aceitas passam a usar a grafia configurada (sem diferenciar maiúsculas/acentos).
 */
export function validatePatientImport(
  rows: readonly (readonly string[])[],
  existingPatients: readonly Patient[],
  configuredTags?: readonly Pick<PatientTag, "name">[],
): PatientImportAnalysis {
  const headerIndex = rows.findIndex((row) => !isBlankRow(row));
  const header = headerIndex >= 0 ? rows[headerIndex] : undefined;
  if (!header)
    return emptyAnalysis(
      "O arquivo está vazio. Inclua um cabeçalho com as colunas nome e telefone.",
    );

  const columns = new Map<ImportField, number>();
  header.forEach((title, index) => {
    const normalized = normalizeHeader(title);
    for (const [field, synonyms] of Object.entries(headerSynonyms) as [
      ImportField,
      readonly string[],
    ][]) {
      if (!columns.has(field) && synonyms.includes(normalized))
        columns.set(field, index);
    }
  });
  const missing = (["fullName", "phone"] as const).filter(
    (field) => !columns.has(field),
  );
  if (missing.length > 0) {
    const names = missing.map((field) => fieldLabels[field]).join(" e ");
    return emptyAnalysis(
      `Coluna obrigatória ausente: ${names}. A primeira linha da planilha deve ter os títulos das colunas (ex.: Nome, Telefone).`,
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
      return column === undefined ? "" : (row[column] ?? "").trim();
    };

    const fullName = value("fullName");
    const phone = value("phone");
    const errors: string[] = [];
    const raw: Record<string, unknown> = { fullName, phone };
    for (const field of ["cpf", "whatsapp", "email", "notes"] as const) {
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
      else if (key === "gender" || key === "clientType")
        raw[key] =
          Object.entries(patientProfileValueLabels).find(
            ([, label]) => normalizeHeader(label) === normalizeHeader(text),
          )?.[0] ?? text;
      else if (key === "clientSince") raw[key] = parseBirthDate(text) ?? text;
      else raw[key] = text;
    }
    const parsed = patientInputSchema.safeParse(raw);
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

    const input: PatientInput = parsed.data;
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
  return { rows: result, errors: [], totals };
}
