import {
  fillMessageTemplate,
  patientFirstName,
} from "../communications/model.js";
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

/** Caminho da página pública onde o cliente lê e assina o recibo (o web soma a origem). */
export function receiptSignaturePath(token: string) {
  return `/assinar-recibo/${token}`;
}

/**
 * Recibo da baixa pronto para enviar pelo WhatsApp (RC3): link, contato do cliente e o
 * modelo da mensagem "recebemos seu pagamento" da clínica. Sem dados de assinatura.
 */
export interface ReceiptSignatureShare {
  receiptId: string;
  receivableId: string;
  token: string;
  /** `receiptSignaturePath(token)`. */
  path: string;
  status: ReceiptSignatureStatus;
  patientName: string;
  /** WhatsApp do cliente ou, sem ele, o telefone; ausente quando não há número. */
  patientPhone?: string;
  amountInCents: number;
  paidAt: string;
  sentAt?: string;
  /** Modelo da clínica (`paymentReceiptMessageVariables`); vazio = texto padrão. */
  messageTemplate: string;
  /** Fuso da clínica, para a data do pagamento na mensagem. */
  timezone: string;
}

/** Variáveis do modelo da mensagem "recebemos seu pagamento" (Configurações › Clínica). */
export const paymentReceiptMessageVariables = [
  { code: "{{nome}}", label: "Nome", example: "Marina" },
  { code: "{{valor}}", label: "Valor pago", example: "R$ 160,00" },
  {
    code: "{{data_pagamento}}",
    label: "Data do pagamento",
    example: "05/11/2026",
  },
  {
    code: "{{link_recibo}}",
    label: "Link do recibo",
    example: "https://crm.studiosaryana.com.br/assinar-recibo/…",
  },
] as const;

/** Texto usado quando a clínica não personalizou a mensagem. */
export const defaultPaymentReceiptMessageTemplate =
  "Olá {{nome}}, recebemos seu pagamento de {{valor}} em {{data_pagamento}}. Assine o recibo: {{link_recibo}}";

/**
 * Mensagem "recebemos seu pagamento" com o link de assinatura do recibo. `template` vazio usa
 * o texto padrão; a data do pagamento sai no fuso da clínica (padrão: São Paulo).
 */
export function paymentReceiptMessage(input: {
  patientName: string;
  amountInCents: number;
  paidAt: string;
  link: string;
  template?: string | undefined;
  timeZone?: string | undefined;
}): string {
  const value = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
    .format(input.amountInCents / 100)
    .replace(/\u00a0/g, " ");
  const paidOn = new Intl.DateTimeFormat("pt-BR", {
    timeZone: input.timeZone || "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(input.paidAt));
  return fillMessageTemplate(
    input.template?.trim() || defaultPaymentReceiptMessageTemplate,
    {
      nome: patientFirstName(input.patientName),
      valor: value,
      data_pagamento: paidOn,
      link_recibo: input.link,
    },
  );
}
