import { z } from "zod";
import {
  documentSignatureInputSchema,
  documentKindSchema,
  documentStatusSchema,
  documentTemplateInputSchema,
  issuedDocumentInputSchema,
} from "./model.js";

export type DocumentKind = z.infer<typeof documentKindSchema>;

export type DocumentTemplateInput = z.infer<typeof documentTemplateInputSchema>;

export type IssuedDocumentInput = z.infer<typeof issuedDocumentInputSchema>;

export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export interface DocumentTemplate extends DocumentTemplateInput {
  id: string;
  clinicId: string;
  version: number;
  active: boolean;
  previousVersionId?: string;
  createdAt: string;
}

export type DocumentSignatureInput = z.infer<
  typeof documentSignatureInputSchema
>;
export type DocumentSignature = Omit<
  DocumentSignatureInput,
  "contentBase64"
> & { actorId: string; actorName: string; recordedAt: string; sha256: string };
export interface DocumentSignatureContent extends DocumentSignature {
  contentBase64: string;
}
export interface IssuedDocument extends IssuedDocumentInput {
  manualSignature?: DocumentSignature;
  id: string;
  clinicId: string;
  templateName: string;
  templateVersion: number;
  patientName: string;
  planName?: string;
  snapshotBody: string;
  status: DocumentStatus;
  issuedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}
