import type { PatientExportColumn, PatientProfileFilter } from "@crm/contracts";

/** Filtros e opções da exportação de clientes (`GET /patients/export`). */
export interface PatientExportParams extends PatientProfileFilter {
  format: "csv" | "xlsx";
  columns: PatientExportColumn[];
  search?: string;
  status?: "active" | "inactive";
  tags?: string[];
  birthdayMonth?: boolean;
  /** Assinantes sem turma vinculada. */
  withoutGroup?: boolean;
}

export function patientExportQuery(params: PatientExportParams) {
  const query = new URLSearchParams({
    format: params.format,
    columns: params.columns.join(","),
  });
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.status) query.set("status", params.status);
  if (params.tags?.length) query.set("tags", params.tags.join(","));
  if (params.birthdayMonth) query.set("birthdayMonth", "true");
  for (const key of [
    "city",
    "neighborhood",
    "occupation",
    "level",
    "source",
    "interest",
    "gender",
    "segment",
    "record",
  ] as const)
    if (params[key]) query.set(key, params[key]!);
  if (params.withoutGroup) query.set("withoutGroup", "true");
  return query.toString();
}
