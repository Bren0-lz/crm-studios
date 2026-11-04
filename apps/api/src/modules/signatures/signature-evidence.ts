import { randomBytes } from "node:crypto";
import type {
  DocumentSignatureLinkView,
  PublicRequestMetadata,
} from "@crm/contracts";

/**
 * Peças comuns das assinaturas por link público (documento emitido e recibo): token,
 * registro das visualizações e os dados de quem assinou.
 */

/** Token do link público: 32 bytes aleatórios em base64url (43 caracteres). */
export function createSignatureToken() {
  return randomBytes(32).toString("base64url");
}

export const signatureTokenPattern = /^[A-Za-z0-9_-]{43}$/;

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

/** Visualizações guardadas depois de mais uma (só as últimas `maxStoredSignatureViews`). */
export function appendSignatureView(
  views: DocumentSignatureLinkView[],
  metadata: PublicRequestMetadata,
  viewedAt: string,
) {
  return [...views, signatureLinkView(metadata, viewedAt)].slice(
    -maxStoredSignatureViews,
  );
}

/** Quem assinou: nome, CPF opcional, IP e navegador (gravados junto da assinatura). */
export function signerEvidence(
  input: { signerName: string; signerCpf?: string | undefined },
  metadata: PublicRequestMetadata,
) {
  return {
    signerName: input.signerName,
    ...(input.signerCpf ? { signerCpf: input.signerCpf } : {}),
    ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
    ...(metadata.userAgent
      ? { userAgent: metadata.userAgent.slice(0, 300) }
      : {}),
  };
}
