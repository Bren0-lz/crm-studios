import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import type { BuildAppOptions } from "../../infrastructure/route-utils.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import {
  receiptActorId,
  receiptClinicId,
  receiptFixtures,
} from "../../test-support/receipt-signatures-suite.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

const payload = {
  signerName: "Cliente Recibo",
  accepted: true,
  signatureImage: "data:image/png;base64,iVBORw0KGgo=",
};
const paidAt = "2026-11-03T01:00:00.000Z";

async function setup(
  options: Pick<BuildAppOptions, "events" | "telegram"> = {},
) {
  const repository = new MemoryClinicRepository();
  const sent: { chatId: string; text: string }[] = [];
  let now = new Date("2026-11-07T12:00:00.000Z");
  const sendMessage = vi.fn(async (chatId: string, text: string) => {
    sent.push({ chatId, text });
  });
  const app = await buildApp({
    repository,
    logger: false,
    telegram: {
      webhookSecret: "segredo-tg2-teste-1234",
      now: () => now,
      client: { sendMessage },
    },
    ...options,
  });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: receiptActorId, clinicId: receiptClinicId, role: "admin" })}`,
  };
  const { patient, receivable } = await receiptFixtures(repository);
  const pay = (extra = {}) =>
    app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: { paymentMethod: "cash", paidAt, ...extra },
    });
  const receipts = () =>
    repository.listReceiptSignatures(receiptClinicId, receivable.id);
  const sign = async () => {
    const [receipt] = await receipts();
    return app.inject({
      method: "POST",
      url: `/public/receipt-signatures/${receipt!.token}`,
      payload,
    });
  };
  async function link(
    chatId = "555",
    clinicId = receiptClinicId,
    userId = receiptActorId,
  ) {
    const codeHash = randomUUID();
    await repository.createTelegramLinkCode(clinicId, userId, {
      codeHash,
      expiresAt: "2026-11-08T12:00:00.000Z",
    });
    expect(
      await repository.linkTelegramChat({
        codeHash,
        chatId,
        now: now.toISOString(),
      }),
    ).toMatchObject({ status: "linked" });
  }
  async function newAdmin(clinicId = receiptClinicId) {
    return repository.createAdminUser(
      clinicId,
      receiptActorId,
      {
        fullName: "Admin Telegram",
        email: `${randomUUID()}@test.local`,
        role: "admin",
        password: "Password123",
      },
      "unused-hash",
    );
  }
  return {
    app,
    repository,
    patient,
    receivable,
    sent,
    sendMessage,
    pay,
    sign,
    link,
    newAdmin,
    receipts,
    drain: () =>
      app.inject({
        method: "POST",
        url: "/integrations/telegram/outbox/drain",
        headers,
      }),
    advance() {
      now = new Date(now.getTime() + 60_000);
    },
  };
}

describe("TG2: aviso de recibo assinado", () => {
  it("a baixa não envia; a assinatura confirmada envia uma vez com valor e data da baixa", async () => {
    const test = await setup();
    await test.link();
    expect((await test.pay({ receivedInCents: 1234 })).statusCode).toBe(200);
    expect(test.sent).toEqual([]);
    expect(await test.repository.listTelegramOutbox(receiptClinicId)).toEqual(
      [],
    );
    test.sendMessage.mockImplementation(async (chatId, text) => {
      // Outra leitura já enxerga a assinatura quando o envio começa.
      expect((await test.receipts())[0]!.status).toBe("signed");
      test.sent.push({ chatId, text });
    });

    expect((await test.sign()).statusCode).toBe(200);
    expect(test.sent).toEqual([
      {
        chatId: "555",
        text: `Recibo assinado: ${test.patient.fullName} · R$\u00a012,34 · pago em 02/11/2026`,
      },
    ]);
    expect((await test.sign()).statusCode).toBe(409);
    await test.drain();
    expect(test.sent).toHaveLength(1);
    expect(await test.repository.listTelegramOutbox(receiptClinicId)).toEqual([
      expect.objectContaining({ attempts: 1, sentAt: expect.any(String) }),
    ]);
  });

  it("envia a cada chat da clínica, sem duplicar chat nem atingir outra clínica", async () => {
    const test = await setup();
    await test.link();
    await test.link("777", receiptClinicId, (await test.newAdmin()).id);
    await test.link("555", receiptClinicId, (await test.newAdmin()).id);
    const otherClinic = randomUUID();
    await test.link("999", otherClinic, (await test.newAdmin(otherClinic)).id);
    await test.pay();
    expect((await test.sign()).statusCode).toBe(200);
    expect(test.sent.map((item) => item.chatId).sort()).toEqual(["555", "777"]);
    expect(await test.repository.listTelegramOutbox(otherClinic)).toEqual([]);
  });

  it("respeita o fuso configurado na clínica", async () => {
    const test = await setup();
    const settings = await test.repository.getClinicSettings(receiptClinicId);
    await test.repository.updateClinicSettings(
      receiptClinicId,
      receiptActorId,
      {
        ...settings!,
        timezone: "Asia/Tokyo",
      },
    );
    await test.link();
    await test.pay();
    expect((await test.sign()).statusCode).toBe(200);
    expect(test.sent[0]!.text).toContain("pago em 03/11/2026");
  });

  it("preserva a assinatura na falha de envio e usa a fila para tentar novamente", async () => {
    const test = await setup();
    await test.link();
    await test.pay();
    test.sendMessage.mockRejectedValueOnce(new Error("Telegram fora do ar"));
    expect((await test.sign()).statusCode).toBe(200);
    expect((await test.receipts())[0]!.status).toBe("signed");
    expect(await test.repository.listTelegramOutbox(receiptClinicId)).toEqual([
      expect.objectContaining({
        attempts: 1,
        lastError: "Telegram fora do ar",
      }),
    ]);
    expect(test.sent).toEqual([]);
    test.advance();
    expect((await test.drain()).json()).toEqual({
      sent: 1,
      failed: 0,
      gaveUp: 0,
    });
    await test.drain();
    expect(test.sent).toHaveLength(1);
    expect((await test.sign()).statusCode).toBe(409);
  });

  it.each([
    "getPatient",
    "listTelegramLinks",
    "enqueueTelegramMessages",
  ] as const)(
    "falha em %s não transforma a assinatura gravada em erro",
    async (method) => {
      const test = await setup();
      await test.link();
      await test.pay();
      vi.spyOn(test.repository, method).mockRejectedValueOnce(
        new Error("Falha no repositório de notificações"),
      );
      expect((await test.sign()).statusCode).toBe(200);
      expect((await test.receipts())[0]!.status).toBe("signed");
      expect(test.sent).toEqual([]);
    },
  );

  it("mantém o consumidor interno mesmo com publicador injetado que falha", async () => {
    const publish = vi
      .fn()
      .mockRejectedValue(new Error("Observador indisponível"));
    const test = await setup({ events: { publish } });
    await test.link();
    await test.pay();
    expect(publish).not.toHaveBeenCalled();
    expect((await test.sign()).statusCode).toBe(200);
    expect(publish).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "receipt.signed", paidAt }),
    );
    expect(test.sent).toHaveLength(1);
  });

  it.each([true, false])(
    "sem destinatários ou com integração desligada (%s), só assina",
    async (enabled) => {
      const test = await setup(enabled ? {} : { telegram: null });
      if (!enabled) await test.link();
      await test.pay();
      expect((await test.sign()).statusCode).toBe(200);
      expect(test.sent).toEqual([]);
      expect(await test.repository.listTelegramOutbox(receiptClinicId)).toEqual(
        [],
      );
    },
  );

  it("não notifica assinatura recusada nem recibo cancelado", async () => {
    const test = await setup();
    await test.link();
    await test.pay();
    const [receipt] = await test.receipts();
    const invalid = await test.app.inject({
      method: "POST",
      url: `/public/receipt-signatures/${receipt!.token}`,
      payload: { ...payload, accepted: false },
    });
    expect(invalid.statusCode).toBe(400);
    await test.repository.reverseReceivablePayment(
      receiptClinicId,
      receiptActorId,
      test.receivable.id,
    );
    expect((await test.sign()).statusCode).toBe(410);
    expect(test.sent).toEqual([]);
    expect(await test.repository.listTelegramOutbox(receiptClinicId)).toEqual(
      [],
    );
  });
});
