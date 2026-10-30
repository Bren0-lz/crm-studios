import { type AssessmentTemplate } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  roleSub,
  seedRoleUsers,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("Modelos de avaliação", () => {
  it("lista as fichas iniciais e versiona, arquiva e reativa sem perder o histórico", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const list = await app.inject({
      method: "GET",
      url: "/assessment-templates",
      headers,
    });
    expect(list.statusCode).toBe(200);
    const templates = list.json<AssessmentTemplate[]>();
    for (const name of [
      "Anamnese",
      "Avaliação postural",
      "Ficha de inscrição — Dançaterapia e Aula de Ritmos",
    ])
      expect(templates.find((item) => item.name === name)).toMatchObject({
        status: "published",
        active: true,
        version: 1,
      });
    const anamnese = templates.find((item) => item.name === "Anamnese")!;
    const patient = (
      await app.inject({ method: "GET", url: "/patients", headers })
    ).json()[0];

    const first = await app.inject({
      method: "POST",
      url: "/clinical-assessments",
      headers,
      payload: {
        patientId: patient.id,
        templateId: anamnese.id,
        values: { atividades: "Sim", queixa_principal: "Dor lombar" },
      },
    });
    expect(first.statusCode).toBe(201);

    // Editar um modelo publicado cria a versão 2 na mesma família.
    const edited = await app.inject({
      method: "PUT",
      url: `/assessment-templates/${anamnese.id}`,
      headers,
      payload: {
        name: anamnese.name,
        specialty: anamnese.specialty,
        status: "published",
        fields: [
          ...anamnese.fields,
          {
            key: "sono",
            label: "Qualidade do sono",
            type: "text",
            required: false,
          },
        ],
      },
    });
    expect(edited.statusCode).toBe(200);
    const v2 = edited.json<AssessmentTemplate>();
    expect(v2).toMatchObject({ version: 2, familyId: anamnese.id });

    const second = await app.inject({
      method: "POST",
      url: "/clinical-assessments",
      headers,
      payload: {
        patientId: patient.id,
        templateId: v2.id,
        values: { queixa_principal: "Dor no ombro", sono: "Ruim" },
      },
    });
    expect(second.statusCode).toBe(201);

    // Arquivar vale para a família toda e não apaga as avaliações registradas.
    const archived = await app.inject({
      method: "PATCH",
      url: `/assessment-templates/${anamnese.id}/status`,
      headers,
      payload: { active: false },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({ id: v2.id, active: false });
    const blocked = await app.inject({
      method: "POST",
      url: "/clinical-assessments",
      headers,
      payload: {
        patientId: patient.id,
        templateId: v2.id,
        values: { queixa_principal: "Nova" },
      },
    });
    expect(blocked.statusCode).toBe(404);

    const workspace = (
      await app.inject({
        method: "GET",
        url: `/clinical-workspace/${patient.id}`,
        headers,
      })
    ).json();
    expect(
      workspace.assessments.map(
        (item: { values: Record<string, unknown> }) => item.values,
      ),
    ).toEqual([
      { queixa_principal: "Dor no ombro", sono: "Ruim" },
      { atividades: "Sim", queixa_principal: "Dor lombar" },
    ]);
    // Versões antigas e arquivadas seguem no prontuário para exibir os rótulos.
    expect(
      workspace.templates
        .filter((item: AssessmentTemplate) => item.name === "Anamnese")
        .map((item: AssessmentTemplate) => [item.version, item.active])
        .sort(),
    ).toEqual([
      [1, false],
      [2, false],
    ]);

    const restored = await app.inject({
      method: "PATCH",
      url: `/assessment-templates/${v2.id}/status`,
      headers,
      payload: { active: true },
    });
    expect(restored.json()).toMatchObject({ id: v2.id, active: true });

    const missing = await app.inject({
      method: "PATCH",
      url: "/assessment-templates/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/status",
      headers,
      payload: { active: false },
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it("deixa consultar modelos com acesso de leitura, mas só arquiva quem cria modelos", async () => {
    const { app } = await authenticatedApp();
    await seedRoleUsers(app);
    const token = app.jwt.sign({
      sub: roleSub(app, "reception"),
      clinicId: "11111111-1111-4111-8111-111111111111",
      role: "user",
    });
    const headers = { authorization: `Bearer ${token}` };
    const list = await app.inject({
      method: "GET",
      url: "/assessment-templates",
      headers,
    });
    expect(list.statusCode).toBe(403);
    const archive = await app.inject({
      method: "PATCH",
      url: "/assessment-templates/c1000000-0000-4000-8000-000000000002/status",
      headers,
      payload: { active: false },
    });
    expect(archive.statusCode).toBe(403);
    await app.close();
  });
});
