import {
  paymentProofLimits,
  type PaymentProof,
  type PaymentProofContent,
  type PaymentProofEntity,
  type PaymentProofInput,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { inspectClinicalAttachment } from "../../modules/clinical/clinical-integrity.js";
import type { MemoryRepositoryContext } from "./context.js";
import { uuid, now } from "./helpers.js";
export function createPaymentProofsRepository(
  context: MemoryRepositoryContext,
) {
  type Stored = MemoryRepositoryContext["paymentProofs"][number];
  const metadata = ({
    contentBase64,
    deletedAt,
    deletedByUserId,
    deletionReason,
    ...record
  }: Stored): PaymentProof => {
    void contentBase64;
    void deletedAt;
    void deletedByUserId;
    void deletionReason;
    return record;
  };
  /** Registro da baixa nas filiais da leitura em curso (fora delas = não encontrado). */
  function entityOf(
    clinicId: string,
    entityType: PaymentProofEntity,
    entityId: string,
  ) {
    const owned = (entry: { clinicId: string; id: string }) =>
      entry.clinicId === clinicId && entry.id === entityId;
    if (entityType === "receivable") {
      const entry = context.receivables.find(owned);
      return entry && context.inBranchScope(entry)
        ? { settled: entry.status === "paid" }
        : null;
    }
    if (entityType === "payable") {
      const entry = context.payables.find(owned);
      return entry && context.inBranchScope(entry)
        ? { settled: entry.status === "paid" }
        : null;
    }
    const entry = context.commissionAccountPayments.find(owned);
    return entry && context.professionalInBranchScope(entry.professionalId)
      ? { settled: !entry.reversedAt }
      : null;
  }
  function visibleProof(clinicId: string, id: string) {
    const record = context.paymentProofs.find(
      (entry) => entry.clinicId === clinicId && entry.id === id,
    );
    return record &&
      !record.deletedAt &&
      entityOf(clinicId, record.entityType, record.entityId)
      ? record
      : undefined;
  }
  return {
    async listPaymentProofs(
      clinicId: string,
      entityType: PaymentProofEntity,
      entityId: string,
    ) {
      if (!entityOf(clinicId, entityType, entityId)) return [];
      return structuredClone(
        context.paymentProofs
          .filter(
            (record) =>
              record.clinicId === clinicId &&
              record.entityType === entityType &&
              record.entityId === entityId &&
              !record.deletedAt,
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map(metadata),
      );
    },
    async listPaymentProofEntityIds(
      clinicId: string,
      entityType: "receivable" | "payable",
    ) {
      const ids = new Set(
        context.paymentProofs
          .filter(
            (record) =>
              record.clinicId === clinicId &&
              record.entityType === entityType &&
              !record.deletedAt,
          )
          .map((record) => record.entityId),
      );
      return [...ids].filter((id) => entityOf(clinicId, entityType, id));
    },
    async createPaymentProof(
      clinicId: string,
      actorUserId: string,
      entityType: PaymentProofEntity,
      entityId: string,
      input: PaymentProofInput,
    ) {
      const actor = context.users.find(
        (user) => user.clinicId === clinicId && user.id === actorUserId,
      );
      if (!actor)
        throw new DomainError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
      const entity = entityOf(clinicId, entityType, entityId);
      if (!entity)
        throw new DomainError(
          "PAYMENT_PROOF_ENTITY_NOT_FOUND",
          "Registro financeiro não encontrado.",
          404,
        );
      // Só registros já pagos/recebidos aceitam comprovante.
      if (!entity.settled)
        throw new DomainError(
          "PAYMENT_PROOF_NOT_SETTLED",
          "Registre o pagamento antes de anexar comprovantes.",
          409,
        );
      if (
        context.paymentProofs.filter(
          (record) =>
            record.clinicId === clinicId &&
            record.entityType === entityType &&
            record.entityId === entityId &&
            !record.deletedAt &&
            !record.reversedAt,
        ).length >= paymentProofLimits.maxFiles
      )
        throw new DomainError(
          "PAYMENT_PROOF_LIMIT",
          `Cada registro aceita até ${paymentProofLimits.maxFiles} comprovantes.`,
          409,
        );
      const { sha256 } = inspectClinicalAttachment({
        ...input,
        patientId: clinicId,
        notes: "",
      });
      const record: Stored = {
        ...input,
        id: uuid(),
        clinicId,
        entityType,
        entityId,
        authorId: actorUserId,
        authorName: actor.fullName,
        createdAt: now(),
        sha256,
      };
      context.paymentProofs.push(record);
      context.recordAudit(
        clinicId,
        actorUserId,
        "finance.payment_proof_attached",
        "payment_proof",
        { entityType, entityId, fileName: input.fileName, sha256 },
        record.id,
      );
      return metadata(record);
    },
    async getPaymentProofContent(
      clinicId: string,
      actorUserId: string,
      id: string,
    ): Promise<PaymentProofContent | null> {
      const record = visibleProof(clinicId, id);
      if (!record) return null;
      context.recordAudit(
        clinicId,
        actorUserId,
        "finance.payment_proof_downloaded",
        "payment_proof",
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
    async deletePaymentProof(
      clinicId: string,
      actorUserId: string,
      id: string,
      reason: string,
    ) {
      const record = visibleProof(clinicId, id);
      if (!record) return null;
      record.deletedAt = now();
      record.deletedByUserId = actorUserId;
      record.deletionReason = reason;
      context.recordAudit(
        clinicId,
        actorUserId,
        "finance.payment_proof_deleted",
        "payment_proof",
        {
          entityType: record.entityType,
          entityId: record.entityId,
          fileName: record.fileName,
          sha256: record.sha256,
          reason,
        },
        id,
      );
      return metadata(record);
    },
    /** Tipo do registro do comprovante (para a permissão de excluir). */
    async findPaymentProofEntity(clinicId: string, id: string) {
      const record = visibleProof(clinicId, id);
      return record ? record.entityType : null;
    },
  };
}
