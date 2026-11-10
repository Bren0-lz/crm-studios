import type { PaymentProofEntity, PaymentProofInput } from "@crm/contracts";
import { api } from "../../api";
import { readFileBase64 } from "../../shared/lib/file-content";

export const acceptedProofTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
];

export function proofSizeLabel(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

/** Envia os comprovantes em sequência; devolve os nomes dos que falharam. */
export async function uploadPaymentProofs(
  entity: PaymentProofEntity,
  id: string,
  files: File[],
) {
  const failed: string[] = [];
  for (const file of files) {
    try {
      await api.createPaymentProof(entity, id, {
        fileName: file.name,
        mimeType: file.type as PaymentProofInput["mimeType"],
        sizeInBytes: file.size,
        contentBase64: await readFileBase64(file),
      });
    } catch {
      failed.push(file.name);
    }
  }
  return failed;
}

/** Aviso quando a baixa foi registrada, mas algum comprovante não subiu. */
export function proofFailureMessage(failed: string[]) {
  return failed.length === 1
    ? `O comprovante ${failed[0]} não foi enviado. Anexe-o novamente em “Comprovantes”.`
    : `${failed.length} comprovantes não foram enviados (${failed.join(", ")}). Anexe-os novamente em “Comprovantes”.`;
}
