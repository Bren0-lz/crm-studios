import type { PaymentReceipt, Receivable } from "@crm/contracts";

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

/** Parcela do plano ("2 de 3") e parcelas no cartão, só quando houver parcelamento. */
export function receiptInstallments(
  receivable: Pick<
    Receivable,
    "installmentNumber" | "installmentCount" | "paymentInstallments"
  >,
): Pick<
  PaymentReceipt,
  "installmentNumber" | "installmentCount" | "paymentInstallments"
> {
  return {
    ...(receivable.installmentCount > 1
      ? {
          installmentNumber: receivable.installmentNumber,
          installmentCount: receivable.installmentCount,
        }
      : {}),
    ...(receivable.paymentInstallments
      ? { paymentInstallments: receivable.paymentInstallments }
      : {}),
  };
}
