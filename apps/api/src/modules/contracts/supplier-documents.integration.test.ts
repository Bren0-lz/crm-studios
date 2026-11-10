import { afterEach, describe, expect, it } from "vitest";
import { supplierInputSchema } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const signatureImage = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;

async function supplierSetup() {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const supplier = (await repository.saveSupplier(
    clinicId,
    actorId,
    supplierInputSchema.parse({
      name: "Equipamentos Pilates Ltda.",
      kind: "company",
      document: "11222333000181",
      phone: "1933334444",
      whatsapp: "19988887777",
      hiredOn: "2026-11-01",
      contractAmountInCents: 240000,
      billingCycle: "monthly",
      paymentMethod: "boleto",
      installments: 3,
      paymentTerms: "vencimento todo dia 10",
    }),
  ))!;
  const template = await repository.createDocumentTemplate(clinicId, {
    name: "Contrato de fornecimento",
    kind: "contract",
    body: "Contrato com {{fornecedor_nome}} ({{fornecedor_documento}}): {{fornecedor_valor}}, {{fornecedor_pagamento}}, desde {{fornecedor_contratacao}}.",
  });
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  return { app, repository, supplier, template, headers };
}

describe("supplier documents", () => {
  it("issues the contract with the supplier data and sends the signing link to the supplier's WhatsApp", async () => {
    const { app, supplier, template, headers } = await supplierSetup();
    const created = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        templateId: template.id,
        supplierId: supplier.id,
        title: "Contrato de fornecimento",
      },
    });
    expect(created.statusCode).toBe(201);
    const document = created.json();
    expect(document).toMatchObject({
      supplierId: supplier.id,
      patientName: supplier.name,
    });
    // O real formatado usa espaço não separável entre "R$" e o valor.
    expect(document.snapshotBody.replace(/\s/g, " ")).toBe(
      "Contrato com Equipamentos Pilates Ltda. (11.222.333/0001-81): R$ 2.400,00 (mensal), Boleto em 3 parcelas · vencimento todo dia 10, desde 01/11/2026.",
    );
    expect(document).not.toHaveProperty("patientId");
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/documents/${document.id}/status`,
          headers,
          payload: { status: "issued" },
        })
      ).statusCode,
    ).toBe(200);
    const link = await app.inject({
      method: "POST",
      url: `/documents/${document.id}/signature-link`,
      headers,
    });
    expect(link.statusCode).toBe(200);
    const share = link.json();
    expect(share.patientPhone).toBe("19988887777");

    const opened = await app.inject({
      method: "GET",
      url: `/public/document-signatures/${share.token}`,
    });
    expect(opened.json()).toMatchObject({
      patientName: supplier.name,
      status: "pending",
    });
    const signed = await app.inject({
      method: "POST",
      url: `/public/document-signatures/${share.token}`,
      payload: {
        signerName: "Responsável do fornecedor",
        signerCpf: "52998224725",
        accepted: true,
        signatureImage,
      },
    });
    expect(signed.statusCode).toBe(200);
    const listed = (
      await app.inject({ method: "GET", url: "/documents", headers })
    ).json();
    expect(listed[0]).toMatchObject({
      supplierId: supplier.id,
      signatureLink: { signerName: "Responsável do fornecedor" },
    });
  });

  it("requires exactly one signer and refuses a plan on a supplier document", async () => {
    const { app, repository, supplier, template, headers } =
      await supplierSetup();
    const [patient] = await repository.listPatients(clinicId);
    const post = (payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/documents",
        headers,
        payload: { templateId: template.id, title: "Contrato", ...payload },
      });
    expect((await post({})).statusCode).toBe(400);
    expect(
      (await post({ supplierId: supplier.id, patientId: patient!.id }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await post({
          supplierId: supplier.id,
          planId: "44444444-4444-4444-8444-444444444444",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await post({ supplierId: "33333333-3333-4333-8333-333333333333" }))
        .statusCode,
    ).toBe(404);
  });
});
