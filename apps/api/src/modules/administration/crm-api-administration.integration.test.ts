import { appModuleSchema, defaultRelationshipSettings } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../memory-repository.js";
import {
  authenticatedApp,
  OWNER_ID,
  type TestApp,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";
import {
  legacyRoleDefaultEditModules,
  legacyRoleDefaultModules,
} from "./legacy-roles.js";

describe("CRM API", () => {
  describe("module permissions per user", () => {
    async function createUser(
      app: TestApp,
      ownerHeaders: Record<string, string>,
      payload: Record<string, unknown>,
    ) {
      const email = `${String(payload.role)}.${Math.random().toString(36).slice(2)}@teste.local`;
      // Perfil antigo como atalho: usuário comum com os módulos que o perfil tinha.
      const { role, ...rest } = payload;
      const legacy = (
        ["reception", "physiotherapist", "finance"] as const
      ).find((item) => item === role);
      const body = legacy
        ? {
            role: "user",
            modules: legacyRoleDefaultModules[legacy],
            editModules: legacyRoleDefaultEditModules[legacy],
            ...rest,
          }
        : payload;
      const created = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers: ownerHeaders,
        payload: {
          fullName: "Usuária Teste",
          email,
          password: "SenhaForte123",
          ...body,
        },
      });
      expect(created.statusCode).toBe(201);
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "SenhaForte123" },
      });
      expect(login.statusCode).toBe(200);
      return {
        id: created.json().id as string,
        headers: { authorization: `Bearer ${login.json().token as string}` },
      };
    }
    const newPatient = {
      fullName: "Cliente Permissão",
      phone: "11977770000",
      cpf: "52998224725",
    };

    it("lets a reception user with the finance module use /finance", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const plain = await createUser(app, owner, { role: "reception" });
      const denied = await app.inject({
        method: "GET",
        url: "/finance/workspace",
        headers: plain.headers,
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "FINANCE_ACCESS_DENIED" });

      const withFinance = await createUser(app, owner, {
        role: "reception",
        modules: ["agenda", "patients", "finance"],
        editModules: ["agenda", "patients", "finance"],
      });
      for (const url of [
        "/finance/workspace",
        "/finance/summary",
        "/finance/daily-cash",
      ]) {
        const allowed = await app.inject({
          method: "GET",
          url,
          headers: withFinance.headers,
        });
        expect(allowed.statusCode, url).toBe(200);
      }
      await app.close();
    });

    it("gives HEAD requests exactly the access of the matching GET", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const reception = await createUser(app, owner, { role: "reception" });
      for (const [url, code] of [
        ["/admin/users", "ADMIN_ACCESS_REQUIRED"],
        ["/finance/workspace", "FINANCE_ACCESS_DENIED"],
        ["/patients/export", "COMMERCIAL_ACCESS_DENIED"],
        ["/reports/management", "MANAGEMENT_ACCESS_DENIED"],
      ] as const) {
        const denied = await app.inject({
          method: "HEAD",
          url,
          headers: reception.headers,
        });
        expect(denied.statusCode, url).toBe(403);
        const get = await app.inject({
          method: "GET",
          url,
          headers: reception.headers,
        });
        expect(get.json(), url).toMatchObject({ code });
        expect(
          (await app.inject({ method: "HEAD", url })).statusCode,
          url,
        ).toBe(401);
      }
      for (const url of ["/admin/users", "/finance/workspace"]) {
        const allowed = await app.inject({
          method: "HEAD",
          url,
          headers: owner,
        });
        expect(allowed.statusCode, url).toBe(200);
      }
      const withFinance = await createUser(app, owner, {
        role: "reception",
        modules: ["agenda", "finance"],
        editModules: ["agenda", "finance"],
      });
      const financeHead = await app.inject({
        method: "HEAD",
        url: "/finance/workspace",
        headers: withFinance.headers,
      });
      expect(financeHead.statusCode).toBe(200);
      await app.close();
    });

    it("refuses /patients to a user without the patients module", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const user = await createUser(app, owner, {
        role: "reception",
        modules: ["agenda", "crm"],
      });
      const list = await app.inject({
        method: "GET",
        url: "/patients",
        headers: user.headers,
      });
      expect(list.statusCode).toBe(403);
      expect(list.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
      const create = await app.inject({
        method: "POST",
        url: "/patients",
        headers: user.headers,
        payload: newPatient,
      });
      expect(create.statusCode).toBe(403);
      await app.close();
    });

    it("reads relationship settings with Contatos sugeridos or Configurações", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      for (const modules of [["relationship"], ["settings"]]) {
        const user = await createUser(app, owner, {
          role: "reception",
          modules,
        });
        const read = await app.inject({
          method: "GET",
          url: "/relationship/settings",
          headers: user.headers,
        });
        expect(read.statusCode, modules.join()).toBe(200);
        expect(read.json()).toEqual(defaultRelationshipSettings);
        const head = await app.inject({
          method: "HEAD",
          url: "/relationship/settings",
          headers: user.headers,
        });
        expect(head.statusCode, modules.join()).toBe(200);
        const write = await app.inject({
          method: "PUT",
          url: "/relationship/settings",
          headers: user.headers,
          payload: defaultRelationshipSettings,
        });
        expect(write.statusCode).toBe(403);
      }
      const without = await createUser(app, owner, {
        role: "reception",
        modules: ["agenda", "crm"],
      });
      const denied = await app.inject({
        method: "GET",
        url: "/relationship/settings",
        headers: without.headers,
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
      expect(denied.json().message).toContain("Contatos sugeridos");
      const deniedHead = await app.inject({
        method: "HEAD",
        url: "/relationship/settings",
        headers: without.headers,
      });
      expect(deniedHead.statusCode).toBe(403);
      await app.close();
    });

    it("lists configured tags to client-picking modules and manages them only with Configurações editing", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      for (const module of [
        "patients",
        "settings",
        "agenda",
        "communications",
        "contracts",
        "groups",
      ]) {
        const user = await createUser(app, owner, {
          role: "reception",
          modules: [module],
          editModules: [],
        });
        const list = await app.inject({
          method: "GET",
          url: "/patient-tags",
          headers: user.headers,
        });
        expect(list.statusCode, module).toBe(200);
        const head = await app.inject({
          method: "HEAD",
          url: "/patient-tags",
          headers: user.headers,
        });
        expect(head.statusCode, module).toBe(200);
        const create = await app.inject({
          method: "POST",
          url: "/patient-tags",
          headers: user.headers,
          payload: { name: `Sem edição ${module}` },
        });
        expect(create.statusCode, module).toBe(403);
      }
      const without = await createUser(app, owner, {
        role: "reception",
        modules: ["crm", "finance"],
      });
      const denied = await app.inject({
        method: "GET",
        url: "/patient-tags",
        headers: without.headers,
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });

      // Recepção (padrão antigo) vê Configurações sem editar: não gerencia etiquetas.
      const reception = await createUser(app, owner, { role: "reception" });
      const receptionCreate = await app.inject({
        method: "POST",
        url: "/patient-tags",
        headers: reception.headers,
        payload: { name: "Recepção T062" },
      });
      expect(receptionCreate.statusCode).toBe(403);

      const editor = await createUser(app, owner, {
        role: "reception",
        modules: ["settings"],
        editModules: ["settings"],
      });
      const created = await app.inject({
        method: "POST",
        url: "/patient-tags",
        headers: editor.headers,
        payload: { name: "Editora T062" },
      });
      expect(created.statusCode).toBe(201);
      const tagId = created.json().id as string;
      for (const headers of [reception.headers, without.headers]) {
        const patch = await app.inject({
          method: "PATCH",
          url: `/patient-tags/${tagId}`,
          headers,
          payload: { color: "#000000" },
        });
        expect(patch.statusCode).toBe(403);
        const remove = await app.inject({
          method: "DELETE",
          url: `/patient-tags/${tagId}`,
          headers,
        });
        expect(remove.statusCode).toBe(403);
      }
      const patch = await app.inject({
        method: "PATCH",
        url: `/patient-tags/${tagId}`,
        headers: editor.headers,
        payload: { color: "#000000" },
      });
      expect(patch.statusCode).toBe(200);
      const remove = await app.inject({
        method: "DELETE",
        url: `/patient-tags/${tagId}`,
        headers: editor.headers,
      });
      expect(remove.statusCode).toBe(204);
      await app.close();
    });

    it("lists minimal client options to whoever sees a module that picks clients", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const full = (
        await app.inject({ method: "GET", url: "/patients", headers: owner })
      ).json() as Array<{
        id: string;
        fullName: string;
        tags: string[];
      }>;
      expect(full.length).toBeGreaterThan(0);
      for (const module of [
        "agenda",
        "communications",
        "contracts",
        "groups",
        "patients",
      ]) {
        const user = await createUser(app, owner, {
          role: "reception",
          modules: [module],
        });
        const options = await app.inject({
          method: "GET",
          url: "/patients/options",
          headers: user.headers,
        });
        expect(options.statusCode, module).toBe(200);
        const body = options.json() as Array<Record<string, unknown>>;
        expect(body).toEqual(
          full.map(({ id, fullName, tags }) => ({ id, fullName, tags })),
        );
        for (const item of body)
          expect(Object.keys(item).sort()).toEqual(["fullName", "id", "tags"]);
        const searched = await app.inject({
          method: "GET",
          url: `/patients/options?search=${encodeURIComponent(full[0]!.fullName)}`,
          headers: user.headers,
        });
        expect(searched.statusCode, module).toBe(200);
        expect(searched.json()).toContainEqual({
          id: full[0]!.id,
          fullName: full[0]!.fullName,
          tags: full[0]!.tags,
        });
        for (const item of searched.json())
          expect(Object.keys(item).sort()).toEqual(["fullName", "id", "tags"]);
        const head = await app.inject({
          method: "HEAD",
          url: "/patients/options",
          headers: user.headers,
        });
        expect(head.statusCode, module).toBe(200);
        if (module !== "patients") {
          const list = await app.inject({
            method: "GET",
            url: "/patients",
            headers: user.headers,
          });
          expect(list.statusCode, module).toBe(403);
        }
      }
      const crmOnly = await createUser(app, owner, {
        role: "reception",
        modules: ["crm", "finance"],
      });
      const denied = await app.inject({
        method: "GET",
        url: "/patients/options",
        headers: crmOnly.headers,
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
      expect(
        (
          await app.inject({
            method: "HEAD",
            url: "/patients/options",
            headers: crmOnly.headers,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await app.inject({ method: "GET", url: "/patients/options" }))
          .statusCode,
      ).toBe(401);
      await app.close();
    });

    it("lets the default physiotherapist read clients but not save them", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const physio = await createUser(app, owner, { role: "physiotherapist" });
      const list = await app.inject({
        method: "GET",
        url: "/patients",
        headers: physio.headers,
      });
      expect(list.statusCode).toBe(200);
      const patientId = (list.json() as Array<{ id: string }>)[0]!.id;
      const create = await app.inject({
        method: "POST",
        url: "/patients",
        headers: physio.headers,
        payload: newPatient,
      });
      expect(create.statusCode).toBe(403);
      expect(create.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
      const update = await app.inject({
        method: "PUT",
        url: `/patients/${patientId}`,
        headers: physio.headers,
        payload: newPatient,
      });
      expect(update.statusCode).toBe(403);
      // Visão geral continua só com login.
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/dashboard",
            headers: physio.headers,
          })
        ).statusCode,
      ).toBe(200);
      await app.close();
    });

    it("lets a physiotherapist with patients editing create clients", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const physio = await createUser(app, owner, {
        role: "physiotherapist",
        editModules: ["agenda", "groups", "clinical", "patients"],
      });
      const create = await app.inject({
        method: "POST",
        url: "/patients",
        headers: physio.headers,
        payload: newPatient,
      });
      expect(create.statusCode).toBe(201);
      await app.close();
    });

    it("applies module changes and deactivation without a new login", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const physio = await createUser(app, owner, { role: "physiotherapist" });
      const before = await app.inject({
        method: "POST",
        url: "/patients",
        headers: physio.headers,
        payload: newPatient,
      });
      expect(before.statusCode).toBe(403);

      const granted = await app.inject({
        method: "PATCH",
        url: `/admin/users/${physio.id}`,
        headers: owner,
        payload: {
          fullName: "Usuária Teste",
          role: "user",
          active: true,
          editModules: ["agenda", "groups", "clinical", "patients"],
        },
      });
      expect(granted.statusCode).toBe(200);
      const after = await app.inject({
        method: "POST",
        url: "/patients",
        headers: physio.headers,
        payload: newPatient,
      });
      expect(after.statusCode).toBe(201);

      const deactivated = await app.inject({
        method: "PATCH",
        url: `/admin/users/${physio.id}`,
        headers: owner,
        payload: { fullName: "Usuária Teste", role: "user", active: false },
      });
      expect(deactivated.statusCode).toBe(200);
      for (const url of ["/patients", "/dashboard", "/me"]) {
        const refused = await app.inject({
          method: "GET",
          url,
          headers: physio.headers,
        });
        expect(refused.statusCode, url).toBe(401);
        expect(refused.json()).toMatchObject({ code: "UNAUTHORIZED" });
      }
      await app.close();
    });

    it("starts a new common user without any module (only the overview)", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const user = await createUser(app, owner, { role: "user" });
      const me = await app.inject({
        method: "GET",
        url: "/me",
        headers: user.headers,
      });
      expect(me.json()).toMatchObject({
        role: "user",
        modules: [],
        editModules: [],
      });
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/dashboard",
            headers: user.headers,
          })
        ).statusCode,
      ).toBe(200);
      for (const url of [
        "/patients",
        "/patients/options",
        "/groups/workspace",
        "/plans",
        "/leads",
        "/clinical-records",
        "/finance/workspace",
        "/reports/management",
        "/relationship/settings",
        "/communications",
      ]) {
        const denied = await app.inject({
          method: "GET",
          url,
          headers: user.headers,
        });
        expect(denied.statusCode, url).toBe(403);
      }
      for (const url of [
        "/admin/users",
        "/admin/clinic-settings",
        "/admin/audit-events",
        "/patients/export",
      ]) {
        const get = await app.inject({
          method: "GET",
          url,
          headers: user.headers,
        });
        expect(get.statusCode, url).toBe(403);
        expect(get.json(), url).toMatchObject({
          code:
            url === "/patients/export"
              ? "COMMERCIAL_ACCESS_DENIED"
              : url === "/admin/audit-events"
                ? "HISTORY_ACCESS_DENIED"
                : "ADMIN_ACCESS_REQUIRED",
        });
        expect(
          (await app.inject({ method: "HEAD", url, headers: user.headers }))
            .statusCode,
          url,
        ).toBe(403);
      }
      // Nem com todos os módulos o usuário comum entra na Administração.
      const full = await createUser(app, owner, {
        role: "user",
        modules: appModuleSchema.options,
        editModules: appModuleSchema.options,
      });
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/finance/workspace",
            headers: full.headers,
          })
        ).statusCode,
      ).toBe(200);
      for (const url of ["/admin/users", "/admin/permission-matrix"]) {
        expect(
          (await app.inject({ method: "GET", url, headers: full.headers }))
            .statusCode,
          url,
        ).toBe(403);
        expect(
          (await app.inject({ method: "HEAD", url, headers: full.headers }))
            .statusCode,
          url,
        ).toBe(403);
      }
      await app.close();
    });

    it("gives an admin every module and the administration, ignoring stored lists", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const admin = await createUser(app, owner, {
        role: "admin",
        modules: ["agenda"],
        editModules: [],
      });
      const me = await app.inject({
        method: "GET",
        url: "/me",
        headers: admin.headers,
      });
      expect(me.json()).toMatchObject({
        role: "admin",
        modules: appModuleSchema.options,
        editModules: appModuleSchema.options,
      });
      for (const url of [
        "/admin/users",
        "/admin/audit-events",
        "/finance/workspace",
        "/leads",
        "/plans",
      ]) {
        expect(
          (await app.inject({ method: "GET", url, headers: admin.headers }))
            .statusCode,
          url,
        ).toBe(200);
        expect(
          (await app.inject({ method: "HEAD", url, headers: admin.headers }))
            .statusCode,
          url,
        ).toBe(200);
      }
      const listed = (
        await app.inject({ method: "GET", url: "/admin/users", headers: owner })
      ).json() as Array<{
        id: string;
        customModules: boolean;
      }>;
      expect(listed.find((item) => item.id === admin.id)?.customModules).toBe(
        false,
      );
      await app.close();
    });

    it("says which field and rule failed when a new user is invalid", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const create = (payload: Record<string, unknown>) =>
        app.inject({
          method: "POST",
          url: "/admin/users",
          headers: owner,
          payload: {
            fullName: "Breno Luiz",
            email: "breno@teste.local",
            password: "SenhaForte123",
            role: "user",
            ...payload,
          },
        });
      const cases: [Record<string, unknown>, string][] = [
        [{ password: "" }, "Senha: Informe a senha."],
        [{ email: "breno" }, "E-mail: Informe um e-mail válido."],
        [{ fullName: "Br" }, "Nome: Use pelo menos 3 caracteres."],
        [
          {
            professional: {
              mode: "create",
              data: {
                fullName: "Breno Luiz",
                crefito: "123",
                specialty: "Fisioterapia",
                color: "#ee2222",
              },
            },
          },
          "Registro profissional: Use pelo menos 4 caracteres.",
        ],
        [
          { commission: { percentage: 140, effectiveFrom: "2026-10-24" } },
          "Comissão (%): Informe um valor de até 100.",
        ],
      ];
      for (const [payload, message] of cases) {
        const response = await create(payload);
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ code: "VALIDATION_ERROR", message });
      }
      // Senha sem exigência de maiúscula, minúscula ou número.
      expect((await create({ password: "1234" })).statusCode).toBe(201);
    });

    it("never lets the clinic lose its last active admin", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const patch = (
        id: string,
        headers: Record<string, string>,
        payload: Record<string, unknown>,
      ) =>
        app.inject({
          method: "PATCH",
          url: `/admin/users/${id}`,
          headers,
          payload: { fullName: "Usuária Teste", ...payload },
        });
      const demoted = await patch(OWNER_ID, owner, {
        fullName: "Aryana Dutra",
        role: "user",
        active: true,
      });
      expect(demoted.statusCode).toBe(409);
      expect(demoted.json()).toMatchObject({ code: "LAST_ADMIN" });
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/admin/users",
            headers: owner,
          })
        ).statusCode,
      ).toBe(200);

      // Com outro admin ativo dá para rebaixar; admin desativado não conta.
      const second = await createUser(app, owner, { role: "admin" });
      expect(
        (await patch(second.id, owner, { role: "admin", active: false }))
          .statusCode,
      ).toBe(200);
      const stillLast = await patch(OWNER_ID, owner, {
        fullName: "Aryana Dutra",
        role: "user",
        active: true,
      });
      expect(stillLast.statusCode).toBe(409);
      expect(stillLast.json()).toMatchObject({ code: "LAST_ADMIN" });
      expect(
        (await patch(second.id, owner, { role: "admin", active: true }))
          .statusCode,
      ).toBe(200);
      const handedOver = await patch(OWNER_ID, owner, {
        fullName: "Aryana Dutra",
        role: "user",
        active: true,
      });
      expect(handedOver.statusCode).toBe(200);
      expect(handedOver.json()).toMatchObject({ role: "user", modules: [] });
      // A ex-admin perde a Administração na hora; a nova admin não pode se rebaixar nem desativar a última.
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/admin/users",
            headers: owner,
          })
        ).statusCode,
      ).toBe(403);
      const selfDemotion = await patch(second.id, second.headers, {
        role: "user",
        active: true,
      });
      expect(selfDemotion.json()).toMatchObject({ code: "LAST_ADMIN" });

      const repository = new MemoryClinicRepository();
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await expect(
        repository.updateAdminUser(clinicId, "outra-pessoa", OWNER_ID, {
          fullName: "Aryana Dutra",
          role: "admin",
          active: false,
        }),
      ).rejects.toMatchObject({ code: "LAST_ADMIN", statusCode: 409 });
      await app.close();
    });
  });

  it("validates the clinic CPF/CNPJ check digits and stores it formatted", async () => {
    const { app, token } = await authenticatedApp();
    const owner = { authorization: `Bearer ${token}` };
    const base = { name: "Studios Aryana", timezone: "America/Sao_Paulo" };
    const invalid = await app.inject({
      method: "PUT",
      url: "/admin/clinic-settings",
      headers: owner,
      payload: { ...base, taxId: "12.345.678/0001-90" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      code: "INVALID_TAX_ID",
      message:
        "Informe um CPF ou CNPJ válido, com os dígitos verificadores corretos.",
    });
    const cnpj = await app.inject({
      method: "PUT",
      url: "/admin/clinic-settings",
      headers: owner,
      payload: { ...base, taxId: "11222333000181" },
    });
    expect(cnpj.statusCode).toBe(200);
    expect(cnpj.json()).toMatchObject({ taxId: "11.222.333/0001-81" });
    const cpf = await app.inject({
      method: "PUT",
      url: "/admin/clinic-settings",
      headers: owner,
      payload: { ...base, taxId: "529.982.247-25" },
    });
    expect(cpf.json()).toMatchObject({ taxId: "529.982.247-25" });
    const empty = await app.inject({
      method: "PUT",
      url: "/admin/clinic-settings",
      headers: owner,
      payload: { ...base, taxId: "" },
    });
    expect(empty.statusCode).toBe(200);
    await app.close();
  });
});
