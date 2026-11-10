import {
  documentSignatureMessage,
  formatPhone,
  whatsappLink,
  type DocumentSignatureLinkShare,
  type ClinicBranding,
  type DocumentKind,
  type IssuedDocument,
  signatureLinkExpired,
} from "@crm/contracts";
import { api } from "../../api";
import { shortDate, timeLabel } from "../../shared/lib/formatting";

/** Data e hora da assinatura no link público ("01 de out., 14:30"). */
export function signatureMoment(iso: string) {
  const date = new Date(iso);
  return `${shortDate.format(date)}, ${timeLabel.format(date)}`;
}

export const documentKindLabels: Record<DocumentKind, string> = {
  contract: "Contrato",
  attendance_declaration: "Declaração de comparecimento",
  consent: "Termo de consentimento",
  other: "Outro",
};

/** Situação do documento na lista: junta a situação da emissão e a da assinatura. */
export type DocumentSituation =
  | "draft"
  | "issued"
  | "awaiting_signature"
  | "link_expired"
  | "signed"
  | "cancelled";

export const documentSituationLabels: Record<DocumentSituation, string> = {
  draft: "Rascunho",
  issued: "Emitido",
  awaiting_signature: "Aguardando assinatura",
  link_expired: "Link expirado",
  signed: "Assinado",
  cancelled: "Cancelado",
};

/** Classe de `status-pill` de cada situação. */
export const documentSituationPills: Record<DocumentSituation, string> = {
  draft: "open",
  issued: "issued",
  awaiting_signature: "draft",
  link_expired: "expired",
  signed: "active",
  cancelled: "cancelled",
};

export function documentSituation(
  document: IssuedDocument,
  at: Date = new Date(),
): DocumentSituation {
  if (document.status === "cancelled") return "cancelled";
  if (document.status === "draft") return "draft";
  if (document.manualSignature || document.signatureLink?.signedAt)
    return "signed";
  if (document.signatureLink)
    return signatureLinkExpired(document.signatureLink, at)
      ? "link_expired"
      : "awaiting_signature";
  return "issued";
}

export interface DocumentFilters {
  search: string;
  situation: DocumentSituation | "";
  template: string;
}

export const emptyDocumentFilters: DocumentFilters = {
  search: "",
  situation: "",
  template: "",
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/** Busca por título, cliente/fornecedor ou modelo (sem acento) e filtra por situação e modelo. */
export function filterDocuments(
  documents: IssuedDocument[],
  filters: DocumentFilters,
  at: Date = new Date(),
) {
  const terms = normalized(filters.search).split(/\s+/).filter(Boolean);
  return documents.filter((document) => {
    if (
      filters.situation &&
      documentSituation(document, at) !== filters.situation
    )
      return false;
    if (filters.template && document.templateName !== filters.template)
      return false;
    if (!terms.length) return true;
    const text = normalized(
      [document.title, document.patientName, document.templateName].join(" "),
    );
    return terms.every((term) => text.includes(term));
  });
}

export function fetchContractsPageData(canSeePlans: boolean) {
  return Promise.all([
    api.documentTemplates(),
    api.documents(),
    api.patientOptions(),
    // Planos são opcionais no documento: quem não vê Planos emite sem vincular plano.
    canSeePlans ? api.plans() : Promise.resolve([]),
    api.professionals(),
  ]);
}

export function professionalWithCrefito(name: string, crefito?: string) {
  if (!crefito) return name;
  return `${name} · ${/crefito/i.test(crefito) ? crefito : `CREFITO ${crefito}`}`;
}

/** Endereço público onde o cliente lê e assina o documento. */
export function signatureLinkUrl(token: string) {
  return `${window.location.origin}/assinar-contrato/${token}`;
}

/** Link do WhatsApp com a mensagem e o link de assinatura; sem telefone, o WhatsApp pede o contato. */
export function signatureWhatsappLink(share: DocumentSignatureLinkShare) {
  const message = documentSignatureMessage({
    patientName: share.document.patientName,
    clinicName: share.clinicName,
    link: signatureLinkUrl(share.token),
    supplier: Boolean(share.document.supplierId),
  });
  return share.patientPhone
    ? whatsappLink(share.patientPhone, message)
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** Identificação da empresa no cabeçalho, uma linha por dado: razão social, CNPJ, endereço e contato. */
export function companyIdentification(
  branding?: ClinicBranding | null | undefined,
) {
  if (!branding?.name) return [];
  const legalName = branding.legalName?.trim() || branding.name;
  return [
    legalName,
    branding.taxId?.trim() ? `CNPJ ${branding.taxId.trim()}` : "",
    branding.address?.trim() ?? "",
    [formatPhone(branding.phone ?? ""), branding.email?.trim()]
      .filter(Boolean)
      .join(" · "),
  ].filter(Boolean);
}
