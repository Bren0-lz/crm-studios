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
  publicSignatureInputSchema,
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
  /** Versão antiga cujo texto foi restaurado nesta versão. */
  restoredFromVersion?: number;
  /** Quem criou a versão (vazio em versões gravadas antes do histórico). */
  createdById?: string;
  createdByName?: string;
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
  /** Exigência do modelo preservada junto do rascunho. */
  requiresPatientCpf?: boolean;
  /** Situação atual do cadastro, sem alterar o texto preservado. */
  patientCpfMissing?: boolean;
  snapshotContent?: DocumentContent;
  branding?: ClinicBranding;
  manualSignature?: DocumentSignature;
  signatureLink?: DocumentSignatureLink;
  id: string;
  clinicId: string;
  templateName: string;
  templateVersion: number;
  /** Nome de quem assina: o cliente ou, com `supplierId`, o fornecedor. */
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
  requiresPatientCpf?: boolean;
  patientCpfMissing?: boolean;
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

export type PublicSignatureInput = z.infer<typeof publicSignatureInputSchema>;

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
/** Envio pelo WhatsApp: documento atualizado, telefone de quem assina e nome da clínica. */
export interface DocumentSignatureLinkShare {
  document: IssuedDocument;
  token: string;
  /** WhatsApp (ou telefone) do cliente ou do fornecedor que assina. */
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
