import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../../config.js";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import { PASSWORD_REVEAL_LIMIT } from "./routes.js";

const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLINIC = "99999999-9999-4999-8999-999999999999";
const originalKey = config.PASSWORD_ENCRYPTION_KEY;

afterEach(() => {
  config.PASSWORD_ENCRYPTION_KEY = originalKey;
  vi.restoreAllMocks();
});

async function setup() {
  const { app, token, repository } = await authenticatedApp();
  const headers = { authorization: `Bearer ${token}` };
  async function createUser(
    email: string,
    password: string,
    role: "admin" | "user" = "user",
  ) {
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: { fullName: `Pessoa ${email}`, email, role, password },
    });
    expect(created.statusCode).toBe(201);
    return created.json() as { id: string };
  }
  const login = (email: string, password: string) =>
    app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
  const reveal = (id: string, requestHeaders = headers) =>
    app.inject({
      method: "POST",
      url: `/admin/users/${id}/reveal-password`,
      headers: requestHeaders,
    });
  const viewedEvents = async () =>
    (await repository.listAdminAuditEvents(CLINIC_ID)).filter(
      (event) => event.action === "user.password_viewed",
    );
  return { app, headers, repository, createUser, login, reveal, viewedEvents };
}

describe("POST /admin/users/:id/reveal-password", () => {
  it("mostra a senha gravada no cadastro e na redefinição, sem cache e com auditoria", async () => {
    const { app, headers, createUser, reveal, viewedEvents } = await setup();
    try {
      const user = await createUser("ana@teste.local", "Aa1");
      const first = await reveal(user.id);
      expect(first.statusCode).toBe(200);
      expect(first.headers["cache-control"]).toBe("no-store");
      expect(first.json()).toEqual({ password: "Aa1" });
      const [event] = await viewedEvents();
      expect(event).toMatchObject({
        action: "user.password_viewed",
        actorUserId: OWNER_ID,
        entityId: user.id,
        description: "Senha visualizada",
      });
      expect(JSON.stringify(event)).not.toContain("Aa1");

      const reset = await app.inject({
        method: "POST",
        url: `/admin/users/${user.id}/reset-password`,
        headers,
        payload: { password: "Bb2" },
      });
      expect(reset.statusCode).toBe(200);
      expect((await reveal(user.id)).json()).toEqual({ password: "Bb2" });
      expect(await viewedEvents()).toHaveLength(2);
    } finally {
      await app.close();
    }
  });

  it("o admin vê a senha de outro admin e a própria depois de trocá-la", async () => {
    const { app, headers, createUser, login, reveal } = await setup();
    try {
      const other = await createUser("outra.admin@teste.local", "Cc3", "admin");
      expect((await reveal(other.id)).json()).toEqual({ password: "Cc3" });

      const changed = await app.inject({
        method: "POST",
        url: "/me/password",
        headers,
        payload: { currentPassword: "Admin@123", newPassword: "Nova@456" },
      });
      expect(changed.statusCode).toBe(200);
      const fresh = {
        authorization: `Bearer ${changed.json().token as string}`,
      };
      expect((await reveal(OWNER_ID, fresh)).json()).toEqual({
        password: "Nova@456",
      });
      // A troca derruba as sessões antigas.
      expect((await reveal(OWNER_ID)).statusCode).toBe(401);
      expect(
        (await login("admin@movimenta.local", "Nova@456")).statusCode,
      ).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("recusa sem token (401), usuário comum (403), outra clínica e id inexistente (404)", async () => {
    const { app, repository, createUser, login, reveal, viewedEvents } =
      await setup();
    try {
      const user = await createUser("comum@teste.local", "Dd4");
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/admin/users/${user.id}/reveal-password`,
          })
        ).statusCode,
      ).toBe(401);

      const userToken = (await login("comum@teste.local", "Dd4")).json()
        .token as string;
      const denied = await reveal(user.id, {
        authorization: `Bearer ${userToken}`,
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.body).not.toContain("Dd4");

      const stranger = await repository.createAdminUser(
        OTHER_CLINIC,
        OWNER_ID,
        {
          fullName: "Outra clínica",
          email: "outra@clinica.local",
          role: "user",
          password: "Ee5",
        },
        { passwordHash: "x", passwordEncrypted: "v1:a:b:c" },
      );
      const foreign = await reveal(stranger.id);
      expect(foreign.statusCode).toBe(404);
      expect(foreign.json()).toMatchObject({ code: "USER_NOT_FOUND" });
      expect(
        (await reveal("00000000-0000-4000-8000-000000000000")).statusCode,
      ).toBe(404);
      expect((await reveal("nao-e-uuid")).statusCode).toBe(400);
      expect(await viewedEvents()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("usuário sem cópia (senha antiga) recebe 409 e nada é auditado", async () => {
    const { app, reveal, viewedEvents } = await setup();
    try {
      const response = await reveal(OWNER_ID);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        code: "PASSWORD_NOT_AVAILABLE",
        message:
          "A senha atual não está disponível para visualização. Ela ficará disponível após uma nova troca de senha.",
      });
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(await viewedEvents()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("audita antes de responder: se a auditoria falha, a senha não sai", async () => {
    const { app, repository, createUser, reveal } = await setup();
    try {
      const user = await createUser("auditoria@teste.local", "Ff6");
      const log = vi.spyOn(app.log, "error");
      vi.spyOn(repository, "recordUserPasswordViewed").mockRejectedValue(
        new Error("Duplicate entry 'Ff6' for key password_encrypted"),
      );
      const response = await reveal(user.id);
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        code: "PASSWORD_REVEAL_FAILED",
        message: "Não foi possível visualizar a senha.",
      });
      expect(response.body).not.toContain("Ff6");
      expect(JSON.stringify(log.mock.calls)).not.toContain("Ff6");
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "password_encrypted",
      );
    } finally {
      await app.close();
    }
  });

  it("cifra corrompida ou chave trocada dá 500 genérico", async () => {
    const { app, createUser, reveal, viewedEvents } = await setup();
    try {
      const user = await createUser("corrompida@teste.local", "Gg7");
      config.PASSWORD_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
      const response = await reveal(user.id);
      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({
        code: "PASSWORD_REVEAL_FAILED",
      });
      expect(await viewedEvents()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it(`limita a ${PASSWORD_REVEAL_LIMIT} consultas por minuto por admin`, async () => {
    const { app, createUser, reveal } = await setup();
    try {
      const user = await createUser("limite@teste.local", "Hh8");
      for (let index = 0; index < PASSWORD_REVEAL_LIMIT; index += 1)
        expect((await reveal(user.id)).statusCode).toBe(200);
      const blocked = await reveal(user.id);
      expect(blocked.statusCode).toBe(429);
      expect(blocked.headers["retry-after"]).toBeDefined();
      expect(blocked.body).not.toContain("Hh8");
    } finally {
      await app.close();
    }
  });
});

describe("gravação da senha", () => {
  it("sem chave, criar ou trocar senha falha sem gravar nada e o login continua", async () => {
    const { app, headers, createUser, login, reveal, repository } =
      await setup();
    try {
      const user = await createUser("sem-chave@teste.local", "Ii9");
      const before = await repository.listAdminUsers(CLINIC_ID);
      config.PASSWORD_ENCRYPTION_KEY = undefined;

      const created = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers,
        payload: {
          fullName: "Nova",
          email: "nova@teste.local",
          role: "user",
          password: "Jj1",
        },
      });
      expect(created.statusCode).toBe(500);
      expect(created.json()).toEqual({
        code: "PASSWORD_KEY_MISSING",
        message: "Chave de criptografia de senhas ausente ou inválida.",
      });
      const reset = await app.inject({
        method: "POST",
        url: `/admin/users/${user.id}/reset-password`,
        headers,
        payload: { password: "Kk2" },
      });
      expect(reset.statusCode).toBe(500);
      const own = await app.inject({
        method: "POST",
        url: "/me/password",
        headers,
        payload: { currentPassword: "Admin@123", newPassword: "Ll3@nova" },
      });
      expect(own.statusCode).toBe(500);

      expect(await repository.listAdminUsers(CLINIC_ID)).toEqual(before);
      expect((await login("sem-chave@teste.local", "Ii9")).statusCode).toBe(
        200,
      );
      expect(
        (await login("admin@movimenta.local", "Admin@123")).statusCode,
      ).toBe(200);
      config.PASSWORD_ENCRYPTION_KEY = originalKey;
      expect((await reveal(user.id)).json()).toEqual({ password: "Ii9" });
    } finally {
      await app.close();
    }
  });

  it("nenhuma resposta nem a auditoria trazem o hash ou a cópia cifrada", async () => {
    const { app, headers, createUser, login, reveal } = await setup();
    try {
      const user = await createUser("sigilo@teste.local", "Mm4");
      const patched = await app.inject({
        method: "PATCH",
        url: `/admin/users/${user.id}`,
        headers,
        payload: { fullName: "Sigilo", role: "user", active: true },
      });
      expect(patched.statusCode).toBe(200);
      await app.inject({
        method: "POST",
        url: `/admin/users/${user.id}/reset-password`,
        headers,
        payload: { password: "Nn5" },
      });
      await reveal(user.id);
      const signedIn = await login("sigilo@teste.local", "Nn5");
      const userHeaders = {
        authorization: `Bearer ${signedIn.json().token as string}`,
      };
      const responses = [
        patched,
        signedIn,
        await app.inject({ method: "GET", url: "/admin/users", headers }),
        await app.inject({ method: "GET", url: "/me", headers: userHeaders }),
        await app.inject({
          method: "GET",
          url: "/admin/audit-events",
          headers,
        }),
        await app.inject({
          method: "GET",
          url: "/history/audit-events",
          headers,
        }),
      ];
      for (const response of responses) expect(response.statusCode).toBe(200);
      expect(
        responses
          .at(-1)!
          .json()
          .items.map((item: { action: string }) => item.action),
      ).toEqual(
        expect.arrayContaining(["user.password_reset", "user.password_viewed"]),
      );
      const created = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers,
        payload: {
          fullName: "Outra",
          email: "outra@teste.local",
          role: "user",
          password: "Oo6",
        },
      });
      responses.push(created);
      for (const response of responses) {
        const body = response.body;
        for (const forbidden of [
          "passwordHash",
          "passwordEncrypted",
          "password_hash",
          "password_encrypted",
          "$2a$",
          "$2b$",
          '"v1:',
          "Mm4",
          "Nn5",
          "Oo6",
        ])
          expect(body).not.toContain(forbidden);
      }
      const listed = (
        await app.inject({ method: "GET", url: "/admin/users", headers })
      ).json() as Record<string, unknown>[];
      for (const item of listed) {
        expect(item).not.toHaveProperty("passwordHash");
        expect(item).not.toHaveProperty("passwordEncrypted");
      }
      expect(created.json()).not.toHaveProperty("passwordEncrypted");
    } finally {
      await app.close();
    }
  });
});
