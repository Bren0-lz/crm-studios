import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { userAgendaSuite } from "../../test-support/user-agenda-suite.js";

describe("memória: cadastro unificado", () => {
  let repository: MemoryClinicRepository;
  beforeEach(() => {
    repository = new MemoryClinicRepository(false);
  });
  userAgendaSuite(() => repository);
});

describe("HTTP: cadastro unificado", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let headers: { authorization: string };
  const payload = {
    fullName: "Ana Souza",
    email: "ana@example.com",
    password: "Senha123",
    role: "user",
    professional: {
      mode: "create",
      data: {
        fullName: "Dra. Ana",
        crefito: "HTTP-1234",
        specialty: "Pilates",
        color: "#547A6B",
      },
    },
  };
  beforeEach(async () => {
    app = await buildApp({
      repository: new MemoryClinicRepository(false),
      logger: false,
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@movimenta.local", password: "Admin@123" },
    });
    headers = { authorization: `Bearer ${login.json().token}` };
  });
  afterEach(async () => {
    await app.close();
  });

  it("retorna o profissional completo no POST, PATCH e listagem; mantém rotas antigas", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload,
    });
    expect(created.statusCode, created.body).toBe(201);
    const user = created.json();
    expect(user.professional).toMatchObject({
      fullName: "Dra. Ana",
      crefito: "HTTP-1234",
      active: true,
    });
    const edited = await app.inject({
      method: "PATCH",
      url: `/admin/users/${user.id}`,
      headers,
      payload: {
        fullName: "Nome do acesso",
        role: "user",
        active: true,
        professional: { mode: "deactivate" },
        commission: { percentage: 15, effectiveFrom: "2020-01-01" },
      },
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json()).toMatchObject({
      professionalId: user.professional.id,
      professional: { active: false },
      commissionPercentage: 15,
    });
    const list = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers,
    });
    expect(
      list.json().find((item: { id: string }) => item.id === user.id)
        .professional,
    ).toEqual(edited.json().professional);
    const legacy = await app.inject({
      method: "PUT",
      url: `/admin/users/${user.id}/professional`,
      headers,
      payload: { professionalId: null },
    });
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json().professionalId).toBeUndefined();
  });

  it("diferencia conflitos e valida campos antes de gravar", async () => {
    const create = (body: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/admin/users",
        headers,
        payload: body,
      });
    expect((await create(payload)).statusCode).toBe(201);
    const duplicateEmail = await create(payload);
    expect(duplicateEmail.json()).toMatchObject({
      code: "USER_EMAIL_DUPLICATE",
    });
    const duplicateRegister = await create({
      ...payload,
      email: "outra@example.com",
    });
    expect(duplicateRegister.json()).toMatchObject({
      code: "PROFESSIONAL_CREFITO_EXISTS",
    });
    const invalid = await create({
      ...payload,
      email: "invalida@example.com",
      professional: {
        mode: "create",
        data: { ...payload.professional.data, crefito: "" },
      },
    });
    expect(invalid.statusCode).toBe(400);
    const list = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers,
    });
    expect(
      list
        .json()
        .filter((item: { email: string }) =>
          item.email.endsWith("@example.com"),
        ),
    ).toHaveLength(1);
  });

  it("não concede acesso administrativo a um usuário que atende", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload,
    });
    expect(created.statusCode).toBe(201);
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: payload.email, password: payload.password },
    });
    const denied = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${login.json().token}` },
      payload: { ...payload, email: "sem-acesso@example.com" },
    });
    expect(denied.statusCode).toBe(403);
    expect(created.json().permissions).toEqual([]);
  });
});
