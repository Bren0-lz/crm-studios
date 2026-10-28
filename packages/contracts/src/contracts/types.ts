import { z } from "zod";
import type { ClinicBranding } from "../administration/types.js";
import type { DocumentContent } from "./content.js";
import {
  documentSignatureInputSchema,
  documentKindSchema,
  documentStatusSchema,
  documentTemplateInputSchema,
  issuedDocumentInputSchema,
  publicDocumentSignInputSchema,
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
  snapshotContent?: DocumentContent;
  branding?: ClinicBranding;
  manualSignature?: DocumentSignature;
  signatureLink?: DocumentSignatureLink;
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

export interface DocumentPreview {
  snapshotBody: string;
  snapshotContent: DocumentContent;
  branding: ClinicBranding;
  missingFields: Array<{ key: string; label: string }>;
  templateName: string;
  templateVersion: number;
  patientName: string;
  planName?: string;
}
export interface DocumentDraftInput {
  title: string;
  content: DocumentContent;
}

export type PublicDocumentSignInput = z.infer<
  typeof publicDocumentSignInputSchema
>;
/** Resumo do link de assinatura enviado ao cliente (aparece na lista de documentos). */
export interface DocumentSignatureLink {
  token: string;
  createdAt: string;
  /** Até quando o link abre; depois, "Enviar para assinatura" gera outro. */
  expiresAt: string;
  createdByName: string;
  viewCount: number;
  firstViewedAt?: string;
  lastViewedAt?: string;
  signedAt?: string;
  signerName?: string;
}
export interface DocumentSignatureLinkView {
  viewedAt: string;
  ipAddress?: string;
  userAgent?: string;
}
/** Comprovante completo: visualizações e a assinatura com IP, navegador e hash do texto. */
export interface DocumentSignatureLinkDetails extends DocumentSignatureLink {
  views: DocumentSignatureLinkView[];
  signerCpf?: string;
  signatureImage?: string;
  signerIpAddress?: string;
  signerUserAgent?: string;
  documentSha256?: string;
}
/** Envio pelo WhatsApp: documento atualizado, telefone do cliente e nome da clínica. */
export interface DocumentSignatureLinkShare {
  document: IssuedDocument;
  token: string;
  patientPhone?: string;
  clinicName: string;
}
/** O que o cliente vê no link público (sem dados internos da clínica). */
export interface PublicSignatureDocument {
  title: string;
  patientName: string;
  clinicName: string;
  snapshotBody: string;
  snapshotContent?: DocumentContent;
  branding?: ClinicBranding;
  status: "pending" | "signed" | "cancelled";
  documentSha256: string;
  signedAt?: string;
  signerName?: string;
}
/** Dados de quem acessou o link, registrados junto da visualização e da assinatura. */
export interface PublicRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}
