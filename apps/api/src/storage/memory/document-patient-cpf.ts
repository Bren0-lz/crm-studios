import {
  documentRequiresPatientCpf,
  type IssuedDocument,
} from "@crm/contracts";
import type { MemoryRepositoryContext } from "./context.js";

export function withDocumentPatientCpf(
  context: MemoryRepositoryContext,
  document: IssuedDocument,
): IssuedDocument {
  const template = context.documentTemplates.find(
    (item) =>
      item.clinicId === document.clinicId && item.id === document.templateId,
  );
  const requiresPatientCpf =
    document.requiresPatientCpf ??
    (template ? documentRequiresPatientCpf(template) : false);
  const patient = context.patients.find(
    (item) =>
      item.clinicId === document.clinicId && item.id === document.patientId,
  );
  return {
    ...document,
    requiresPatientCpf,
    patientCpfMissing: Boolean(
      document.patientId && requiresPatientCpf && !patient?.cpf,
    ),
  };
}
