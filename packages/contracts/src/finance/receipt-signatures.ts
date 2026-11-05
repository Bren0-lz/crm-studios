import type { DocumentSignatureLinkView } from "../contracts/types.js";
import type { PaymentReceipt } from "./types.js";

/**
 * Recibo para assinatura (B5-02): uma linha por baixa de parcela. Gerado na baixa, enviado
 * pelo WhatsApp, visualizado e assinado pelo cliente no link público; o estorno da baixa
 * cancela o recibo (mesmo assinado: fica no histórico como cancelado).
 */
export type ReceiptSignatureStatus =
  "generated" | "sent" | "viewed" | "signed" | "cancelled";

export interface ReceiptSignature {
  id: string;
  clinicId: string;
  receivableId: string;
  patientId: string;
  /** Data da baixa que gerou o recibo. */
  paidAt: string;
  /** Valor recebido nessa baixa. */
  amountInCents: number;
  token: string;
  createdAt: string;
  status: ReceiptSignatureStatus;
  sentAt?: string;
  viewCount: number;
  firstViewedAt?: string;
  lastViewedAt?: string;
  views: DocumentSignatureLinkView[];
  signedAt?: string;
  signerName?: string;
  signerCpf?: string;
  signerIpAddress?: string;
  signerUserAgent?: string;
  signatureImage?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

/** Motivo gravado quando o estorno da baixa cancela o recibo. */
export const receiptSignatureReversalReason = "Baixa estornada.";

/** Situação do recibo: cancelado vale sobre tudo; depois assinado, visualizado e enviado. */
export function receiptSignatureStatus(receipt: {
  cancelledAt?: string | undefined;
  signedAt?: string | undefined;
  viewCount: number;
  sentAt?: string | undefined;
}): ReceiptSignatureStatus {
  if (receipt.cancelledAt) return "cancelled";
  if (receipt.signedAt) return "signed";
  if (receipt.viewCount > 0) return "viewed";
  if (receipt.sentAt) return "sent";
  return "generated";
}

/**
 * O que o cliente vê no link público do recibo (sem token, IP nem dados internos).
 * `receipt` é o recibo da baixa (sem o telefone do cliente); ausente no recibo cancelado.
 */
export interface PublicReceiptSignature {
  status: "pending" | "signed" | "cancelled";
  amountInCents: number;
  paidAt: string;
  receipt?: Omit<PaymentReceipt, "patientPhone">;
  signedAt?: string;
  signerName?: string;
  /** Assinatura desenhada, devolvida só no recibo assinado (para imprimir). */
  signatureImage?: string;
  cancelledAt?: string;
}

/** Situação mostrada no link público: o cancelado vale sobre o assinado. */
export function publicReceiptSignatureStatus(receipt: {
  cancelledAt?: string | undefined;
  signedAt?: string | undefined;
}): PublicReceiptSignature["status"] {
  if (receipt.cancelledAt) return "cancelled";
  return receipt.signedAt ? "signed" : "pending";
}
