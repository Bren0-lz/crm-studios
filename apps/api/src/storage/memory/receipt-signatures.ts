import {
  receiptSignatureReversalReason,
  receiptSignatureStatus,
  type PublicSignatureInput,
  type PublicRequestMetadata,
  type Receivable,
  type ReceiptSignature,
} from "@crm/contracts";
import {
  appendSignatureView,
  createSignatureToken,
} from "../../modules/signatures/signature-evidence.js";
import {
  assertReceiptSignable,
  assertReceiptNotCancelled,
} from "../../modules/finance/receipt-signatures.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

type Stored = MemoryRepositoryContext["receiptSignatures"][number];

const view = (stored: Stored): ReceiptSignature =>
  structuredClone({ ...stored, status: receiptSignatureStatus(stored) });

/** Recibo da baixa que acabou de ser registrada (mesma operação da baixa). */
export function issueReceiptSignature(
  context: MemoryRepositoryContext,
  receivable: Receivable,
) {
  context.receiptSignatures.push({
    id: uuid(),
    clinicId: receivable.clinicId,
    receivableId: receivable.id,
    patientId: receivable.patientId,
    paidAt: receivable.paidAt ?? now(),
    amountInCents: receivable.amountInCents,
    token: createSignatureToken(),
    createdAt: now(),
    viewCount: 0,
    views: [],
  });
}

/** Estorno da baixa: o recibo em aberto (ou já assinado) fica cancelado no histórico. */
export function cancelReceiptSignatures(
  context: MemoryRepositoryContext,
  clinicId: string,
  receivableId: string,
) {
  const cancelledAt = now();
  for (const receipt of context.receiptSignatures)
    if (
      receipt.clinicId === clinicId &&
      receipt.receivableId === receivableId &&
      !receipt.cancelledAt
    ) {
      receipt.cancelledAt = cancelledAt;
      receipt.cancelReason = receiptSignatureReversalReason;
    }
}

export function createReceiptSignaturesRepository(
  context: MemoryRepositoryContext,
) {
  const byToken = (token: string) =>
    context.receiptSignatures.find((receipt) => receipt.token === token);
  return {
    async listReceiptSignatures(clinicId: string, receivableId: string) {
      const receivable = context.receivables.find(
        (item) => item.clinicId === clinicId && item.id === receivableId,
      );
      if (!receivable || !context.inBranchScope(receivable)) return [];
      return context.receiptSignatures
        .filter(
          (receipt) =>
            receipt.clinicId === clinicId &&
            receipt.receivableId === receivableId,
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(view);
    },

    async markReceiptSignatureSent(clinicId: string, receiptId: string) {
      const receipt = context.receiptSignatures.find(
        (item) => item.clinicId === clinicId && item.id === receiptId,
      );
      if (!receipt) return null;
      assertReceiptNotCancelled(receipt);
      receipt.sentAt ??= now();
      return view(receipt);
    },

    async openPublicReceiptSignature(
      token: string,
      metadata: PublicRequestMetadata,
    ) {
      const receipt = byToken(token);
      if (!receipt) return null;
      const viewedAt = now();
      receipt.viewCount += 1;
      receipt.firstViewedAt ??= viewedAt;
      receipt.lastViewedAt = viewedAt;
      receipt.views = appendSignatureView(receipt.views, metadata, viewedAt);
      return view(receipt);
    },

    async signPublicReceiptSignature(
      token: string,
      input: PublicSignatureInput,
      metadata: PublicRequestMetadata,
    ) {
      const receipt = byToken(token);
      if (!receipt) return null;
      assertReceiptSignable(receipt);
      receipt.signedAt = now();
      receipt.signerName = input.signerName;
      if (input.signerCpf) receipt.signerCpf = input.signerCpf;
      if (metadata.ipAddress) receipt.signerIpAddress = metadata.ipAddress;
      if (metadata.userAgent)
        receipt.signerUserAgent = metadata.userAgent.slice(0, 300);
      receipt.signatureImage = input.signatureImage;
      return view(receipt);
    },
  };
}
