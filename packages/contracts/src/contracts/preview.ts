import type { ClinicBranding } from "../administration/types.js";
import {
  documentContentFields,
  documentContentFromText,
  documentContentText,
  fillDocumentContent,
  type DocumentContent,
} from "./content.js";
import {
  documentTemplateVariables,
  type DocumentTemplateValues,
} from "./variables.js";

export function prepareDocumentContent(
  body: string,
  content: DocumentContent | undefined,
  values: DocumentTemplateValues,
) {
  const source = content ?? documentContentFromText(body);
  const fields = documentContentFields(source);
  const snapshotContent = fillDocumentContent(source, values);
  return {
    snapshotContent,
    snapshotBody: documentContentText(snapshotContent),
    missingFields: documentTemplateVariables
      .filter(
        (variable) =>
          fields.includes(variable.key) &&
          ["", "não informado", "Não vinculado"].includes(values[variable.key]),
      )
      .map(({ key, label }) => ({ key, label })),
  };
}

/** Apenas identificação pública; nunca guardar configurações administrativas no documento. */
export function documentBranding(
  clinic: Pick<ClinicBranding, "name" | "timezone"> &
    Partial<{ [K in keyof ClinicBranding]: ClinicBranding[K] | undefined }>,
): ClinicBranding {
  return {
    name: clinic.name,
    logoDataUrl: clinic.logoDataUrl ?? "",
    timezone: clinic.timezone,
    ...(clinic.legalName ? { legalName: clinic.legalName } : {}),
    ...(clinic.taxId ? { taxId: clinic.taxId } : {}),
    ...(clinic.address ? { address: clinic.address } : {}),
    ...(clinic.phone ? { phone: clinic.phone } : {}),
    ...(clinic.email ? { email: clinic.email } : {}),
  };
}
