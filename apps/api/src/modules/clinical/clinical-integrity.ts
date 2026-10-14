import type {
  AssessmentField,
  ClinicalAssessmentInput,
  ClinicalAttachmentInput,
  UserSummary,
} from "@crm/contracts";
import { createHash } from "node:crypto";
import { DomainError } from "../../repository.js";

export function validateTemplateFields(fields: readonly AssessmentField[]) {
  if (new Set(fields.map((field) => field.key)).size !== fields.length)
    throw new DomainError(
      "ASSESSMENT_FIELD_DUPLICATE",
      "As chaves dos campos da avaliação devem ser únicas.",
      400,
    );
  for (const field of fields) {
    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    )
      throw new DomainError(
        "ASSESSMENT_INVALID_RANGE",
        "O mínimo não pode exceder o máximo.",
        400,
      );
    if (
      ["select", "multiselect"].includes(field.type) &&
      (!field.options?.length ||
        field.options.some((option) => !option.trim()) ||
        new Set(field.options).size !== field.options.length)
    )
      throw new DomainError(
        "ASSESSMENT_INVALID_OPTIONS",
        "Informe opções preenchidas e únicas para os campos de seleção.",
        400,
      );
  }
}
export function validateClinicalAnswers(
  fields: readonly AssessmentField[],
  values: ClinicalAssessmentInput["values"],
) {
  for (const key of Object.keys(values))
    if (!fields.some((field) => field.key === key && field.type !== "section"))
      throw new DomainError(
        "ASSESSMENT_INVALID_VALUE",
        "A resposta não corresponde a um campo do modelo.",
        400,
      );
  for (const field of fields) {
    if (field.type === "section") continue;
    const value = values[field.key];
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      if (field.required)
        throw new DomainError(
          "ASSESSMENT_REQUIRED_FIELD",
          `Preencha ${field.label}.`,
          400,
        );
      continue;
    }
    const expected =
      field.type === "number" || field.type === "scale"
        ? "number"
        : field.type === "boolean"
          ? "boolean"
          : "string";
    if (field.type === "multiselect") {
      if (
        !Array.isArray(value) ||
        value.some((item) => !field.options?.includes(item)) ||
        new Set(value).size !== value.length
      )
        throw new DomainError(
          "ASSESSMENT_INVALID_VALUE",
          `O valor de ${field.label} é inválido.`,
          400,
        );
    } else if (
      typeof value !== expected ||
      (field.type === "select" && !field.options?.includes(String(value)))
    )
      throw new DomainError(
        "ASSESSMENT_INVALID_VALUE",
        `O valor de ${field.label} é inválido.`,
        400,
      );
    if (
      typeof value === "number" &&
      ((field.min !== undefined && value < field.min) ||
        (field.max !== undefined && value > field.max))
    )
      throw new DomainError(
        "ASSESSMENT_VALUE_OUT_OF_RANGE",
        `O valor de ${field.label} está fora do intervalo permitido.`,
        400,
      );
  }
}

const signatures: Record<ClinicalAttachmentInput["mimeType"], number[]> = {
  "application/msword": [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    0x50, 0x4b, 0x03, 0x04,
  ],
  "audio/webm": [0x1a, 0x45, 0xdf, 0xa3],
  "audio/ogg": [0x4f, 0x67, 0x67, 0x53],
  "audio/mp4": [],
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

/** Called after identifying/locking the existing record, so creation cannot overwrite a draft. */
export function assertClinicalWritePermission(
  user: Pick<UserSummary, "permissions"> | null,
  existing: boolean,
) {
  const permission = existing
    ? "clinical.records_update"
    : "clinical.records_create";
  if (!user?.permissions.includes(permission))
    throw new DomainError(
      "CLINICAL_ACCESS_DENIED",
      "Seu usuário não possui permissão para salvar esta evolução.",
      403,
      { permission },
    );
}

export function inspectClinicalAttachment(input: ClinicalAttachmentInput) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.contentBase64))
    throw new DomainError(
      "CLINICAL_ATTACHMENT_INVALID_ENCODING",
      "O conteúdo do anexo não está em Base64 válido.",
    );
  const content = Buffer.from(input.contentBase64, "base64");
  if (content.length !== input.sizeInBytes)
    throw new DomainError(
      "CLINICAL_ATTACHMENT_SIZE_MISMATCH",
      "O tamanho informado não corresponde ao conteúdo do anexo.",
    );
  const expected = signatures[input.mimeType];
  if (!expected.every((byte, index) => content[index] === byte))
    throw new DomainError(
      "CLINICAL_ATTACHMENT_SIGNATURE_MISMATCH",
      "O conteúdo do arquivo não corresponde ao tipo informado.",
    );
  if (
    (input.mimeType === "audio/mp4" &&
      content.toString("ascii", 4, 8) !== "ftyp") ||
    (input.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      !content.includes(Buffer.from("word/")))
  )
    throw new DomainError(
      "CLINICAL_ATTACHMENT_SIGNATURE_MISMATCH",
      "O conteúdo do arquivo não corresponde ao tipo informado.",
    );
  return {
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}
