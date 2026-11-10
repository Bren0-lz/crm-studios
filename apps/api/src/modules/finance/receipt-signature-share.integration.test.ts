import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import {
  receiptActorId,
  receiptClinicId,
  receiptFixtures,
} from "../../test-support/receipt-signatures-suite.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: receiptActorId, clinicId: receiptClinicId, role: "admin" })}`,
  };
  const { patient, receivable } = await receiptFixtures(repository);
  const shareUrl = `/finance/receivables/${receivable.id}/receipt-signature`;
  return { app, repository, headers, patient, receivable, shareUrl };
}

async function pay(
  app: Awaited<ReturnType<typeof buildApp>>,
  headers: Record<string, string>,
  receivableId: string,
) {
  const paid = await app.inject({
    method: "POST",
    url: `/finance/receivables/${receivableId}/pay`,
    headers,
    payload: { paymentMethod: "pix" },
  });
  expect(paid.statusCode, paid.body).toBe(200);
}

describe("envio do recibo pelo WhatsApp", () => {
  it("devolve o link e o contato sem marcar; o POST registra o primeiro envio", async () => {
    const { app, repository, headers, patient, receivable, shareUrl } =
      await setup();
    const before = await app.inject({ url: shareUrl, headers });
    expect(before.statusCode).toBe(404);
    expect(before.json().code).toBe("RECEIPT_SIGNATURE_NOT_FOUND");

    await pay(app, headers, receivable.id);
    const [receipt] = await repository.listReceiptSignatures(
      receiptClinicId,
      receivable.id,
    );
    const share = await app.inject({ url: shareUrl, headers });
    expect(share.statusCode).toBe(200);
    expect(share.json()).toEqual({
      receiptId: receipt!.id,
      receivableId: receivable.id,
      token: receipt!.token,
      path: `/assinar-recibo/${receipt!.token}`,
      status: "generated",
      patientName: patient.fullName,
      patientPhone: "11988887777",
      amountInCents: 5000,
      paidAt: receipt!.paidAt,
      messageTemplate: "",
      timezone: "America/Sao_Paulo",
    });
    // Só ler não conta como envio.
    const [unsent] = await repository.listReceiptSignatures(
      receiptClinicId,
      receivable.id,
    );
    expect(unsent!.sentAt).toBeUndefined();

    const sent = await app.inject({
      method: "POST",
      url: `${shareUrl}/sent`,
      headers,
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json()).toMatchObject({ status: "sent", token: receipt!.token });
    const firstSentAt = sent.json().sentAt as string;
    expect(firstSentAt).toEqual(expect.any(String));
    const again = await app.inject({
      method: "POST",
      url: `${shareUrl}/sent`,
      headers,
    });
    expect(again.json().sentAt).toBe(firstSentAt);
  });

  it("usa o modelo da clínica e o recibo da baixa em vigor depois do estorno", async () => {
    const { app, headers, receivable, shareUrl } = await setup();
    const settings = await app.inject({ url: "/admin/clinic-settings", headers });
    expect(settings.statusCode, settings.body).toBe(200);
    const saved = await app.inject({
      method: "PUT",
      url: "/admin/clinic-settings",
      headers,
      payload: {
        ...(settings.json() as Record<string, unknown>),
        paymentReceiptMessageTemplate: "Oi {{nome}}! {{link_recibo}}",
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().paymentReceiptMessageTemplate).toBe(
      "Oi {{nome}}! {{link_recibo}}",
    );

    await pay(app, headers, receivable.id);
    const first = (await app.inject({ url: shareUrl, headers })).json();
    expect(first.messageTemplate).toBe("Oi {{nome}}! {{link_recibo}}");
    const reversed = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/reverse`,
      headers,
    });
    expect(reversed.statusCode, reversed.body).toBe(200);
    // Estornado: não há recibo em vigor para enviar.
    const cancelled = await app.inject({
      method: "POST",
      url: `${shareUrl}/sent`,
      headers,
    });
    expect(cancelled.statusCode).toBe(404);

    await pay(app, headers, receivable.id);
    const second = (await app.inject({ url: shareUrl, headers })).json();
    expect(second.receiptId).not.toBe(first.receiptId);
    expect(second.token).not.toBe(first.token);
  });

  it("exige a permissão de receber para marcar o envio", async () => {
    const { app, repository, headers, receivable, shareUrl } = await setup();
    await pay(app, headers, receivable.id);
    const user = await repository.createAdminUser(
      receiptClinicId,
      receiptActorId,
      {
        fullName: "Leitura Financeiro",
        email: "leitura.recibo@teste.local",
        password: "Password123",
        role: "user",
        permissions: ["finance.view"],
      },
      "unused",
    );
    const reader = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId: receiptClinicId, role: "user" })}`,
    };
    expect((await app.inject({ url: shareUrl, headers: reader })).statusCode).toBe(
      200,
    );
    const denied = await app.inject({
      method: "POST",
      url: `${shareUrl}/sent`,
      headers: reader,
    });
    expect(denied.statusCode).toBe(403);
    const [receipt] = await repository.listReceiptSignatures(
      receiptClinicId,
      receivable.id,
    );
    expect(receipt!.sentAt).toBeUndefined();
  });

  it("não mostra o recibo de uma parcela de outra filial", async () => {
    const { app, headers, receivable, shareUrl } = await setup();
    await pay(app, headers, receivable.id);
    const created = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers,
      payload: { name: "Centro" },
    });
    expect(created.statusCode, created.body).toBe(201);
    const other = { ...headers, "x-branch-id": created.json().id as string };
    const share = await app.inject({ url: shareUrl, headers: other });
    expect(share.statusCode).toBe(404);
    expect(share.json().code).toBe("RECEIPT_SIGNATURE_NOT_FOUND");
    // Na filial da parcela, o mesmo admin vê o recibo.
    expect((await app.inject({ url: shareUrl, headers })).statusCode).toBe(200);
    const sent = await app.inject({
      method: "POST",
      url: `${shareUrl}/sent`,
      headers: other,
    });
    expect(sent.statusCode).toBe(404);
  });
});
