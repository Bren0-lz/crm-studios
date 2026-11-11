import {
  formatExtraFields,
  matchesPatientProfile,
  patientProfileValueLabels,
  patientResidenceTypeLabels,
  patientExportColumnLabels,
  type Patient,
  type PatientExportColumn,
  type PatientExportFilter,
  type PatientLeadOrigin,
  type PatientPlan,
  splitPhone,
} from "@crm/contracts";
import {
  addTableSheet,
  createWorkbook,
  phoneColumns,
  sheetDate,
  sheetDateTime,
  workbookBuffer,
  type SheetColumn,
} from "../../infrastructure/spreadsheet.js";

/**
 * Aplica os filtros da exportação. `today` é a data da clínica (aaaa-mm-dd).
 * Etiquetas: basta **uma** das informadas. Aniversariantes: mês do nascimento
 * igual ao mês de `today` (29/02 continua em fevereiro). Plano ativo: existe
 * plano do cliente com status `active`. Resultado ordenado por nome.
 */
export function filterPatientsForExport(
  patients: Patient[],
  plans: PatientPlan[],
  filter: Partial<PatientExportFilter>,
  today: string,
): Patient[] {
  const withActivePlan = new Set(
    plans
      .filter((plan) => plan.status === "active")
      .map((plan) => plan.patientId),
  );
  const month = today.slice(5, 7);
  return patients
    .filter((patient) => matchesPatientProfile(patient, filter))
    .filter((patient) => !filter.status || patient.status === filter.status)
    .filter(
      (patient) =>
        !filter.tags?.length ||
        filter.tags.some((tag) => patient.tags.includes(tag)),
    )
    .filter(
      (patient) =>
        !filter.birthdayMonth || patient.birthDate?.slice(5, 7) === month,
    )
    .filter(
      (patient) =>
        filter.activePlan === undefined ||
        withActivePlan.has(patient.id) === filter.activePlan,
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
}

function brazilianDate(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function clinicDate(timestamp: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp));
}

/**
 * Coluna "Origem: evento/lead" (EN3b): por cliente, "Evento: <nome>" (lead de evento) ou
 * "Lead" (do funil), na ordem dos leads (mais antigo primeiro), sem repetir, separados por "; ".
 * Cliente sem lead convertido fica fora do mapa (célula vazia).
 */
export function patientLeadOriginLabels(
  origins: PatientLeadOrigin[],
): Map<string, string> {
  const labels = new Map<string, string[]>();
  for (const origin of origins) {
    const label = origin.eventName ? `Evento: ${origin.eventName}` : "Lead";
    const current = labels.get(origin.patientId) ?? [];
    if (!current.includes(label))
      labels.set(origin.patientId, [...current, label]);
  }
  return new Map(
    [...labels].map(([patientId, items]) => [patientId, items.join("; ")]),
  );
}

/** Dados de fora do cadastro usados por alguma coluna. */
export interface PatientExportExtras {
  /** Ver `patientLeadOriginLabels`. */
  leadOrigins?: ReadonlyMap<string, string>;
}

/** Colunas de telefone saem em duas: DDD e número. */
const phoneExportColumns = new Set<PatientExportColumn>([
  "phone",
  "whatsapp",
  "emergencyContactPhone",
  "emergencyContactWhatsapp",
  "guardianPhone",
]);
const isPhoneColumn = (
  column: PatientExportColumn,
): column is
  | "phone"
  | "whatsapp"
  | "emergencyContactPhone"
  | "emergencyContactWhatsapp"
  | "guardianPhone" => phoneExportColumns.has(column);

function textValue(
  patient: Patient,
  column: PatientExportColumn,
  extras: PatientExportExtras,
): string {
  switch (column) {
    case "gender":
      return (
        patientProfileValueLabels[
          patient[column] as keyof typeof patientProfileValueLabels
        ] ?? ""
      );
    case "residenceType":
      return patient.residenceType
        ? patientResidenceTypeLabels[patient.residenceType]
        : "";
    case "birthDate":
      return patient.birthDate ? brazilianDate(patient.birthDate) : "";
    case "clientSince":
      return patient.clientSince ? brazilianDate(patient.clientSince) : "";
    case "interests":
      return patient.interests?.join(", ") ?? "";
    case "imageConsent":
      return patient.imageConsent === undefined
        ? ""
        : patient.imageConsent
          ? "sim"
          : "não";
    case "tags":
      return patient.tags.join(", ");
    case "status":
      return patient.status === "active" ? "ativo" : "inativo";
    case "createdAt":
      return clinicDate(patient.createdAt);
    case "extraFields":
      return formatExtraFields(patient.extraFields);
    case "leadOrigin":
      return extras.leadOrigins?.get(patient.id) ?? "";
    default:
      return String(patient[column] ?? "");
  }
}

function columnHeaders(column: PatientExportColumn): string[] {
  const header = patientExportColumnLabels[column];
  return phoneExportColumns.has(column)
    ? [`DDD (${header})`, header]
    : [header];
}

function cellValues(
  patient: Patient,
  column: PatientExportColumn,
  extras: PatientExportExtras,
): string[] {
  if (!isPhoneColumn(column)) return [textValue(patient, column, extras)];
  const { ddd, number } = splitPhone(String(patient[column] ?? ""));
  return [ddd, number];
}

/** Cabeçalho + uma linha por cliente, só com as colunas pedidas (telefone em DDD + número). */
export function patientExportRows(
  patients: Patient[],
  columns: PatientExportColumn[],
  extras: PatientExportExtras = {},
): string[][] {
  return [
    columns.flatMap(columnHeaders),
    ...patients.map((patient) =>
      columns.flatMap((column) => cellValues(patient, column, extras)),
    ),
  ];
}

/** CSV em UTF-8 com BOM, separador `;` e linhas `\r\n`. */
export function patientsToCsv(
  patients: Patient[],
  columns: PatientExportColumn[],
  extras: PatientExportExtras = {},
): string {
  const escape = (text: string) =>
    /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  const lines = patientExportRows(patients, columns, extras).map((row) =>
    row.map(escape).join(";"),
  );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Datas como data do Excel (filtro por período funciona); o resto como no CSV. */
function sheetColumns(
  columns: PatientExportColumn[],
  extras: PatientExportExtras,
): SheetColumn<Patient>[] {
  return columns.flatMap((column): SheetColumn<Patient>[] => {
    const header = patientExportColumnLabels[column];
    if (isPhoneColumn(column))
      return phoneColumns(header, (patient) => String(patient[column] ?? ""));
    if (column === "birthDate" || column === "clientSince")
      return [
        {
          header,
          kind: "date",
          value: (patient) => sheetDate(patient[column]),
        },
      ];
    if (column === "createdAt")
      return [
        {
          header,
          kind: "datetime",
          value: (patient) => sheetDateTime(patient.createdAt),
        },
      ];
    return [{ header, value: (patient) => textValue(patient, column, extras) }];
  });
}

export async function patientsToXlsx(
  patients: Patient[],
  columns: PatientExportColumn[],
  extras: PatientExportExtras = {},
): Promise<Buffer> {
  const workbook = createWorkbook();
  addTableSheet(workbook, "Clientes", sheetColumns(columns, extras), patients);
  return workbookBuffer(workbook);
}
