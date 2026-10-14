import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe("manual signature evidence", () => {
  it("keeps the issued content and state, protects evidence from replacement and scopes downloads", async () => {
    const repository = new MemoryClinicRepository(),
      app = await buildApp({ repository, logger: false });
    apps.push(app);
    const [patient] = await repository.listPatients(clinicId);
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Consentimento manual",
      kind: "consent",
      body: "Consentimento de {{paciente_nome}} registrado externamente.",
    });
    const document = await repository.createIssuedDocument(clinicId, actorId, {
      patientId: patient!.id,
      templateId: template.id,
      title: "Consentimento do cliente",
    });
    await repository.updateIssuedDocumentStatus(
      clinicId,
      document.id,
      "issued",
    );
    const content = Buffer.from("%PDF-1.7\nDocumento assinado\n%%EOF"),
      input = {
        signedOn: "2039-01-10",
        responsibleName: "Equipe responsável",
        fileName: "consentimento-assinado.pdf",
        mimeType: "application/pdf" as const,
        sizeInBytes: content.length,
        contentBase64: content.toString("base64"),
      };
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const saved = await app.inject({
      method: "POST",
      url: `/documents/${document.id}/signature`,
      headers,
      payload: input,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      status: "issued",
      snapshotBody: document.snapshotBody,
      manualSignature: { responsibleName: input.responsibleName, actorId },
    });
    expect(JSON.stringify(saved.json())).not.toContain(input.contentBase64);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/documents/${document.id}/signature`,
          headers,
          payload: input,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      await repository.getDocumentSignatureContent(
        "99999999-9999-4999-8999-999999999999",
        actorId,
        document.id,
      ),
    ).toBeNull();
    const downloaded = await repository.getDocumentSignatureContent(
      clinicId,
      actorId,
      document.id,
    );
    expect(downloaded?.contentBase64).toBe(input.contentBase64);
  });
});
