import type {
  ExternalOperationInput,
  ExternalOperation,
  ExternalOperationContent,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { inspectClinicalAttachment } from "../../modules/clinical/clinical-integrity.js";
import type { MemoryRepositoryContext } from "./context.js";
import { uuid, now } from "./helpers.js";
export function createExternalOperationsRepository(
  context: MemoryRepositoryContext,
) {
  const metadata = ({
    contentBase64,
    ...record
  }: ExternalOperation & { contentBase64: string }): ExternalOperation => {
    void contentBase64;
    return record;
  };
  return {
    async listExternalOperations(clinicId: string, patientId?: string) {
      return structuredClone(
        context.externalOperations
          .filter(
            (record) =>
              record.clinicId === clinicId &&
              // Na ficha do cliente valem todas as filiais (cadastro único).
              (patientId
                ? record.patientId === patientId
                : context.inBranchScope(record)),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(metadata),
      );
    },
    async createExternalOperation(
      clinicId: string,
      actorUserId: string,
      input: ExternalOperationInput,
    ) {
      const actor = context.users.find(
        (user) => user.clinicId === clinicId && user.id === actorUserId,
      );
      if (!actor)
        throw new DomainError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
      const receivable = input.receivableId
        ? context.receivables.find(
            (entry) =>
              entry.clinicId === clinicId && entry.id === input.receivableId,
          )
        : undefined;
      if (
        input.receivableId &&
        (!receivable ||
          (input.patientId && input.patientId !== receivable.patientId))
      )
        throw new DomainError(
          "EXTERNAL_OPERATION_RECEIVABLE",
          "Conta a receber ou cliente incompatível.",
          404,
        );
      const patientId = input.patientId ?? receivable?.patientId,
        patient = patientId
          ? context.patients.find(
              (entry) => entry.clinicId === clinicId && entry.id === patientId,
            )
          : undefined;
      if (patientId && !patient)
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      if (
        context.externalOperations.some(
          (record) =>
            record.clinicId === clinicId &&
            record.kind === input.kind &&
            record.counterpart.toLocaleLowerCase() ===
              input.counterpart.toLocaleLowerCase() &&
            record.reference.toLocaleLowerCase() ===
              input.reference.toLocaleLowerCase(),
        )
      )
        throw new DomainError(
          "EXTERNAL_OPERATION_EXISTS",
          "Esta referência já possui um registro para o emissor ou parceiro informado.",
          409,
        );
      const { sha256 } = inspectClinicalAttachment({
        ...input,
        patientId: patientId ?? clinicId,
      });
      const record = {
        ...input,
        ...(patientId ? { patientId } : {}),
        ...(patient ? { patientName: patient.fullName } : {}),
        id: uuid(),
        clinicId,
        branchId: context.writeBranchId(clinicId),
        authorId: actorUserId,
        authorName: actor.fullName,
        createdAt: now(),
        sha256,
      };
      context.externalOperations.push(record);
      context.recordAudit(
        clinicId,
        actorUserId,
        "external.operation_recorded",
        "external_operation",
        { kind: input.kind, reference: input.reference, sha256 },
        record.id,
      );
      return metadata(record);
    },
    async getExternalOperationContent(
      clinicId: string,
      actorUserId: string,
      id: string,
    ): Promise<ExternalOperationContent | null> {
      const record = context.externalOperations.find(
        (entry) => entry.clinicId === clinicId && entry.id === id,
      );
      if (!record) return null;
      context.recordAudit(
        clinicId,
        actorUserId,
        "external.operation_downloaded",
        "external_operation",
        { sha256: record.sha256 },
        id,
      );
      return {
        fileName: record.fileName,
        mimeType: record.mimeType,
        contentBase64: record.contentBase64,
        sizeInBytes: record.sizeInBytes,
        sha256: record.sha256,
      };
    },
  };
}
