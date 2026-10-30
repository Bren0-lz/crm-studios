import type {
  DocumentSignatureInput,
  DocumentContent,
  DocumentPreview,
  DocumentDraftInput,
  DocumentSignatureContent,
  DocumentSignatureLinkDetails,
  DocumentSignatureLinkShare,
  PublicDocumentSignInput,
  PublicSignatureDocument,
  DocumentStatus,
  DocumentTemplate,
  DocumentTemplateInput,
  IssuedDocument,
  IssuedDocumentInput,
} from "@crm/contracts";
import { request } from "../transport";

export const contractsApi = {
  recordDocumentSignature: (id: string, input: DocumentSignatureInput) =>
    request<IssuedDocument>(`/documents/${id}/signature`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createDocumentSignatureLink: (id: string) =>
    request<DocumentSignatureLinkShare>(`/documents/${id}/signature-link`, {
      method: "POST",
    }),
  documentSignatureLink: (id: string) =>
    request<DocumentSignatureLinkDetails>(`/documents/${id}/signature-link`),
  /** Link público: o cliente lê o documento sem login (registra a visualização). */
  publicSignatureDocument: (token: string) =>
    request<PublicSignatureDocument>(
      `/public/document-signatures/${encodeURIComponent(token)}`,
    ),
  signPublicDocument: (token: string, input: PublicDocumentSignInput) =>
    request<PublicSignatureDocument>(
      `/public/document-signatures/${encodeURIComponent(token)}`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  documentSignatureContent: (id: string) =>
    request<DocumentSignatureContent>(`/documents/${id}/signature/content`),
  documentTemplates: () => request<DocumentTemplate[]>("/document-templates"),
  createDocumentTemplate: (input: DocumentTemplateInput) =>
    request<DocumentTemplate>("/document-templates", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createDocumentTemplateVersion: (
    id: string,
    body: string,
    content?: DocumentContent,
  ) =>
    request<DocumentTemplate>(`/document-templates/${id}/versions`, {
      method: "POST",
      body: JSON.stringify({ body, ...(content ? { content } : {}) }),
    }),
  deleteDocumentTemplate: (id: string) =>
    request<void>(`/document-templates/${id}`, { method: "DELETE" }),
  previewDocument: (input: IssuedDocumentInput) =>
    request<DocumentPreview>("/documents/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateDocumentDraft: (id: string, input: DocumentDraftInput) =>
    request<IssuedDocument>(`/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  documents: () => request<IssuedDocument[]>("/documents"),
  createDocument: (input: IssuedDocumentInput) =>
    request<IssuedDocument>("/documents", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateDocumentStatus: (
    id: string,
    status: Exclude<DocumentStatus, "draft">,
  ) =>
    request<IssuedDocument>(`/documents/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
