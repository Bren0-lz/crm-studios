import { hashSync } from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { OWNER_ID } from "../../test-support/legacy-fixtures.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const admin = {
    authorization: `Bearer ${app.jwt.sign({ sub: OWNER_ID, clinicId, role: "admin" })}`,
  };
  const created = await app.inject({
    method: "POST",
    url: "/integration-keys",
    headers: admin,
    payload: { name: "Painel de vendas", scopes: ["sales:read", "sales:write"] },
  });
  expect(created.statusCode, created.body).toBe(201);
  const key = { authorization: `Bearer ${created.json().token as string}` };
  const login = (email: string, password: string) =>
    app.inject({
      method: "POST",
      url: "/external/v1/auth/login",
      headers: key,
      payload: { email, password },
    });
  const asUser = (token: string, url: string) =>
    app.inject({ url, headers: { ...key, "x-crm-user-token": token } });
  return { app, repository, admin, key, login, asUser };
}

describe("login do painel de vendas (API externa)", () => {
  it("nega o admin sem o acesso ao painel e libera depois de marcado", async () => {
    const { app, admin, login } = await setup();
    const denied = await login("admin@movimenta.local", "Admin@123");
    expect(denied.statusCode, denied.body).toBe(403);
    expect(denied.json().code).toBe("DASHBOARD_ACCESS_DENIED");
    // Senha errada continua sendo credencial inválida (não revela a permissão).
    const wrong = await login("admin@movimenta.local", "errada");
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().code).toBe("INVALID_CREDENTIALS");

    const users = await app.inject({ url: "/admin/users", headers: admin });
    const owner = (
      users.json() as { id: string; fullName: string; dashboardAccess?: boolean }[]
    ).find((item) => item.id === OWNER_ID)!;
    expect(owner.dashboardAccess).toBe(false);
    const granted = await app.inject({
      method: "PATCH",
      url: `/admin/users/${OWNER_ID}`,
      headers: admin,
      payload: {
        fullName: owner.fullName,
        role: "admin",
        active: true,
        dashboardAccess: true,
      },
    });
    expect(granted.statusCode, granted.body).toBe(200);
    expect(granted.json().dashboardAccess).toBe(true);

    const ok = await login("admin@movimenta.local", "Admin@123");
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({
      token: expect.any(String),
      expiresAt: expect.any(String),
      user: { id: OWNER_ID, role: "admin", email: "admin@movimenta.local" },
    });
    expect(ok.json().user.permissions).toContain("groups.view");
  });

  it("age como a pessoa logada e corta o acesso quando a permissão sai", async () => {
    const { app, repository, admin, login, asUser } = await setup();
    const user = await repository.createAdminUser(
      clinicId,
      OWNER_ID,
      {
        fullName: "Vendedora",
        email: "vendas@example.com",
        password: "Password123",
        role: "user",
        permissions: ["crm.view"],
        dashboardAccess: true,
      },
      hashSync("Password123", 4),
    );
    expect(user.dashboardAccess).toBe(true);
    const logged = await login("vendas@example.com", "Password123");
    expect(logged.statusCode, logged.body).toBe(200);
    const token = logged.json().token as string;

    // Com o token, valem as permissões dela, não as do admin dono da chave.
    expect((await asUser(token, "/external/v1/leads")).statusCode).toBe(200);
    expect((await asUser(token, "/external/v1/groups")).statusCode).toBe(403);
    // O token do painel não serve de sessão nas rotas internas do CRM.
    const internal = await app.inject({
      url: "/leads",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(internal.statusCode).toBe(401);
    // Token inválido ou de sessão comum do CRM não vale como token do painel.
    const garbage = await asUser("nao-e-um-token", "/external/v1");
    expect(garbage.statusCode).toBe(401);
    expect(garbage.json().code).toBe("USER_TOKEN_INVALID");
    expect(
      (await asUser(admin.authorization.slice(7), "/external/v1")).json().code,
    ).toBe("USER_TOKEN_INVALID");

    // Tirar a permissão derruba o acesso já na próxima chamada.
    await repository.updateAdminUser(clinicId, OWNER_ID, user.id, {
      fullName: user.fullName,
      role: "user",
      active: true,
      dashboardAccess: false,
    });
    const revoked = await asUser(token, "/external/v1/leads");
    expect(revoked.statusCode).toBe(403);
    expect(revoked.json().code).toBe("DASHBOARD_ACCESS_DENIED");
  });
});
