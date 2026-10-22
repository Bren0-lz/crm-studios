import {
  matchesPatientProfile,
  patientProfileValueLabels,
  patientExportColumnLabels,
  type Patient,
  type PatientExportColumn,
  type PatientExportFilter,
  type PatientPlan,
} from "@crm/contracts";
import ExcelJS from "exceljs";

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

function cellValue(patient: Patient, column: PatientExportColumn): string {
  switch (column) {
    case "gender":
      return (
        patientProfileValueLabels[
          patient[column] as keyof typeof patientProfileValueLabels
        ] ?? ""
      );
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
    default:
      return String(patient[column] ?? "");
  }
}

/** Cabeçalho + uma linha por cliente, só com as colunas pedidas. */
export function patientExportRows(
  patients: Patient[],
  columns: PatientExportColumn[],
): string[][] {
  return [
    columns.map((column) => patientExportColumnLabels[column]),
    ...patients.map((patient) =>
      columns.map((column) => cellValue(patient, column)),
    ),
  ];
}

/** CSV em UTF-8 com BOM, separador `;` e linhas `\r\n`. */
export function patientsToCsv(
  patients: Patient[],
  columns: PatientExportColumn[],
): string {
  const escape = (text: string) =>
    /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  const lines = patientExportRows(patients, columns).map((row) =>
    row.map(escape).join(";"),
  );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function patientsToXlsx(
  patients: Patient[],
  columns: PatientExportColumn[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Studios Aryana";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Clientes");
  sheet.columns = columns.map((column) => ({
    header: patientExportColumnLabels[column],
    key: column,
    width: Math.max(14, patientExportColumnLabels[column].length + 4),
  }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF3D625B" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  sheet.addRows(patientExportRows(patients, columns).slice(1));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
