import {
  patientFirstName,
  type DocumentKind,
  type IssuedDocument,
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

/** Mensagem pronta para enviar o documento emitido pelo WhatsApp. */
export function issuedDocumentMessage(document: IssuedDocument) {
  return `Olá, ${patientFirstName(document.patientName)}! Segue o documento "${document.title}" emitido pela clínica. Qualquer dúvida, é só responder esta mensagem.`;
}

/** wa.me sem número: o WhatsApp pede o contato e já abre com a mensagem. */
export function issuedDocumentWhatsappLink(document: IssuedDocument) {
  return `https://wa.me/?text=${encodeURIComponent(issuedDocumentMessage(document))}`;
}
