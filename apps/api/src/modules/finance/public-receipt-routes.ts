import {
  publicDocumentSignInputSchema,
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
import { DEFAULT_CLINIC_TIMEZONE } from "./daily-cash.js";
import { signReceipt } from "./receipt-signatures.js";

const receiptLinkNotFound = {
  code: "RECEIPT_SIGNATURE_LINK_NOT_FOUND",
  message: "Link do recibo não encontrado.",
};

/** Recibo da baixa sem o telefone do cliente. */
async function receiptContent(
  repository: ClinicRepository,
  receipt: ReceiptSignature,
): Promise<Omit<PaymentReceipt, "patientPhone"> | null> {
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

/**
 * Recibo cancelado (baixa estornada), assinado ou não, mostra só o nome do estúdio: sem
 * conteúdo, valor, data, assinatura nem dados do cliente.
 */
export async function publicReceiptView(
  repository: ClinicRepository,
  receipt: ReceiptSignature,
): Promise<PublicReceiptSignature> {
  const status = publicReceiptSignatureStatus(receipt);
  const clinic = await repository.getClinicSettings(receipt.clinicId);
  if (status === "cancelled") return { status, clinicName: clinic?.name ?? "" };
  const content = await receiptContent(repository, receipt);
  return {
    status,
    amountInCents: receipt.amountInCents,
    paidAt: receipt.paidAt,
    // Fuso da clínica: a página mostra data e hora nele, não no do aparelho do cliente.
    timezone: clinic?.timezone ?? DEFAULT_CLINIC_TIMEZONE,
    ...(content ? { receipt: content } : {}),
    ...(receipt.signedAt ? { signedAt: receipt.signedAt } : {}),
    ...(receipt.signerName ? { signerName: receipt.signerName } : {}),
    ...(status === "signed" && receipt.signatureImage
      ? { signatureImage: receipt.signatureImage }
      : {}),
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
        publicDocumentSignInputSchema.parse(request.body),
        publicRequestMetadata(request),
      );
      return receipt
        ? publicReceiptView(repository, receipt)
        : reply.status(404).send(receiptLinkNotFound);
    },
  );
}
