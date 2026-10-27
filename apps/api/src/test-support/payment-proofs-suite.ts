import { expect } from "vitest";
import type { ClinicRepository } from "../repository.js";
import { nextTestCpf } from "./cpf.js";

export const paymentProofsClinicId = "11111111-1111-4111-8111-111111111111";
export const paymentProofsActorId = "22222222-2222-4222-8222-222222222222";
const otherClinicId = "99999999-9999-4999-8999-999999999999";

/** Mesmo comportamento em memória e PostgreSQL: só baixas aceitam comprovante. */
export async function verifyPaymentProofsRepository(
  repository: ClinicRepository,
) {
  const clinicId = paymentProofsClinicId,
    actor = paymentProofsActorId;
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Cliente Comprovante",
    phone: "11988887777",
    tags: [],
  });
  const receivable = await repository.createManualReceivable(clinicId, actor, {
    patientId: patient.id,
    description: "Mensalidade com comprovante",
    amountInCents: 5000,
    dueDate: "2039-06-10",
  });
  const content = Buffer.from("%PDF-1.4\nComprovante\n%%EOF");
  const input = {
    fileName: "pix.pdf",
    mimeType: "application/pdf" as const,
    sizeInBytes: content.length,
    contentBase64: content.toString("base64"),
  };
  await expect(
    repository.createPaymentProof(
      clinicId,
      actor,
      "receivable",
      receivable.id,
      input,
    ),
  ).rejects.toMatchObject({ code: "PAYMENT_PROOF_NOT_SETTLED" });
  await repository.settleReceivable(clinicId, actor, receivable.id, "pix");
  const first = await repository.createPaymentProof(
    clinicId,
    actor,
    "receivable",
    receivable.id,
    input,
  );
  const second = await repository.createPaymentProof(
    clinicId,
    actor,
    "receivable",
    receivable.id,
    { ...input, fileName: "recibo.pdf" },
  );
  expect(first).toMatchObject({
    entityType: "receivable",
    entityId: receivable.id,
    fileName: "pix.pdf",
    authorId: actor,
    sizeInBytes: content.length,
  });
  expect(first).not.toHaveProperty("contentBase64");
  expect(
    (
      await repository.listPaymentProofs(clinicId, "receivable", receivable.id)
    ).map((proof) => proof.fileName),
  ).toEqual(["pix.pdf", "recibo.pdf"]);
  expect(
    await repository.getPaymentProofContent(clinicId, actor, second.id),
  ).toMatchObject({
    fileName: "recibo.pdf",
    contentBase64: input.contentBase64,
    sha256: second.sha256,
  });
  expect(
    await repository.listPaymentProofs(
      otherClinicId,
      "receivable",
      receivable.id,
    ),
  ).toEqual([]);
  expect(
    await repository.getPaymentProofContent(otherClinicId, actor, first.id),
  ).toBeNull();
  await expect(
    repository.createPaymentProof(
      clinicId,
      actor,
      "payable",
      receivable.id,
      input,
    ),
  ).rejects.toMatchObject({ code: "PAYMENT_PROOF_ENTITY_NOT_FOUND" });
  return receivable.id;
}
