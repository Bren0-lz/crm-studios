import { afterEach, describe, expect, it } from "vitest";
import { documentContentFromText, documentContentText } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("visual contract workflow", () => {
  it("previews without writes, saves individual changes and freezes issued content and branding", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    apps.push(app);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const [patient] = await repository.listPatients(clinicId);
    const body =
      "Contrato de {{paciente_nome}}. Plano {{plano_nome}}. Clínica {{clinica_nome}}.";
    const content = documentContentFromText(body);
    content.doc.content![0]!.content![1]!.marks = [{ type: "bold" }];
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato visual",
      kind: "contract",
      body,
      content,
    });
    const input = {
      templateId: template.id,
      patientId: patient!.id,
      title: "Contrato do cliente",
    };
    const before = (await repository.listIssuedDocuments(clinicId)).length;
    const preview = await app.inject({
      method: "POST",
      url: "/documents/preview",
      headers,
      payload: input,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().snapshotBody).toContain(patient!.fullName);
    expect(preview.json().missingFields).toContainEqual({
      key: "plano_nome",
      label: "Plano",
    });
    expect((await repository.listIssuedDocuments(clinicId)).length).toBe(
      before,
    );
    const individual = documentContentFromText(
      `${preview.json().snapshotBody}\n\nCondição exclusiva combinada com este cliente.`,
    );
    const created = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: { ...input, content: individual },
    });
    expect(created.statusCode).toBe(201);
    const document = created.json();
    expect(document.snapshotBody).toContain("Condição exclusiva");
    expect(document.branding).not.toHaveProperty("id");
    const next = documentContentFromText(
      `${document.snapshotBody}\n\nAjuste salvo no rascunho.`,
    );
    const updated = await app.inject({
      method: "PATCH",
      url: `/documents/${document.id}`,
      headers,
      payload: { title: input.title, content: next },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().snapshotBody).toBe(documentContentText(next));
    const settings = await repository.getClinicSettings(clinicId);
    await repository.updateClinicSettings(clinicId, actorId, {
      ...settings!,
      name: "Novo nome da clínica",
    });
    await repository.createDocumentTemplateVersion(
      clinicId,
      template.id,
      "Texto novo apenas para contratos futuros.",
      documentContentFromText("Texto novo apenas para contratos futuros."),
    );
    const issued = await app.inject({
      method: "PATCH",
      url: `/documents/${document.id}/status`,
      headers,
      payload: { status: "issued" },
    });
    expect(issued.json()).toMatchObject({
      snapshotBody: documentContentText(next),
      branding: document.branding,
      templateVersion: 1,
    });
    const blocked = await app.inject({
      method: "PATCH",
      url: `/documents/${document.id}`,
      headers,
      payload: { title: "Não pode alterar", content: next },
    });
    expect(blocked.statusCode).toBe(409);
    expect(
      await repository.updateDocumentDraft(
        "99999999-9999-4999-8999-999999999999",
        document.id,
        { title: input.title, content: next },
      ),
    ).toBeNull();
  });
  it("rejects invalid relations, unsupported content, unfilled draft fields and missing permissions", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    apps.push(app);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const patients = await repository.listPatients(clinicId);
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato de teste",
      kind: "contract",
      body: "Contrato de {{paciente_nome}} com a clínica.",
    });
    const input = {
      templateId: template.id,
      patientId: patients[0]!.id,
      title: "Contrato do cliente",
    };
    const badPlan = await app.inject({
      method: "POST",
      url: "/documents/preview",
      headers,
      payload: { ...input, planId: "99999999-9999-4999-8999-999999999999" },
    });
    expect(badPlan.statusCode).toBe(400);
    expect(badPlan.json().code).toBe("DOCUMENT_PLAN_MISMATCH");
    const invalid = await app.inject({
      method: "POST",
      url: "/documents/preview",
      headers,
      payload: {
        ...input,
        content: {
          version: 1,
          doc: { type: "doc", content: [{ type: "script" }] },
        },
      },
    });
    expect(invalid.statusCode).toBe(400);
    const document = await repository.createIssuedDocument(
      clinicId,
      actorId,
      input,
    );
    const pending = await app.inject({
      method: "PATCH",
      url: `/documents/${document.id}`,
      headers,
      payload: {
        title: input.title,
        content: documentContentFromText(
          "Contrato com {{paciente_nome}} ainda não preenchido.",
        ),
      },
    });
    expect(pending.statusCode).toBe(400);
    await repository.updateIssuedDocumentStatus(
      clinicId,
      document.id,
      "cancelled",
    );
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/documents/${document.id}`,
          headers,
          payload: {
            title: input.title,
            content: documentContentFromText(
              "Este conteúdo não pode mais ser alterado.",
            ),
          },
        })
      ).statusCode,
    ).toBe(409);
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Somente leitura",
        email: "contracts-read@test.local",
        password: "Password123",
        role: "user",
        permissions: ["contracts.view"],
      },
      "unused-hash",
    );
    const restricted = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/documents/preview",
          headers: restricted,
          payload: input,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/documents/${document.id}`,
          headers: restricted,
          payload: {
            title: input.title,
            content: documentContentFromText(
              "Este conteúdo não pode mais ser alterado.",
            ),
          },
        })
      ).statusCode,
    ).toBe(403);
  });
});
