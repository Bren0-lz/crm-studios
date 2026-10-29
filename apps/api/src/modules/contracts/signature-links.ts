import { createHash, randomBytes } from "node:crypto";
import {
  signatureLinkExpired,
  type DocumentSignatureLinkView,
  type PublicRequestMetadata,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";

/** Token do link público: 32 bytes aleatórios em base64url (43 caracteres). */
export function createSignatureToken() {
  return randomBytes(32).toString("base64url");
}

export const signatureTokenPattern = /^[A-Za-z0-9_-]{43}$/;

/** Hash do texto emitido: comprova qual versão do documento foi assinada. */
export function documentTextSha256(body: string) {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/** Quantas visualizações detalhadas ficam guardadas (o contador continua somando). */
export const maxStoredSignatureViews = 50;

export function signatureLinkView(
  metadata: PublicRequestMetadata,
  viewedAt: string,
): DocumentSignatureLinkView {
  return {
    viewedAt,
    ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
    ...(metadata.userAgent
      ? { userAgent: metadata.userAgent.slice(0, 300) }
      : {}),
  };
}

/** Link vencido e sem assinatura: 410, sem registrar visualização nem aceitar assinatura. */
export function assertSignatureLinkOpen(link: {
  expiresAt: string;
  signedAt?: string;
}) {
  if (signatureLinkExpired(link))
    throw new DomainError(
      "DOCUMENT_SIGNATURE_LINK_EXPIRED",
      "Este link expirou. Peça um novo à clínica.",
      410,
    );
}
