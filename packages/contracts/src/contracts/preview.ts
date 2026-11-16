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

/** Regra do modelo original; editar o texto individual não remove a exigência. */
export function documentRequiresPatientCpf(template: {
  body: string;
  content?: DocumentContent | undefined;
}) {
  return documentContentFields(
    template.content ?? documentContentFromText(template.body),
  ).includes("paciente_cpf");
}

export const documentPatientCpfRequiredMessage =
  "Informe o CPF do cliente no cadastro antes de emitir este contrato ou gerar um novo link de assinatura.";

/**
 * Dados da clínica (Configurações › Clínica) que o contrato não emite em branco: com um deles
 * vazio, o modelo que usa o campo não é emitido. Nome e razão social sempre têm valor.
 */
const documentClinicRequiredFields = [
  { key: "clinica_cnpj", field: "taxId", name: "CNPJ" },
  { key: "clinica_endereco", field: "address", name: "endereço" },
  { key: "clinica_telefone", field: "phone", name: "telefone" },
  { key: "clinica_email", field: "email", name: "e-mail" },
] as const;

export type DocumentClinicData = Partial<
  Record<
    (typeof documentClinicRequiredFields)[number]["field"],
    string | null | undefined
  >
>;

/** Campos da clínica usados pelo modelo original e ainda sem cadastro. */
export function documentMissingClinicFields(
  template: { body: string; content?: DocumentContent | undefined },
  clinic: DocumentClinicData,
) {
  const fields = documentContentFields(
    template.content ?? documentContentFromText(template.body),
  );
  return documentClinicRequiredFields
    .filter((item) => fields.includes(item.key) && !clinic[item.field]?.trim())
    .map(({ key, name }) => ({ key, name }));
}

/** "Cadastre CNPJ e endereço da clínica em Configurações › Clínica antes de emitir…". */
export function documentClinicFieldsMessage(
  missing: ReadonlyArray<{ name: string }>,
) {
  const names = missing.map((item) => item.name);
  const list =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`
      : (names[0] ?? "");
  return `Cadastre ${list} da clínica em Configurações › Clínica antes de emitir este contrato.`;
}
