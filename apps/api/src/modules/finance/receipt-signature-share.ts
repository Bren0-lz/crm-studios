import {
  receiptSignaturePath,
  type ReceiptSignature,
  type ReceiptSignatureShare,
} from "@crm/contracts";
import { DomainError, type ClinicRepository } from "../../repository.js";

type ShareRepository = Pick<
  ClinicRepository,
  | "listReceiptSignatures"
  | "markReceiptSignatureSent"
  | "getPatient"
  | "getClinicSettings"
>;

const notFound = () =>
  new DomainError(
    "RECEIPT_SIGNATURE_NOT_FOUND",
    "Esta parcela não tem recibo para assinatura.",
    404,
  );

/**
 * Recibo em vigor da parcela (o da última baixa não estornada) com o link e o contato do
 * cliente. A lista já respeita as filiais de quem lê: parcela de outra filial = 404.
 * `markSent`: registra o clique em "Enviar recibo pelo WhatsApp" (o 1º envio fica).
 */
export async function receiptSignatureShare(
  repository: ShareRepository,
  clinicId: string,
  receivableId: string,
  { markSent = false }: { markSent?: boolean } = {},
): Promise<ReceiptSignatureShare> {
  const receipts = await repository.listReceiptSignatures(
    clinicId,
    receivableId,
  );
  const current = receipts.filter((receipt) => !receipt.cancelledAt).at(-1);
  if (!current) throw notFound();
  const receipt: ReceiptSignature | null = markSent
    ? await repository.markReceiptSignatureSent(clinicId, current.id)
    : current;
  if (!receipt) throw notFound();
  const [patient, settings] = await Promise.all([
    repository.getPatient(clinicId, receipt.patientId),
    repository.getClinicSettings(clinicId),
  ]);
  const phone = patient?.whatsapp?.trim() || patient?.phone?.trim() || "";
  return {
    receiptId: receipt.id,
    receivableId: receipt.receivableId,
    token: receipt.token,
    path: receiptSignaturePath(receipt.token),
    status: receipt.status,
    patientName: patient?.fullName ?? "",
    ...(phone ? { patientPhone: phone } : {}),
    amountInCents: receipt.amountInCents,
    paidAt: receipt.paidAt,
    ...(receipt.sentAt ? { sentAt: receipt.sentAt } : {}),
    messageTemplate: settings?.paymentReceiptMessageTemplate ?? "",
    timezone: settings?.timezone ?? "America/Sao_Paulo",
  };
}
