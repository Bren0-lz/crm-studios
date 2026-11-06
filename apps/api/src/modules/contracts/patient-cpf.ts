import { documentPatientCpfRequiredMessage } from "@crm/contracts";
import { DomainError } from "../../repository.js";

export function assertDocumentPatientCpf(document: {
  patientCpfMissing?: boolean;
}) {
  if (document.patientCpfMissing)
    throw new DomainError(
      "DOCUMENT_PATIENT_CPF_MISSING",
      documentPatientCpfRequiredMessage,
      409,
    );
}
