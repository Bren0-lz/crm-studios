import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("document template deletion", () => {
  it("deletes every version, keeps created documents and frees the name", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    apps.push(app);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const [patient] = await repository.listPatients(clinicId);
    const body =
      "Contrato de {{paciente_nome}} com a clínica {{clinica_nome}}.";
    const first = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato teste",
      kind: "contract",
      body,
    });
    const second = await repository.createDocumentTemplateVersion(
      clinicId,
      first.id,
      `${body} Versão revisada.`,
    );
    const document = await repository.createIssuedDocument(clinicId, actorId, {
      templateId: second!.id,
      patientId: patient!.id,
      title: "Contrato do cliente",
    });

    const deleted = await app.inject({
      method: "DELETE",
      url: `/document-templates/${second!.id}`,
      headers,
    });
    expect(deleted.statusCode).toBe(204);
    const templates = await app.inject({
      method: "GET",
      url: "/document-templates",
      headers,
    });
    expect(
      templates.json().map((item: { name: string }) => item.name),
    ).not.toContain("Contrato teste");
    const documents = await app.inject({
      method: "GET",
      url: "/documents",
      headers,
    });
    expect(documents.json()).toContainEqual(
      expect.objectContaining({
        id: document.id,
        templateName: "Contrato teste",
      }),
    );
    const issue = await app.inject({
      method: "POST",
      url: "/documents/preview",
      headers,
      payload: {
        templateId: second!.id,
        patientId: patient!.id,
        title: "Contrato do cliente",
      },
    });
    expect(issue.statusCode).toBe(404);

    const again = await app.inject({
      method: "DELETE",
      url: `/document-templates/${first.id}`,
      headers,
    });
    expect(again.statusCode).toBe(404);
    const invalid = await app.inject({
      method: "DELETE",
      url: "/document-templates/nao-e-uuid",
      headers,
    });
    expect(invalid.statusCode).toBe(404);

    const recreated = await app.inject({
      method: "POST",
      url: "/document-templates",
      headers,
      payload: { name: "Contrato teste", kind: "contract", body },
    });
    expect(recreated.statusCode).toBe(201);
    expect(recreated.json().version).toBe(1);
  });
});

describe("document template history", () => {
  it("records the author and restores an old version through the API", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    apps.push(app);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const created = await app.inject({
      method: "POST",
      url: "/document-templates",
      headers,
      payload: {
        name: "Contrato com histórico",
        kind: "contract",
        body: "Contrato de {{paciente_nome}}, primeira redação.",
      },
    });
    expect(created.statusCode).toBe(201);
    const first = created.json();
    const user = await repository.findUserById(clinicId, actorId);
    expect(first).toMatchObject({
      createdById: actorId,
      createdByName: user!.fullName,
    });
    const versioned = await app.inject({
      method: "POST",
      url: `/document-templates/${first.id}/versions`,
      headers,
      payload: { body: "Contrato de {{paciente_nome}}, segunda redação." },
    });
    expect(versioned.json()).toMatchObject({
      version: 2,
      createdByName: user!.fullName,
    });

    const active = await app.inject({
      method: "POST",
      url: `/document-templates/${versioned.json().id}/restore`,
      headers,
    });
    expect(active.statusCode).toBe(409);
    const restored = await app.inject({
      method: "POST",
      url: `/document-templates/${first.id}/restore`,
      headers,
    });
    expect(restored.statusCode).toBe(201);
    expect(restored.json()).toMatchObject({
      version: 3,
      active: true,
      body: first.body,
      restoredFromVersion: 1,
    });
    const missing = await app.inject({
      method: "POST",
      url: "/document-templates/nao-existe/restore",
      headers,
    });
    expect(missing.statusCode).toBe(404);
  });
});
