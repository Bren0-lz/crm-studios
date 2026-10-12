import { createHash } from "node:crypto";
import type { ClinicalAttachmentInput, UserSummary } from "@crm/contracts";
import { DomainError } from "./repository.js";

const signatures: Record<ClinicalAttachmentInput["mimeType"], number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

/** Called after identifying/locking the existing record, so creation cannot overwrite a draft. */
export function assertClinicalWritePermission(user: Pick<UserSummary, "permissions"> | null, existing: boolean) {
  const permission = existing ? "clinical.records_update" : "clinical.records_create";
  if (!user?.permissions.includes(permission)) throw new DomainError(
    "CLINICAL_ACCESS_DENIED", "Seu usuário não possui permissão para salvar esta evolução.", 403, { permission },
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
  return {
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}
