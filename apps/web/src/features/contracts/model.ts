import {
  documentSignatureMessage,
  formatPhone,
  whatsappLink,
  type DocumentSignatureLinkShare,
  type ClinicBranding,
  type DocumentKind,
} from "@crm/contracts";
import { api } from "../../api";

export const documentKindLabels: Record<DocumentKind, string> = {
  contract: "Contrato",
  attendance_declaration: "Declaração de comparecimento",
  consent: "Termo de consentimento",
  other: "Outro",
};

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
