import { z } from "zod";

/** Registros que recebem comprovantes: baixa de parcela, despesa paga e baixa conciliada. */
export const paymentProofEntitySchema = z.enum([
  "receivable",
  "payable",
  "commission_account_payment",
]);
export type PaymentProofEntity = z.infer<typeof paymentProofEntitySchema>;

/** Limites por arquivo e por baixa (os da baixa estornada não contam); um arquivo por pedido. */
export const paymentProofLimits = {
  maxFiles: 10,
  maxSizeInBytes: 5242880,
} as const;

export const paymentProofInputSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  sizeInBytes: z.number().int().min(1).max(paymentProofLimits.maxSizeInBytes),
  contentBase64: z.string().min(1).max(7000000),
});
export type PaymentProofInput = z.infer<typeof paymentProofInputSchema>;

export interface PaymentProof extends Omit<PaymentProofInput, "contentBase64"> {
  id: string;
  clinicId: string;
  entityType: PaymentProofEntity;
  entityId: string;
  sha256: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  /** A baixa deste comprovante foi estornada (fica no histórico). */
  reversedAt?: string;
}

/** Exclusão de comprovante enviado por engano: o motivo fica na auditoria. */
export const paymentProofDeletionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Informe o motivo (pelo menos 5 caracteres).")
    .max(500),
});

export interface PaymentProofContent {
  fileName: string;
  mimeType: PaymentProofInput["mimeType"];
  contentBase64: string;
  sizeInBytes: number;
  sha256: string;
}
