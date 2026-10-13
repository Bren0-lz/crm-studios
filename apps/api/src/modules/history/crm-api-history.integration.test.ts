import { appModuleSchema } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("CRM API", () => {
  it("creates and edits users with job title and modules, auditing permission changes", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const me = await app.inject({ method: "GET", url: "/me", headers });
    expect(me.json()).toMatchObject({ role: "admin" });
    expect(me.json().modules).toContain("settings");
    expect(me.json().modules).toHaveLength(appModuleSchema.options.length);

    // Perfis antigos não existem mais.
    const legacy = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Bia Souza",
        email: "bia@movimenta.local",
        role: "reception",
        password: "Segura@1234",
      },
    });
    expect(legacy.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Bia Souza",
        email: "bia@movimenta.local",
        role: "user",
        password: "Segura@1234",
        jobTitle: " Instrutora de Pilates ",
      },
    });
    expect(created.statusCode).toBe(201);
    // Usuário comum novo começa sem nenhum módulo.
    expect(created.json()).toMatchObject({
      role: "user",
      jobTitle: "Instrutora de Pilates",
      customModules: false,
      modules: [],
      editModules: [],
    });
    const userId = created.json().id as string;
    const base = { fullName: "Bia Souza", role: "user", active: true };

    const custom = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, modules: ["finance", "agenda", "finance"] },
    });
    expect(custom.statusCode).toBe(200);
    expect(custom.json()).toMatchObject({
      jobTitle: "Instrutora de Pilates",
      customModules: true,
      modules: ["agenda", "finance"],
    });

    // Ausente = mantém os módulos e o cargo; vazio remove o cargo.
    const kept = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, jobTitle: "" },
    });
    expect(kept.json()).toMatchObject({
      role: "user",
      modules: ["agenda", "finance"],
    });
    expect(kept.json().jobTitle).toBeUndefined();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "bia@movimenta.local", password: "Segura@1234" },
    });
    expect(login.json().user).toMatchObject({
      role: "user",
      modules: ["agenda", "finance"],
    });
    const userHeaders = {
      authorization: `Bearer ${login.json().token as string}`,
    };
    const userMe = await app.inject({
      method: "GET",
      url: "/me",
      headers: userHeaders,
    });
    expect(userMe.json().modules).toEqual(["agenda", "finance"]);

    // `null` = nenhum módulo (não há mais padrão por perfil).
    const reset = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, modules: null },
    });
    expect(reset.json()).toMatchObject({
      customModules: false,
      modules: [],
      editModules: [],
    });

    const invalid = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, modules: ["admin"] },
    });
    expect(invalid.statusCode).toBe(400);

    const audit = await app.inject({
      method: "GET",
      url: "/admin/audit-events",
      headers,
    });
    const permissionEvents = (
      audit.json() as Array<{
        action: string;
        entityId?: string;
        metadata: Record<string, unknown>;
      }>
    ).filter((event) => event.action === "users.permissions_updated");
    expect(permissionEvents).toHaveLength(2);
    expect(permissionEvents.every((event) => event.entityId === userId)).toBe(
      true,
    );
    expect(permissionEvents.map((event) => event.metadata.custom)).toEqual([
      false,
      true,
    ]);

    const matrix = await app.inject({
      method: "GET",
      url: "/admin/permission-matrix",
      headers,
    });
    expect(matrix.json()).toEqual([
      {
        role: "admin",
        modules: ["Todos os módulos", "Administração"],
        editModules: ["Todos os módulos", "Administração"],
      },
      { role: "user", modules: [], editModules: [] },
    ]);
    await app.close();
  });

  it("stores edit levels per user, keeping edit inside view and auditing changes", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const me = await app.inject({ method: "GET", url: "/me", headers });
    expect(me.json().editModules).toHaveLength(appModuleSchema.options.length);

    const physioModules = ["agenda", "groups", "patients", "plans", "clinical"];
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Carla Lima",
        email: "carla@movimenta.local",
        role: "user",
        password: "Segura@1234",
        modules: physioModules,
      },
    });
    expect(created.statusCode).toBe(201);
    // Ver não dá edição: sem `editModules`, nenhuma edição.
    expect(created.json()).toMatchObject({
      customModules: true,
      modules: physioModules,
      editModules: [],
    });
    const userId = created.json().id as string;
    const base = { fullName: "Carla Lima", role: "user", active: true };

    // Editar sem ver é descartado.
    const custom = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: {
        ...base,
        editModules: ["patients", "finance", "clinical", "patients"],
      },
    });
    expect(custom.statusCode).toBe(200);
    expect(custom.json()).toMatchObject({
      customModules: true,
      modules: physioModules,
      editModules: ["patients", "clinical"],
    });

    // Ausente = mantém a edição; tirar a visualização tira a edição.
    const narrowed = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, modules: ["agenda", "clinical"] },
    });
    expect(narrowed.json()).toMatchObject({
      customModules: true,
      modules: ["agenda", "clinical"],
      editModules: ["clinical"],
    });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "carla@movimenta.local", password: "Segura@1234" },
    });
    expect(login.json().user).toMatchObject({
      modules: ["agenda", "clinical"],
      editModules: ["clinical"],
    });
    const userMe = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${login.json().token as string}` },
    });
    expect(userMe.json().editModules).toEqual(["clinical"]);

    const reset = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, modules: null, editModules: null },
    });
    expect(reset.json()).toMatchObject({
      customModules: false,
      modules: [],
      editModules: [],
    });

    // Admin nunca guarda lista: vê e edita tudo.
    const admin = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, role: "admin", editModules: ["agenda"] },
    });
    expect(admin.json()).toMatchObject({ role: "admin", customModules: false });
    expect(admin.json().editModules).toHaveLength(
      appModuleSchema.options.length,
    );

    const invalid = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, editModules: ["admin"] },
    });
    expect(invalid.statusCode).toBe(400);

    const audit = await app.inject({
      method: "GET",
      url: "/admin/audit-events",
      headers,
    });
    const permissionEvents = (
      audit.json() as Array<{
        action: string;
        entityId?: string;
        metadata: Record<string, unknown>;
      }>
    ).filter(
      (event) =>
        event.action === "users.permissions_updated" &&
        event.entityId === userId,
    );
    expect(permissionEvents).toHaveLength(5);
    expect(permissionEvents.at(-1)!.metadata).toMatchObject({
      modules: physioModules,
      editModules: [],
      custom: true,
    });
    expect(permissionEvents.at(-2)!.metadata).toMatchObject({
      modules: physioModules,
      editModules: ["patients", "clinical"],
      custom: true,
    });
    expect(permissionEvents[0]!.metadata).toMatchObject({ custom: false });
    await app.close();
  });
});
