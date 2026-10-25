import { createHash, randomBytes } from "node:crypto";
import type {
  DocumentSignatureLinkView,
  PublicRequestMetadata,
} from "@crm/contracts";

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
