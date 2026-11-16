import { documentClinicFieldsMessage } from "@crm/contracts";
import { DomainError } from "../../repository.js";

/** Modelo que usa dado da clínica sem cadastro (CNPJ, endereço…) não é emitido (E6). */
export function assertDocumentClinicFields(preview: {
  missingClinicFields?: ReadonlyArray<{ name: string }> | undefined;
}) {
  if (preview.missingClinicFields?.length)
    throw new DomainError(
      "DOCUMENT_CLINIC_DATA_MISSING",
      documentClinicFieldsMessage(preview.missingClinicFields),
      409,
    );
}
