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
  const metadata = ({
    contentBase64,
    ...record
  }: PaymentProof & { contentBase64: string }): PaymentProof => {
    void contentBase64;
    return record;
  };
  // Só registros já pagos/recebidos aceitam comprovante.
  function assertSettled(
    clinicId: string,
    entityType: PaymentProofEntity,
    entityId: string,
  ) {
    const owned = (entry: { clinicId: string; id: string }) =>
      entry.clinicId === clinicId && entry.id === entityId;
    const entry =
      entityType === "receivable"
        ? context.receivables.find(owned)
        : entityType === "payable"
          ? context.payables.find(owned)
          : context.commissionAccountPayments.find(owned);
    if (!entry)
      throw new DomainError(
        "PAYMENT_PROOF_ENTITY_NOT_FOUND",
        "Registro financeiro não encontrado.",
        404,
      );
    const settled =
      "status" in entry ? entry.status === "paid" : !entry.reversedAt;
    if (!settled)
      throw new DomainError(
        "PAYMENT_PROOF_NOT_SETTLED",
        "Registre o pagamento antes de anexar comprovantes.",
        409,
      );
  }
  return {
    async listPaymentProofs(
      clinicId: string,
      entityType: PaymentProofEntity,
      entityId: string,
    ) {
      return structuredClone(
        context.paymentProofs
          .filter(
            (record) =>
              record.clinicId === clinicId &&
              record.entityType === entityType &&
              record.entityId === entityId,
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map(metadata),
      );
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
      assertSettled(clinicId, entityType, entityId);
      if (
        context.paymentProofs.filter(
          (record) =>
            record.clinicId === clinicId &&
            record.entityType === entityType &&
            record.entityId === entityId,
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
      const record = {
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
      const record = context.paymentProofs.find(
        (entry) => entry.clinicId === clinicId && entry.id === id,
      );
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
  };
}
