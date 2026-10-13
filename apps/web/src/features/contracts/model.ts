import type { DocumentKind } from "@crm/contracts";
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
