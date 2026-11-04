import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import {
  receiptActorId,
  receiptClinicId,
  receiptFixtures,
} from "../../test-support/receipt-signatures-suite.js";
import {
  createDomainEventPublisher,
  type DomainEvent,
} from "../../infrastructure/domain-events.js";
import { signReceipt } from "./receipt-signatures.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: receiptActorId, clinicId: receiptClinicId, role: "admin" })}`,
  };
  return { repository, app, headers };
}

describe("recibo para assinatura", () => {
  it("nasce na baixa pela API e é cancelado pelo estorno", async () => {
    const { repository, app, headers } = await setup();
    const { receivable } = await receiptFixtures(repository);
    const receipts = () =>
      repository.listReceiptSignatures(receiptClinicId, receivable.id);

    const paid = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: { paymentMethod: "cash" },
    });
    expect(paid.statusCode).toBe(200);
    expect(await receipts()).toMatchObject([
      {
        amountInCents: 5000,
        paidAt: paid.json().paidAt,
        status: "generated",
      },
    ]);

    const reversed = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/reverse`,
      headers,
    });
    expect(reversed.statusCode).toBe(200);
    expect((await receipts()).map((item) => item.status)).toEqual([
      "cancelled",
    ]);
  });

  it("baixa recusada não gera recibo", async () => {
    const { repository, app, headers } = await setup();
    const { receivable } = await receiptFixtures(repository);
    await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    const again = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    expect(again.statusCode).toBe(409);
    expect(
      await repository.listReceiptSignatures(receiptClinicId, receivable.id),
    ).toHaveLength(1);
  });

  it("registrar a baixa não emite evento; assinar emite uma vez", async () => {
    const { repository, app, headers } = await setup();
    const { receivable } = await receiptFixtures(repository);
    const events: DomainEvent[] = [];
    const publisher = createDomainEventPublisher();
    publisher.subscribe("receipt.signed", (event) => {
      events.push(event);
    });
    await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: { paymentMethod: "cash" },
    });
    expect(events).toEqual([]);
    const [receipt] = await repository.listReceiptSignatures(
      receiptClinicId,
      receivable.id,
    );
    await signReceipt(
      repository,
      publisher,
      receipt!.token,
      {
        signerName: "Cliente Recibo",
        accepted: true,
        signatureImage: "data:image/png;base64,iVBORw0KGgo=",
      },
      {},
    );
    expect(events.map((event) => event.receiptId)).toEqual([receipt!.id]);
  });
});
