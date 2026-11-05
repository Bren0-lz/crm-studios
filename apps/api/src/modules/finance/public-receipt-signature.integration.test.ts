import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import {
  createDomainEventPublisher,
  type DomainEvent,
} from "../../infrastructure/domain-events.js";
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

const signatureImage = "data:image/png;base64,iVBORw0KGgo=";

async function paidReceipt() {
  const repository = new MemoryClinicRepository();
  const events: DomainEvent[] = [];
  const publisher = createDomainEventPublisher();
  publisher.subscribe("receipt.signed", (event) => {
    events.push(event);
  });
  const app = await buildApp({ repository, logger: false, events: publisher });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: receiptActorId, clinicId: receiptClinicId, role: "admin" })}`,
  };
  const { patient, receivable } = await receiptFixtures(repository);
  const paid = await app.inject({
    method: "POST",
    url: `/finance/receivables/${receivable.id}/pay`,
    headers,
    payload: { paymentMethod: "pix" },
  });
  expect(paid.statusCode).toBe(200);
  const [receipt] = await repository.listReceiptSignatures(
    receiptClinicId,
    receivable.id,
  );
  return {
    app,
    repository,
    headers,
    patient,
    receivable,
    receipt: receipt!,
    events,
    url: `/public/receipt-signatures/${receipt!.token}`,
  };
}

describe("link público do recibo", () => {
  it("mostra o recibo sem login, registra a visualização e assina uma vez", async () => {
    const { app, repository, patient, receivable, receipt, events, url } =
      await paidReceipt();

    const opened = await app.inject({
      method: "GET",
      url,
      headers: { "user-agent": "iPhone Safari" },
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toMatchObject({
      status: "pending",
      amountInCents: 5000,
      paidAt: receipt.paidAt,
      receipt: {
        patientName: patient.fullName,
        description: "Mensalidade com recibo",
        amountInCents: 5000,
        paymentMethod: "pix",
      },
    });
    // Nada de token, IP, telefone ou ids internos no link público.
    expect(opened.body).not.toContain(receipt.token);
    expect(opened.body).not.toContain(receivable.id);
    expect(opened.json().receipt).not.toHaveProperty("patientPhone");
    expect(opened.json()).not.toHaveProperty("signatureImage");

    const [viewed] = await repository.listReceiptSignatures(
      receiptClinicId,
      receivable.id,
    );
    expect(viewed).toMatchObject({ status: "viewed", viewCount: 1 });
    expect(viewed!.views[0]).toMatchObject({ userAgent: "iPhone Safari" });

    const signed = await app.inject({
      method: "POST",
      url,
      headers: { "user-agent": "iPhone Safari" },
      payload: {
        signerName: patient.fullName,
        signerCpf: "529.982.247-25",
        accepted: true,
        signatureImage,
      },
    });
    expect(signed.statusCode).toBe(200);
    expect(signed.json()).toMatchObject({
      status: "signed",
      signerName: patient.fullName,
      signatureImage,
      receipt: { patientName: patient.fullName },
    });
    expect(signed.json().signedAt).toEqual(expect.any(String));
    expect(events).toEqual([
      expect.objectContaining({
        type: "receipt.signed",
        receiptId: receipt.id,
        receivableId: receivable.id,
        amountInCents: 5000,
      }),
    ]);
    const [stored] = await repository.listReceiptSignatures(
      receiptClinicId,
      receivable.id,
    );
    expect(stored).toMatchObject({
      status: "signed",
      signerCpf: "52998224725",
      signerUserAgent: "iPhone Safari",
      signatureImage,
    });

    // Reaberto: mostra o assinado (com a imagem, para imprimir) e não assina de novo.
    expect((await app.inject({ method: "GET", url })).json()).toMatchObject({
      status: "signed",
      signatureImage,
    });
    const again = await app.inject({
      method: "POST",
      url,
      payload: { signerName: "Outra Pessoa", accepted: true, signatureImage },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe("RECEIPT_ALREADY_SIGNED");
    expect(events).toHaveLength(1);
  });

  it("recibo cancelado pelo estorno aparece cancelado e não aceita assinatura", async () => {
    const { app, headers, receivable, events, url } = await paidReceipt();
    const reversed = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/reverse`,
      headers,
    });
    expect(reversed.statusCode).toBe(200);

    const opened = await app.inject({ method: "GET", url });
    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toMatchObject({
      status: "cancelled",
      amountInCents: 5000,
    });
    expect(opened.json().cancelledAt).toEqual(expect.any(String));
    expect(opened.json()).not.toHaveProperty("receipt");

    const signed = await app.inject({
      method: "POST",
      url,
      payload: { signerName: "Cliente Recibo", accepted: true, signatureImage },
    });
    expect(signed.statusCode).toBe(410);
    expect(signed.json().code).toBe("RECEIPT_NOT_AVAILABLE");
    expect(events).toEqual([]);
  });

  it("assinado e depois estornado: mostra cancelado, sem a assinatura", async () => {
    const { app, headers, receivable, url } = await paidReceipt();
    await app.inject({
      method: "POST",
      url,
      payload: { signerName: "Cliente Recibo", accepted: true, signatureImage },
    });
    await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/reverse`,
      headers,
    });
    const opened = (await app.inject({ method: "GET", url })).json();
    expect(opened.status).toBe("cancelled");
    expect(opened).not.toHaveProperty("signatureImage");
  });

  it("recusa token desconhecido e assinatura incompleta", async () => {
    const { app, repository, receivable, events, url } = await paidReceipt();
    for (const path of [
      "/public/receipt-signatures/curto",
      `/public/receipt-signatures/${"a".repeat(43)}`,
    ]) {
      const response = await app.inject({ method: "GET", url: path });
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe("RECEIPT_SIGNATURE_LINK_NOT_FOUND");
    }
    const unknown = await app.inject({
      method: "POST",
      url: `/public/receipt-signatures/${"a".repeat(43)}`,
      payload: { signerName: "Cliente Recibo", accepted: true, signatureImage },
    });
    expect(unknown.statusCode).toBe(404);

    for (const payload of [
      { signerName: "Cliente Recibo", accepted: false, signatureImage },
      { signerName: "Cliente Recibo", accepted: true, signatureImage: "" },
      { signerName: "C", accepted: true, signatureImage },
      {
        signerName: "Cliente Recibo",
        signerCpf: "111.111.111-11",
        accepted: true,
        signatureImage,
      },
    ]) {
      const response = await app.inject({ method: "POST", url, payload });
      expect(response.statusCode).toBe(400);
    }
    const [stored] = await repository.listReceiptSignatures(
      receiptClinicId,
      receivable.id,
    );
    expect(stored?.signedAt).toBeUndefined();
    expect(events).toEqual([]);
  });

  it("limita as requisições por IP, com contadores próprios", async () => {
    const { app } = await paidReceipt();
    const url = `/public/receipt-signatures/${"a".repeat(43)}`;
    for (let index = 0; index < 60; index += 1)
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
    const blocked = await app.inject({ method: "GET", url });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe("TOO_MANY_REQUESTS");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    // O link de documento continua liberado para o mesmo IP.
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/public/document-signatures/${"a".repeat(43)}`,
        })
      ).statusCode,
    ).toBe(404);

    const payload = { signerName: "Cliente", accepted: true, signatureImage };
    const other = `/public/receipt-signatures/${"b".repeat(43)}`;
    for (let index = 0; index < 10; index += 1)
      expect(
        (await app.inject({ method: "POST", url: other, payload })).statusCode,
      ).toBe(404);
    expect(
      (await app.inject({ method: "POST", url: other, payload })).statusCode,
    ).toBe(429);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/public/receipt-signatures/${"c".repeat(43)}`,
          remoteAddress: "198.51.100.4",
          payload,
        })
      ).statusCode,
    ).toBe(404);
  });
});
