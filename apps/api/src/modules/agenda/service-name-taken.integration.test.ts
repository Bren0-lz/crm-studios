import { afterEach, describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

const apps: { close: () => Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("serviço com nome repetido", () => {
  it("recusa com 409 SERVICE_NAME_TAKEN ao criar e ao editar", async () => {
    const { app, token } = await authenticatedApp();
    apps.push(app);
    const headers = { authorization: `Bearer ${token}` };
    const create = (name: string) =>
      app.inject({
        method: "POST",
        url: "/services",
        headers,
        payload: { name, durationMinutes: 60 },
      });

    const first = await create("TESTE Pilates");
    expect(first.statusCode).toBe(201);
    for (const name of ["TESTE Pilates", "  teste pilátes  "]) {
      const repeated = await create(name);
      expect(repeated.statusCode).toBe(409);
      expect(repeated.json()).toMatchObject({
        code: "SERVICE_NAME_TAKEN",
        message: "Já existe um serviço com esse nome.",
      });
    }

    const other = await create("TESTE Funcional");
    expect(other.statusCode).toBe(201);
    const rename = await app.inject({
      method: "PUT",
      url: `/admin/registry/${other.json<{ id: string }>().id}`,
      headers,
      payload: {
        kind: "service",
        data: { name: "teste PILATES", durationMinutes: 60, active: true },
      },
    });
    expect(rename.statusCode).toBe(409);
    expect(rename.json()).toMatchObject({ code: "SERVICE_NAME_TAKEN" });

    // Desativar não libera o nome.
    const firstId = first.json<{ id: string }>().id;
    const deactivate = await app.inject({
      method: "PUT",
      url: `/admin/registry/${firstId}`,
      headers,
      payload: {
        kind: "service",
        data: { name: "TESTE Pilates", durationMinutes: 60, active: false },
      },
    });
    expect(deactivate.statusCode).toBe(200);
    expect((await create("Teste Pilates")).statusCode).toBe(409);
  });

  it("edita sem mudar o nome um serviço repetido de antes da regra", async () => {
    const { app, token, repository } = await authenticatedApp();
    apps.push(app);
    const headers = { authorization: `Bearer ${token}` };
    const create = (name: string) =>
      app.inject({
        method: "POST",
        url: "/services",
        headers,
        payload: { name, durationMinutes: 60 },
      });
    expect((await create("TESTE Legado")).statusCode).toBe(201);
    const legacy = (await create("TESTE temporário")).json<{ id: string }>();
    // Simula o repetido gravado antes da regra.
    (
      repository as unknown as {
        context: { services: { id: string; name: string }[] };
      }
    ).context.services.find((item) => item.id === legacy.id)!.name =
      "TESTE Legado";
    const update = (name: string) =>
      app.inject({
        method: "PUT",
        url: `/admin/registry/${legacy.id}`,
        headers,
        payload: {
          kind: "service",
          data: { name, durationMinutes: 30, active: false },
        },
      });
    const kept = await update("TESTE Legado");
    expect(kept.statusCode).toBe(200);
    expect(kept.json()).toMatchObject({ durationMinutes: 30, active: false });
    expect((await create("Outro TESTE")).statusCode).toBe(201);
    const renamed = await update("outro teste");
    expect(renamed.statusCode).toBe(409);
    expect(renamed.json()).toMatchObject({ code: "SERVICE_NAME_TAKEN" });
  });
});
