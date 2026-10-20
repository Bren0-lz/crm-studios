import { z } from "zod";
export const externalOperationInputSchema = z.object({
  kind: z.enum(["fiscal", "partner"]),
  counterpart: z.string().trim().min(2).max(160),
  reference: z.string().trim().min(1).max(160),
  occurredOn: z.iso.date(),
  patientId: z.uuid().optional(),
  receivableId: z.uuid().optional(),
  notes: z.string().trim().max(2000).default(""),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  sizeInBytes: z.number().int().min(1).max(5242880),
  contentBase64: z.string().min(1).max(7000000),
});
export type ExternalOperationInput = z.infer<
  typeof externalOperationInputSchema
>;
export interface ExternalOperation extends Omit<
  ExternalOperationInput,
  "contentBase64"
> {
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  id: string;
  clinicId: string;
  patientName?: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  sha256: string;
}
export interface ExternalOperationContent {
  fileName: string;
  mimeType: ExternalOperationInput["mimeType"];
  contentBase64: string;
  sizeInBytes: number;
  sha256: string;
}
