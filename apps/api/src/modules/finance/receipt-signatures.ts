import type {
  PublicSignatureInput,
  PublicRequestMetadata,
  ReceiptSignature,
} from "@crm/contracts";
import type { DomainEventPublisher } from "../../infrastructure/domain-events.js";
import { DomainError, type ClinicRepository } from "../../repository.js";

/** Recibo cancelado (baixa estornada) não volta a ser enviado. */
export function assertReceiptNotCancelled(receipt: {
  cancelledAt?: string | undefined;
}) {
  if (receipt.cancelledAt)
    throw new DomainError(
      "RECEIPT_CANCELLED",
      "Este recibo foi cancelado porque a baixa foi estornada.",
      409,
    );
}

/** Só assina uma vez e nunca um recibo cancelado. */
export function assertReceiptSignable(receipt: {
  signedAt?: string | undefined;
  cancelledAt?: string | undefined;
}) {
  if (receipt.signedAt)
    throw new DomainError(
      "RECEIPT_ALREADY_SIGNED",
      "Este recibo já foi assinado.",
      409,
    );
  if (receipt.cancelledAt)
    throw new DomainError(
      "RECEIPT_NOT_AVAILABLE",
      "Este recibo foi cancelado e não pode mais ser assinado.",
      410,
    );
}

/**
 * Assina o recibo pelo token e, **depois do commit** da assinatura, publica `receipt.signed`.
 * Falhou a assinatura (recibo cancelado, já assinado, erro do banco): nenhum evento sai.
 */
export async function signReceipt(
  repository: Pick<ClinicRepository, "signPublicReceiptSignature">,
  events: DomainEventPublisher,
  token: string,
  input: PublicSignatureInput,
  metadata: PublicRequestMetadata,
): Promise<ReceiptSignature | null> {
  const receipt = await repository.signPublicReceiptSignature(
    token,
    input,
    metadata,
  );
  if (!receipt?.signedAt) return receipt;
  await events.publish({
    type: "receipt.signed",
    clinicId: receipt.clinicId,
    receiptId: receipt.id,
    receivableId: receipt.receivableId,
    patientId: receipt.patientId,
    amountInCents: receipt.amountInCents,
    signedAt: receipt.signedAt,
  });
  return receipt;
}
