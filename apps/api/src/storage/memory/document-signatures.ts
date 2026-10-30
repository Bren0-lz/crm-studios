import type {
  DocumentSignatureInput,
  DocumentSignatureContent,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { inspectClinicalAttachment } from "../../modules/clinical/clinical-integrity.js";
import { now } from "./helpers.js";
export function createDocumentSignaturesRepository(
  context: MemoryRepositoryContext,
) {
  const files = new Map<string, DocumentSignatureContent>();
  return {
    async recordDocumentSignature(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: DocumentSignatureInput,
    ) {
      const document = context.issuedDocuments.find(
          (item) => item.clinicId === clinicId && item.id === id,
        ),
        actor = context.users.find(
          (item) => item.clinicId === clinicId && item.id === actorUserId,
        );
      if (!document || !actor)
        throw new DomainError(
          "DOCUMENT_NOT_FOUND",
          "Documento não encontrado.",
          404,
        );
      if (document.status !== "issued" || document.manualSignature)
        throw new DomainError(
          "DOCUMENT_SIGNATURE_CONFLICT",
          "Somente documentos emitidos sem assinatura registrada aceitam este registro.",
          409,
        );
      // Só confere o arquivo: o vínculo com cliente não é usado na checagem.
      const { sha256 } = inspectClinicalAttachment({
        ...input,
        patientId: document.patientId ?? "",
      });
      const { contentBase64, ...metadata } = input;
      const signature = {
        ...metadata,
        actorId: actorUserId,
        actorName: actor.fullName,
        sha256,
        recordedAt: now(),
      };
      document.manualSignature = signature;
      document.updatedAt = now();
      files.set(id, { ...signature, contentBase64 });
      context.recordAudit(
        clinicId,
        actorUserId,
        "document.signature_recorded",
        "document",
        { signedOn: input.signedOn, sha256 },
        id,
      );
      return structuredClone(document);
    },
    async getDocumentSignatureContent(
      clinicId: string,
      actorUserId: string,
      id: string,
    ) {
      if (
        !context.issuedDocuments.some(
          (item) => item.clinicId === clinicId && item.id === id,
        )
      )
        return null;
      const file = files.get(id);
      if (!file) return null;
      context.recordAudit(
        clinicId,
        actorUserId,
        "document.signature_downloaded",
        "document",
        { sha256: file.sha256 },
        id,
      );
      return structuredClone(file);
    },
  };
}
