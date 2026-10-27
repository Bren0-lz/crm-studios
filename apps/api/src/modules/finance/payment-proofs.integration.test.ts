import { nextTestCpf } from "../../test-support/cpf.js";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import type { PaymentProof } from "@crm/contracts";
import { verifyPaymentProofsRepository } from "../../test-support/payment-proofs-suite.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const pdf = Buffer.from("%PDF-1.4\nComprovante Pix\n%%EOF");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const proof = (
  content: Buffer,
  fileName: string,
  mimeType: "application/pdf" | "image/png",
) => ({
  fileName,
  mimeType,
  sizeInBytes: content.length,
  contentBase64: content.toString("base64"),
});

async function setup() {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  return { repository, app, headers };
}

describe("comprovantes de pagamento", () => {
  it("anexa vários comprovantes a uma parcela recebida e baixa cada um", async () => {
    const { repository, app, headers } = await setup();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente comprovante",
      phone: "11988887777",
      tags: [],
    });
    const invoice = await repository.createManualReceivable(clinicId, actorId, {
      patientId: patient.id,
      description: "Mensalidade",
      amountInCents: 5000,
      dueDate: "2039-06-10",
    });
    const url = `/finance/receivables/${invoice.id}/proofs`;
    const early = await app.inject({
      method: "POST",
      url,
      headers,
      payload: proof(pdf, "pix.pdf", "application/pdf"),
    });
    expect(early.statusCode).toBe(409);
    expect(early.json().code).toBe("PAYMENT_PROOF_NOT_SETTLED");

    await app.inject({
      method: "POST",
      url: `/finance/receivables/${invoice.id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    const created: PaymentProof[] = [];
    for (const input of [
      proof(pdf, "pix.pdf", "application/pdf"),
      proof(png, "foto.png", "image/png"),
    ]) {
      const response = await app.inject({
        method: "POST",
        url,
        headers,
        payload: input,
      });
      expect(response.statusCode).toBe(201);
      created.push(response.json<PaymentProof>());
    }
    expect(created[0]).toMatchObject({
      entityType: "receivable",
      entityId: invoice.id,
      fileName: "pix.pdf",
      authorId: actorId,
    });
    expect(created[0]).not.toHaveProperty("contentBase64");
    expect((await app.inject({ url, headers })).json()).toEqual(created);
    expect(
      (
        await app.inject({
          url: `/finance/payment-proofs/${created[1]!.id}/content`,
          headers,
        })
      ).json(),
    ).toMatchObject({
      fileName: "foto.png",
      contentBase64: png.toString("base64"),
      sha256: created[1]!.sha256,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers,
          payload: {
            ...proof(pdf, "falso.png", "image/png"),
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      await repository.listPaymentProofs(
        "99999999-9999-4999-8999-999999999999",
        "receivable",
        invoice.id,
      ),
    ).toEqual([]);
    expect(
      await repository.getPaymentProofContent(
        "99999999-9999-4999-8999-999999999999",
        actorId,
        created[0]!.id,
      ),
    ).toBeNull();
    expect(
      (
        await app.inject({
          url: "/finance/payment-proofs/99999999-9999-4999-8999-999999999999/content",
          headers,
        })
      ).statusCode,
    ).toBe(404);
  });

  it("anexa comprovantes a despesa paga e limita a quantidade por registro", async () => {
    const { app, headers } = await setup();
    const workspace = (
      await app.inject({ url: "/finance/workspace", headers })
    ).json();
    const payable = (
      await app.inject({
        method: "POST",
        url: "/finance/payables",
        headers,
        payload: {
          description: "Aluguel",
          supplier: "Imobiliária",
          categoryId: workspace.categories.find(
            (item: { kind: string }) => item.kind === "expense",
          ).id,
          dueDate: "2039-06-10",
          amountInCents: 4000,
        },
      })
    ).json();
    const url = `/finance/payables/${payable.id}/proofs`;
    await app.inject({
      method: "POST",
      url: `/finance/payables/${payable.id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    for (let index = 0; index < 10; index += 1)
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers,
            payload: proof(pdf, `boleto-${index}.pdf`, "application/pdf"),
          })
        ).statusCode,
      ).toBe(201);
    const extra = await app.inject({
      method: "POST",
      url,
      headers,
      payload: proof(pdf, "extra.pdf", "application/pdf"),
    });
    expect(extra.statusCode).toBe(409);
    expect(extra.json().code).toBe("PAYMENT_PROOF_LIMIT");
    expect((await app.inject({ url, headers })).json()).toHaveLength(10);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/finance/commission-account-payments/99999999-9999-4999-8999-999999999999/proofs",
          headers,
          payload: proof(pdf, "comissao.pdf", "application/pdf"),
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe("comprovantes de pagamento no repositório em memória", () => {
  it("segue a mesma suíte do PostgreSQL", async () => {
    await verifyPaymentProofsRepository(new MemoryClinicRepository());
  });
});
