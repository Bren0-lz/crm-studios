import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const signatureImage = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;

async function issuedDocument() {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const [patient] = await repository.listPatients(clinicId);
  const template = await repository.createDocumentTemplate(clinicId, {
    name: "Contrato Pilates",
    kind: "contract",
    body: "Contrato de {{paciente_nome}} para aulas de Pilates.",
  });
  const document = await repository.createIssuedDocument(clinicId, actorId, {
    patientId: patient!.id,
    templateId: template.id,
    title: "Contrato Pilates",
  });
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  return { app, repository, document, patient: patient!, headers };
}

describe("document signature link", () => {
  it("records the views and the client's signature through the public link", async () => {
    const { app, repository, document, patient, headers } =
      await issuedDocument();
    const draftLink = await app.inject({
      method: "POST",
      url: `/documents/${document.id}/signature-link`,
      headers,
    });
    expect(draftLink.statusCode).toBe(409);
    await repository.updateIssuedDocumentStatus(
      clinicId,
      document.id,
      "issued",
    );

    const created = await app.inject({
      method: "POST",
      url: `/documents/${document.id}/signature-link`,
      headers,
    });
    expect(created.statusCode).toBe(200);
    const share = created.json();
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(share.patientPhone).toBe(patient.phone);
    expect(share.document.signatureLink).toMatchObject({
      token: share.token,
      viewCount: 0,
    });
    // Reenviar reaproveita o mesmo link.
    const again = await app.inject({
      method: "POST",
      url: `/documents/${document.id}/signature-link`,
      headers,
    });
    expect(again.json().token).toBe(share.token);

    expect(
      (
        await app.inject({
          method: "GET",
          url: "/public/document-signatures/inexistente",
        })
      ).statusCode,
    ).toBe(404);
    const opened = await app.inject({
      method: "GET",
      url: `/public/document-signatures/${share.token}`,
      headers: { "user-agent": "Celular do cliente" },
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toMatchObject({
      title: "Contrato Pilates",
      patientName: patient.fullName,
      status: "pending",
      snapshotBody: document.snapshotBody,
    });
    expect(opened.json()).not.toHaveProperty("clinicId");

    const invalid = await app.inject({
      method: "POST",
      url: `/public/document-signatures/${share.token}`,
      payload: { signerName: "Cliente", accepted: false, signatureImage },
    });
    expect(invalid.statusCode).toBe(400);
    const signed = await app.inject({
      method: "POST",
      url: `/public/document-signatures/${share.token}`,
      headers: { "user-agent": "Celular do cliente" },
      payload: {
        signerName: patient.fullName,
        signerCpf: "123.456.789-09",
        accepted: true,
        signatureImage,
      },
    });
    expect(signed.statusCode).toBe(200);
    expect(signed.json()).toMatchObject({
      status: "signed",
      signerName: patient.fullName,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/public/document-signatures/${share.token}`,
          payload: {
            signerName: "Outra pessoa",
            accepted: true,
            signatureImage,
          },
        })
      ).statusCode,
    ).toBe(409);

    const details = await app.inject({
      method: "GET",
      url: `/documents/${document.id}/signature-link`,
      headers,
    });
    expect(details.json()).toMatchObject({
      viewCount: 1,
      views: [{ userAgent: "Celular do cliente" }],
      signerName: patient.fullName,
      signerCpf: "12345678909",
      signatureImage,
      signerUserAgent: "Celular do cliente",
      documentSha256: signed.json().documentSha256,
    });
    const [listed] = (
      await app.inject({ method: "GET", url: "/documents", headers })
    ).json();
    expect(listed.signatureLink).toMatchObject({
      viewCount: 1,
      signerName: patient.fullName,
    });
    expect(listed.signatureLink.signedAt).toBeTruthy();
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/documents/${document.id}/signature-link`,
        })
      ).statusCode,
    ).toBe(401);
  });

  it("refuses signatures after the document is cancelled", async () => {
    const { app, repository, document, headers } = await issuedDocument();
    await repository.updateIssuedDocumentStatus(
      clinicId,
      document.id,
      "issued",
    );
    const { token } = (
      await app.inject({
        method: "POST",
        url: `/documents/${document.id}/signature-link`,
        headers,
      })
    ).json();
    await repository.updateIssuedDocumentStatus(
      clinicId,
      document.id,
      "cancelled",
    );
    const opened = await app.inject({
      method: "GET",
      url: `/public/document-signatures/${token}`,
    });
    expect(opened.json().status).toBe("cancelled");
    const signed = await app.inject({
      method: "POST",
      url: `/public/document-signatures/${token}`,
      payload: { signerName: "Cliente", accepted: true, signatureImage },
    });
    expect(signed.statusCode).toBe(410);
  });
});
