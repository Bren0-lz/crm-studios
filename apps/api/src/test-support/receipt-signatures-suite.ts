import {
  patientInputSchema,
  productInputSchema,
  receiptSignatureReversalReason,
  saoPauloToday,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import {
  createDomainEventPublisher,
  type DomainEvent,
} from "../infrastructure/domain-events.js";
import { signReceipt } from "../modules/finance/receipt-signatures.js";
import type { ClinicRepository } from "../repository.js";
import { nextTestCpf } from "./cpf.js";

export const receiptClinicId = "11111111-1111-4111-8111-111111111111";
export const receiptActorId = "22222222-2222-4222-8222-222222222222";
const otherClinicId = "99999999-9999-4999-8999-999999999999";

const signInput = {
  signerName: "Cliente Recibo",
  signerCpf: "",
  accepted: true as const,
  signatureImage: "data:image/png;base64,iVBORw0KGgo=",
};
const metadata = { ipAddress: "203.0.113.7", userAgent: "Safari iPhone" };

export async function receiptFixtures(repository: ClinicRepository) {
  const patient = await repository.createPatient(
    receiptClinicId,
    patientInputSchema.parse({
      cpf: nextTestCpf(),
      fullName: `Cliente Recibo ${randomUUID().slice(0, 8)}`,
      phone: "11988887777",
      whatsapp: "11988887777",
      emergencyContactName: "Contato Recibo",
      emergencyContactPhone: "11977776666",
    }),
  );
  const receivable = await repository.createManualReceivable(
    receiptClinicId,
    receiptActorId,
    {
      patientId: patient.id,
      description: "Mensalidade com recibo",
      amountInCents: 5000,
      dueDate: "2039-06-10",
    },
  );
  return { patient, receivable };
}

/** Baixa gera o recibo; estorno cancela; nova baixa gera outro (um por baixa). */
export async function verifyReceiptLifecycle(repository: ClinicRepository) {
  const { patient, receivable } = await receiptFixtures(repository);
  const list = () =>
    repository.listReceiptSignatures(receiptClinicId, receivable.id);
  expect(await list()).toEqual([]);

  const paid = await repository.settleReceivable(
    receiptClinicId,
    receiptActorId,
    receivable.id,
    "cash",
    { paidAt: "2026-11-03T13:00:00.000Z" },
  );
  const [first] = await list();
  expect(first).toMatchObject({
    clinicId: receiptClinicId,
    receivableId: receivable.id,
    patientId: patient.id,
    paidAt: paid!.paidAt,
    amountInCents: 5000,
    status: "generated",
    viewCount: 0,
    views: [],
  });
  expect(first!.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(first).not.toHaveProperty("signedAt");
  expect(first).not.toHaveProperty("cancelledAt");

  const sent = await repository.markReceiptSignatureSent(
    receiptClinicId,
    first!.id,
  );
  expect(sent).toMatchObject({ status: "sent", sentAt: expect.any(String) });
  // O primeiro envio fica.
  expect(
    (await repository.markReceiptSignatureSent(receiptClinicId, first!.id))
      ?.sentAt,
  ).toBe(sent!.sentAt);
  expect(
    await repository.markReceiptSignatureSent(otherClinicId, first!.id),
  ).toBeNull();

  const viewed = await repository.openPublicReceiptSignature(
    first!.token,
    metadata,
  );
  expect(viewed).toMatchObject({
    status: "viewed",
    viewCount: 1,
    firstViewedAt: expect.any(String),
    views: [
      {
        viewedAt: expect.any(String),
        ipAddress: "203.0.113.7",
        userAgent: "Safari iPhone",
      },
    ],
  });
  expect(
    await repository.openPublicReceiptSignature("x".repeat(43), metadata),
  ).toBeNull();

  await repository.reverseReceivablePayment(
    receiptClinicId,
    receiptActorId,
    receivable.id,
  );
  const [cancelled] = await list();
  expect(cancelled).toMatchObject({
    id: first!.id,
    status: "cancelled",
    cancelledAt: expect.any(String),
    cancelReason: receiptSignatureReversalReason,
  });
  await expect(
    repository.signPublicReceiptSignature(first!.token, signInput, metadata),
  ).rejects.toMatchObject({ code: "RECEIPT_NOT_AVAILABLE", statusCode: 410 });
  await expect(
    repository.markReceiptSignatureSent(receiptClinicId, first!.id),
  ).rejects.toMatchObject({ code: "RECEIPT_CANCELLED" });

  // Nova baixa (parcial): outro recibo, com o valor recebido nela.
  await repository.settleReceivable(
    receiptClinicId,
    receiptActorId,
    receivable.id,
    "pix",
    undefined,
    { receivedInCents: 3000 },
  );
  const receipts = await list();
  expect(receipts.map((item) => item.status)).toEqual([
    "cancelled",
    "generated",
  ]);
  expect(receipts[1]).toMatchObject({ amountInCents: 3000 });
  expect(receipts[1]!.token).not.toBe(first!.token);

  expect(
    await repository.listReceiptSignatures(otherClinicId, receivable.id),
  ).toEqual([]);
}

/** Assinar emite `receipt.signed` uma vez, depois do commit; falhas não emitem. */
export async function verifyReceiptSigning(repository: ClinicRepository) {
  const { patient, receivable } = await receiptFixtures(repository);
  await repository.settleReceivable(
    receiptClinicId,
    receiptActorId,
    receivable.id,
    "cash",
  );
  const [receipt] = await repository.listReceiptSignatures(
    receiptClinicId,
    receivable.id,
  );
  const events: DomainEvent[] = [];
  const statusWhenPublished: string[] = [];
  const publisher = createDomainEventPublisher();
  publisher.subscribe("receipt.signed", async (event) => {
    // Lido por outra consulta: só aparece assinado se a assinatura já foi gravada.
    const [stored] = await repository.listReceiptSignatures(
      event.clinicId,
      event.receivableId,
    );
    statusWhenPublished.push(stored!.status);
    events.push(event);
  });
  // Assinante com falha não desfaz a assinatura nem impede os demais.
  publisher.subscribe("receipt.signed", () => {
    throw new Error("Telegram fora do ar");
  });

  const signed = await signReceipt(
    repository,
    publisher,
    receipt!.token,
    { ...signInput, signerCpf: "" },
    metadata,
  );
  expect(signed).toMatchObject({
    status: "signed",
    signedAt: expect.any(String),
    signerName: "Cliente Recibo",
    signerIpAddress: "203.0.113.7",
    signerUserAgent: "Safari iPhone",
    signatureImage: signInput.signatureImage,
  });
  expect(signed).not.toHaveProperty("signerCpf");
  expect(events).toEqual([
    {
      type: "receipt.signed",
      clinicId: receiptClinicId,
      receiptId: receipt!.id,
      receivableId: receivable.id,
      patientId: patient.id,
      amountInCents: 5000,
      signedAt: signed!.signedAt,
    },
  ]);
  expect(statusWhenPublished).toEqual(["signed"]);

  // Segunda assinatura e token desconhecido: nada é emitido de novo.
  await expect(
    signReceipt(repository, publisher, receipt!.token, signInput, metadata),
  ).rejects.toMatchObject({ code: "RECEIPT_ALREADY_SIGNED", statusCode: 409 });
  expect(
    await signReceipt(
      repository,
      publisher,
      "y".repeat(43),
      signInput,
      metadata,
    ),
  ).toBeNull();
  expect(events).toHaveLength(1);

  // Estorno depois de assinado: o recibo fica cancelado, com a assinatura no histórico.
  await repository.reverseReceivablePayment(
    receiptClinicId,
    receiptActorId,
    receivable.id,
  );
  expect(
    (await repository.listReceiptSignatures(receiptClinicId, receivable.id))[0],
  ).toMatchObject({
    status: "cancelled",
    signedAt: signed!.signedAt,
    cancelReason: receiptSignatureReversalReason,
  });
}

/** Venda paga no balcão (comanda fechada paga) também é baixa: gera recibo; o estorno cancela. */
export async function verifyPaidSaleReceipt(repository: ClinicRepository) {
  const { patient } = await receiptFixtures(repository);
  const product = await repository.createProduct(
    receiptClinicId,
    receiptActorId,
    productInputSchema.parse({
      name: `Produto ${randomUUID().slice(0, 8)}`,
      sku: randomUUID().slice(0, 12),
      costInCents: 1_000,
      salePriceInCents: 2_500,
      initialStock: 3,
    }),
  );
  const sale = await repository.createProductSale(
    receiptClinicId,
    receiptActorId,
    {
      patientId: patient.id,
      items: [{ productId: product.id, quantity: 2 }],
      settlement: "paid",
      paymentMethod: "cash",
      dueDate: saoPauloToday(),
    },
  );
  const receipts = () =>
    repository.listReceiptSignatures(receiptClinicId, sale.receivableId!);
  expect(await receipts()).toMatchObject([
    {
      patientId: patient.id,
      amountInCents: 5_000,
      status: "generated",
    },
  ]);
  await repository.cancelPatientTab(receiptClinicId, receiptActorId, sale.id, {
    refundPayment: true,
    reason: "Cliente desistiu",
  });
  expect((await receipts()).map((item) => item.status)).toEqual(["cancelled"]);
}
