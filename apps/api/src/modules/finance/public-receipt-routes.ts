import {
  publicSignatureInputSchema,
  publicReceiptSignatureStatus,
  type PaymentReceipt,
  type PublicReceiptSignature,
  type ReceiptSignature,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError, type ClinicRepository } from "../../repository.js";
import {
  createPublicSignatureLimiter,
  publicRequestMetadata,
  publicSignatureBodyLimit,
  publicSignatureTokenParams,
} from "../signatures/public-signature-guard.js";
import { signReceipt } from "./receipt-signatures.js";

const receiptLinkNotFound = {
  code: "RECEIPT_SIGNATURE_LINK_NOT_FOUND",
  message: "Link do recibo não encontrado.",
};

/** Recibo da baixa sem o telefone do cliente; o cancelado (baixa estornada) não mostra. */
async function receiptContent(
  repository: ClinicRepository,
  receipt: ReceiptSignature,
): Promise<Omit<PaymentReceipt, "patientPhone"> | null> {
  if (receipt.cancelledAt) return null;
  try {
    const content = await repository.getPaymentReceipt(
      receipt.clinicId,
      receipt.receivableId,
    );
    if (!content) return null;
    // Sem o telefone do cliente; valor e data são os da baixa que gerou este recibo.
    const visible: PaymentReceipt = { ...content };
    delete visible.patientPhone;
    return {
      ...visible,
      amountInCents: receipt.amountInCents,
      paidAt: receipt.paidAt,
    };
  } catch (error) {
    if (error instanceof DomainError) return null;
    throw error;
  }
}

export async function publicReceiptView(
  repository: ClinicRepository,
  receipt: ReceiptSignature,
): Promise<PublicReceiptSignature> {
  const status = publicReceiptSignatureStatus(receipt);
  const content = await receiptContent(repository, receipt);
  return {
    status,
    amountInCents: receipt.amountInCents,
    paidAt: receipt.paidAt,
    ...(content ? { receipt: content } : {}),
    ...(receipt.signedAt ? { signedAt: receipt.signedAt } : {}),
    ...(receipt.signerName ? { signerName: receipt.signerName } : {}),
    ...(status === "signed" && receipt.signatureImage
      ? { signatureImage: receipt.signatureImage }
      : {}),
    ...(receipt.cancelledAt ? { cancelledAt: receipt.cancelledAt } : {}),
  };
}

/** Link do recibo enviado ao cliente (B5-02): sem login, o token aleatório identifica o recibo. */
export function registerPublicReceiptRoutes(context: RouteContext) {
  const { app, repository, events } = context;
  const limitPublicSignature = createPublicSignatureLimiter();

  app.get(
    "/public/receipt-signatures/:token",
    { onRequest: limitPublicSignature },
    async (request, reply) => {
      const params = publicSignatureTokenParams.safeParse(request.params);
      const receipt =
        params.success &&
        (await repository.openPublicReceiptSignature(
          params.data.token,
          publicRequestMetadata(request),
        ));
      return receipt
        ? publicReceiptView(repository, receipt)
        : reply.status(404).send(receiptLinkNotFound);
    },
  );
  app.post(
    "/public/receipt-signatures/:token",
    { bodyLimit: publicSignatureBodyLimit, onRequest: limitPublicSignature },
    async (request, reply) => {
      const params = publicSignatureTokenParams.safeParse(request.params);
      if (!params.success) return reply.status(404).send(receiptLinkNotFound);
      const receipt = await signReceipt(
        repository,
        events,
        params.data.token,
        publicSignatureInputSchema.parse(request.body),
        publicRequestMetadata(request),
      );
      return receipt
        ? publicReceiptView(repository, receipt)
        : reply.status(404).send(receiptLinkNotFound);
    },
  );
}
