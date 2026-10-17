import type { PaymentReceipt } from "@crm/contracts";

/** Recibo sem campos opcionais vazios (o tipo não aceita string vazia como "informado"). */
export function receiptWithClinic(
  receipt: Omit<
    PaymentReceipt,
    | "patientPhone"
    | "clinicLegalName"
    | "clinicTaxId"
    | "clinicAddress"
    | "discountInCents"
    | "interestInCents"
  > & {
    patientPhone: string;
    clinicLegalName: string;
    clinicTaxId: string;
    clinicAddress: string;
    discountInCents: number;
    interestInCents: number;
  },
): PaymentReceipt {
  const {
    patientPhone,
    clinicLegalName,
    clinicTaxId,
    clinicAddress,
    discountInCents,
    interestInCents,
    ...base
  } = receipt;
  return {
    ...base,
    ...(patientPhone ? { patientPhone } : {}),
    ...(clinicLegalName ? { clinicLegalName } : {}),
    ...(clinicTaxId ? { clinicTaxId } : {}),
    ...(clinicAddress ? { clinicAddress } : {}),
    ...(discountInCents ? { discountInCents } : {}),
    ...(interestInCents ? { interestInCents } : {}),
  };
}
