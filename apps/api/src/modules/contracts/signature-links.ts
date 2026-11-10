import { createHash } from "node:crypto";
import { signatureLinkExpired } from "@crm/contracts";
import { DomainError } from "../../repository.js";

/**
 * Regras só do documento emitido. Token, visualizações e dados de quem assina ficam em
 * `modules/signatures/signature-evidence.ts`, comuns ao recibo.
 */

/** Hash do texto emitido: comprova qual versão do documento foi assinada. */
export function documentTextSha256(body: string) {
  return createHash("sha256").update(body, "utf8").digest("hex");
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
