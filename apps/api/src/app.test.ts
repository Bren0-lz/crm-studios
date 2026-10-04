import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import type { Appointment, Lead } from "@crm/contracts";
import { appModuleSchema, defaultRelationshipSettings, groupClassName } from "@crm/contracts";
import { localParts, zonedTimeToUtc } from "./group-schedule.js";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import {
  legacyRoleDefaultEditModules,
  legacyRoleDefaultModules,
  type LegacyRole,
} from "./legacy-roles.js";
import { MemoryClinicRepository } from "./memory-repository.js";

/**
 * Os testes de acesso usam os perfis antigos como "fixtures": cada um vira um usuário real com
 * os módulos que o perfil tinha (o que a migração 0042 gravou). `owner` = o admin demo.
 */
type UserRole = LegacyRole;
/** Tipo no token (a API relê o tipo e os módulos do usuário a cada requisição). */
const tokenRole = (role: LegacyRole): "admin" | "user" =>
  role === "owner" ? "admin" : "user";

async function authenticatedApp() {
  const app = await buildApp({
    repository: new MemoryClinicRepository(),
    logger: false,
  });
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@movimenta.local", password: "Admin@123" },
  });
  return { app, token: response.json().token as string };
}

const OWNER_ID = "22222222-2222-4222-8222-222222222222";
type TestApp = Awaited<ReturnType<typeof buildApp>>;
const roleUserIds = new WeakMap<TestApp, Record<UserRole, string>>();

/**
 * A API relê o usuário do token a cada requisição (perfil, módulos, ativo): tokens de outros
 * perfis precisam ser de usuários reais. Cria uma usuária de cada perfil (uma vez por app).
 */
async function seedRoleUsers(app: TestApp) {
  if (roleUserIds.has(app)) return roleUserIds.get(app)!;
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@movimenta.local", password: "Admin@123" },
  });
  const headers = { authorization: `Bearer ${login.json().token as string}` };
  const ids = { owner: OWNER_ID } as Record<UserRole, string>;
  for (const role of ["reception", "physiotherapist", "finance"] as const) {
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: `Usuária ${role}`,
        email: `perfil.${role}@teste.local`,
        role: "user",
        password: "SenhaForte123",
        modules: legacyRoleDefaultModules[role],
        editModules: legacyRoleDefaultEditModules[role],
      },
    });
    expect(created.statusCode).toBe(201);
    ids[role] = created.json().id as string;
  }
  roleUserIds.set(app, ids);
  return ids;
}

/** Id do usuário real do perfil (exige `seedRoleUsers(app)` antes). */
function roleSub(app: TestApp, role: UserRole) {
  const ids = roleUserIds.get(app);
  if (!ids) throw new Error("Chame seedRoleUsers(app) antes de roleSub.");
  return ids[role];
}

describe("CRM API", () => {
  it("allows the web app to send every write method through CORS", async () => {
    const app = await buildApp({ repository: new MemoryClinicRepository(), logger: false });
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const preflight = await app.inject({
        method: "OPTIONS",
        url: "/patients/99999999-9999-4999-8999-999999999999",
        headers: {
          origin: config.WEB_ORIGIN,
          "access-control-request-method": method,
          "access-control-request-headers": "authorization,content-type",
        },
      });
      expect(preflight.headers["access-control-allow-origin"]).toBe(config.WEB_ORIGIN);
      expect(String(preflight.headers["access-control-allow-methods"])).toContain(method);
    }
    await app.close();
  });

  it("reports health", async () => {
    const app = await buildApp({
      repository: new MemoryClinicRepository(),
      logger: false,
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      storage: config.STORAGE_MODE,
    });
    await app.close();
  });

  it("allows either local frontend address during development", async () => {
    const app = await buildApp({ repository: new MemoryClinicRepository(), logger: false });
    const local = await app.inject({ method: "GET", url: "/health", headers: { origin: "http://127.0.0.1:5173" } });
    expect(local.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    const external = await app.inject({ method: "GET", url: "/health", headers: { origin: "http://example.com" } });
    expect(external.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("authenticates the demo owner", async () => {
    const { app, token } = await authenticatedApp();
    expect(token).toBeTypeOf("string");
    await app.close();
  });

  it("creates and edits users with job title and modules, auditing permission changes", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const me = await app.inject({ method: "GET", url: "/me", headers });
    expect(me.json()).toMatchObject({ role: "admin" });
    expect(me.json().modules).toContain("settings");
    expect(me.json().modules).toHaveLength(12);

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
    expect(kept.json()).toMatchObject({ role: "user", modules: ["agenda", "finance"] });
    expect(kept.json().jobTitle).toBeUndefined();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "bia@movimenta.local", password: "Segura@1234" },
    });
    expect(login.json().user).toMatchObject({ role: "user", modules: ["agenda", "finance"] });
    const userHeaders = { authorization: `Bearer ${login.json().token as string}` };
    const userMe = await app.inject({ method: "GET", url: "/me", headers: userHeaders });
    expect(userMe.json().modules).toEqual(["agenda", "finance"]);

    // `null` = nenhum módulo (não há mais padrão por perfil).
    const reset = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, modules: null },
    });
    expect(reset.json()).toMatchObject({ customModules: false, modules: [], editModules: [] });

    const invalid = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, modules: ["admin"] },
    });
    expect(invalid.statusCode).toBe(400);

    const audit = await app.inject({ method: "GET", url: "/admin/audit-events", headers });
    const permissionEvents = (
      audit.json() as Array<{ action: string; entityId?: string; metadata: Record<string, unknown> }>
    ).filter((event) => event.action === "users.permissions_updated");
    expect(permissionEvents).toHaveLength(2);
    expect(permissionEvents.every((event) => event.entityId === userId)).toBe(true);
    expect(permissionEvents.map((event) => event.metadata.custom)).toEqual([false, true]);

    const matrix = await app.inject({ method: "GET", url: "/admin/permission-matrix", headers });
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
    expect(me.json().editModules).toHaveLength(12);

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
      payload: { ...base, editModules: ["patients", "finance", "clinical", "patients"] },
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
    expect(reset.json()).toMatchObject({ customModules: false, modules: [], editModules: [] });

    // Admin nunca guarda lista: vê e edita tudo.
    const admin = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, role: "admin", editModules: ["agenda"] },
    });
    expect(admin.json()).toMatchObject({ role: "admin", customModules: false });
    expect(admin.json().editModules).toHaveLength(12);

    const invalid = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers,
      payload: { ...base, editModules: ["admin"] },
    });
    expect(invalid.statusCode).toBe(400);

    const audit = await app.inject({ method: "GET", url: "/admin/audit-events", headers });
    const permissionEvents = (
      audit.json() as Array<{ action: string; entityId?: string; metadata: Record<string, unknown> }>
    ).filter(
      (event) => event.action === "users.permissions_updated" && event.entityId === userId,
    );
    expect(permissionEvents).toHaveLength(4);
    expect(permissionEvents.at(-1)!.metadata).toEqual({
      modules: physioModules,
      editModules: [],
      custom: true,
    });
    expect(permissionEvents.at(-2)!.metadata).toEqual({
      modules: physioModules,
      editModules: ["patients", "clinical"],
      custom: true,
    });
    expect(permissionEvents[0]!.metadata).toMatchObject({ custom: false });
    await app.close();
  });

  it("links users to agenda professionals and sets their commission rule, owner only", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    await seedRoleUsers(app);
    const ana = "33333333-3333-4333-8333-333333333333";
    const other = "44444444-4444-4444-8444-444444444444";
    const missing = "99999999-9999-4999-8999-999999999999";
    const createUser = async (email: string) => {
      const created = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers,
        payload: {
          fullName: "Instrutora Teste",
          email,
          role: "user",
          password: "Segura@1234",
        },
      });
      expect(created.statusCode).toBe(201);
      return created.json().id as string;
    };
    const userA = await createUser("instrutora.a@movimenta.local");
    const userB = await createUser("instrutora.b@movimenta.local");
    const link = (userId: string, professionalId: string | null) =>
      app.inject({
        method: "PUT",
        url: `/admin/users/${userId}/professional`,
        headers,
        payload: { professionalId },
      });
    const commission = (userId: string, payload: Record<string, unknown>) =>
      app.inject({
        method: "PUT",
        url: `/admin/users/${userId}/commission`,
        headers,
        payload,
      });

    // Sem profissional ligado não há comissão.
    const notProfessional = await commission(userA, { percentage: 30, effectiveFrom: "2020-01-01" });
    expect(notProfessional.statusCode).toBe(409);
    expect(notProfessional.json().code).toBe("USER_NOT_PROFESSIONAL");
    expect((await link(missing, ana)).json().code).toBe("USER_NOT_FOUND");
    expect((await link(missing, ana)).statusCode).toBe(404);
    const unknownProfessional = await link(userA, missing);
    expect(unknownProfessional.statusCode).toBe(404);
    expect(unknownProfessional.json().code).toBe("PROFESSIONAL_NOT_FOUND");
    expect((await link(userA, "nao-e-uuid")).statusCode).toBe(400);
    expect((await commission(missing, { percentage: 10, effectiveFrom: "2020-01-01" })).statusCode).toBe(404);

    const linked = await link(userA, ana);
    expect(linked.statusCode).toBe(200);
    expect(linked.json()).toMatchObject({
      id: userA,
      professionalId: ana,
      professionalName: "Dra. Ana Martins",
    });
    expect(linked.json().commissionPercentage).toBeUndefined();

    const taken = await link(userB, ana);
    expect(taken.statusCode).toBe(409);
    expect(taken.json().code).toBe("PROFESSIONAL_ALREADY_LINKED");

    const rule = await commission(userA, { percentage: 40, effectiveFrom: "2020-01-01" });
    expect(rule.statusCode).toBe(200);
    expect(rule.json()).toMatchObject({
      professionalId: ana,
      commissionPercentage: 40,
      commissionEffectiveFrom: "2020-01-01",
    });
    // Regra futura não vale hoje; vigência repetida e percentual fora de 0–100 são recusados.
    const future = await commission(userA, { percentage: 50, effectiveFrom: "2999-01-01" });
    expect(future.json()).toMatchObject({ commissionPercentage: 40, commissionEffectiveFrom: "2020-01-01" });
    const duplicate = await commission(userA, { percentage: 45, effectiveFrom: "2020-01-01" });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe("COMMISSION_RULE_DUPLICATE");
    expect((await commission(userA, { percentage: 101, effectiveFrom: "2020-01-01" })).statusCode).toBe(400);
    expect((await commission(userA, { percentage: 10, effectiveFrom: "01/01/2020" })).statusCode).toBe(400);

    // A regra é a mesma do Financeiro (commission_rules por profissional).
    const workspace = await app.inject({ method: "GET", url: "/finance/workspace", headers });
    const rules = (workspace.json().commissionRules as Array<{ professionalId: string; percentage: number }>)
      .filter((item) => item.professionalId === ana)
      .map((item) => item.percentage)
      .sort();
    expect(rules).toEqual([40, 50]);

    const users = await app.inject({ method: "GET", url: "/admin/users", headers });
    expect(users.json().find((item: { id: string }) => item.id === userA)).toMatchObject({
      professionalId: ana,
      professionalName: "Dra. Ana Martins",
      commissionPercentage: 40,
      commissionEffectiveFrom: "2020-01-01",
    });
    expect(users.json().find((item: { id: string }) => item.id === userB).professionalId).toBeUndefined();

    // Ligar a outro profissional troca a ligação e libera o anterior.
    const switched = await link(userA, other);
    expect(switched.statusCode).toBe(200);
    expect(switched.json().professionalId).toBe(other);
    expect(switched.json().commissionPercentage).toBeUndefined();
    expect((await link(userB, ana)).json().professionalId).toBe(ana);
    const unlinked = await link(userA, null);
    expect(unlinked.statusCode).toBe(200);
    expect(unlinked.json().professionalId).toBeUndefined();
    expect(unlinked.json().professionalName).toBeUndefined();

    for (const role of ["reception", "physiotherapist", "finance"] as const) {
      const roleHeaders = {
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId: "11111111-1111-4111-8111-111111111111", role: tokenRole(role) })}`,
      };
      const denied = await app.inject({
        method: "PUT",
        url: `/admin/users/${userB}/professional`,
        headers: roleHeaders,
        payload: { professionalId: null },
      });
      expect(denied.statusCode).toBe(403);
      const deniedCommission = await app.inject({
        method: "PUT",
        url: `/admin/users/${userB}/commission`,
        headers: roleHeaders,
        payload: { percentage: 10, effectiveFrom: "2021-01-01" },
      });
      expect(deniedCommission.statusCode).toBe(403);
    }

    const audit = await app.inject({ method: "GET", url: "/admin/audit-events", headers });
    const events = audit.json() as Array<{ action: string; entityId?: string; metadata: Record<string, unknown> }>;
    const linkEvents = events.filter(
      (item) => item.action === "users.professional_updated" && item.entityId === userA,
    );
    expect(linkEvents.map((item) => item.metadata)).toEqual(
      expect.arrayContaining([
        { professionalId: ana, previousProfessionalId: null },
        { professionalId: other, previousProfessionalId: ana },
        { professionalId: null, previousProfessionalId: other },
      ]),
    );
    const commissionEvents = events.filter(
      (item) => item.action === "users.commission_updated" && item.entityId === userA,
    );
    expect(commissionEvents).toHaveLength(2);
    expect(commissionEvents.map((item) => item.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ professionalId: ana, percentage: 40, effectiveFrom: "2020-01-01" }),
      ]),
    );
    await app.close();
  });

  it("treats an empty client filter as every client in plans and clinical records", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    for (const path of ["/plans", "/clinical-records"]) {
      const all = await app.inject({ method: "GET", url: path, headers });
      const empty = await app.inject({ method: "GET", url: `${path}?patientId=`, headers });
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual(all.json());
      const invalid = await app.inject({ method: "GET", url: `${path}?patientId=abc`, headers });
      expect(invalid.statusCode).toBe(400);
    }
    await app.close();
  });

  it("creates and searches a patient", async () => {
    const { app, token } = await authenticatedApp();
    const created = await app.inject({
      method: "POST",
      url: "/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fullName: "Joana de Souza",
        phone: "11999990000",
        cpf: "12345678901",
        tags: ["Avaliação"],
      },
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: "/patients?search=Joana",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listed.json()).toHaveLength(1);
    expect(listed.json()[0].fullName).toBe("Joana de Souza");
    expect(listed.json()[0].phone).toBe("11999990000");

    const byFormattedPhone = await app.inject({
      method: "GET",
      url: `/patients?search=${encodeURIComponent("(11) 99999-0000")}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(byFormattedPhone.json().map((item: { fullName: string }) => item.fullName)).toContain("Joana de Souza");
    await app.close();
  });

  it("edits a patient without changing their record number or duplicating a CPF", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patient = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          fullName: "Joana de Souza",
          phone: "11999990000",
          cpf: "12345678901",
          tags: [],
        },
      })
    ).json();
    const [professional, room, service] = await Promise.all([
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const startsAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    startsAt.setUTCHours(18, 0, 0, 0);
    const appointment = (
      await app.inject({
        method: "POST",
        url: "/appointments",
        headers,
        payload: {
          patientId: patient.id,
          professionalId: professional.json()[0].id,
          roomId: room.json()[0].id,
          serviceId: service.json()[0].id,
          startsAt: startsAt.toISOString(),
        },
      })
    ).json();
    const updated = await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: {
        fullName: "Joana Pereira",
        phone: "11988887777",
        cpf: patient.cpf,
        tags: ["Retorno"],
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: patient.id,
      recordNumber: patient.recordNumber,
      fullName: "Joana Pereira",
      tags: ["Retorno"],
    });
    const agenda = await app.inject({
      method: "GET",
      url: `/appointments?from=${encodeURIComponent(startsAt.toISOString())}&to=${encodeURIComponent(new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString())}`,
      headers,
    });
    expect(agenda.json().find((item: Appointment) => item.id === appointment.id).patientName).toBe("Joana Pereira");
    const other = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: { fullName: "Outra Pessoa", phone: "11911112222", tags: [] },
      })
    ).json();
    const duplicate = await app.inject({
      method: "PUT",
      url: `/patients/${other.id}`,
      headers,
      payload: {
        fullName: other.fullName,
        phone: other.phone,
        cpf: patient.cpf,
        tags: [],
      },
    });
    expect(duplicate.statusCode).toBe(409);
    await app.close();
  });

  it("prevents schedule conflicts", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = (
      await app.inject({ method: "GET", url: "/patients", headers })
    ).json();
    const professionals = (
      await app.inject({ method: "GET", url: "/professionals", headers })
    ).json();
    const rooms = (
      await app.inject({ method: "GET", url: "/rooms", headers })
    ).json();
    const services = (
      await app.inject({ method: "GET", url: "/services", headers })
    ).json();
    const startsAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const payload = {
      patientId: patients[0].id,
      professionalId: professionals[0].id,
      roomId: rooms[0].id,
      serviceId: services[0].id,
      startsAt,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/appointments",
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/appointments",
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(409);
    await app.close();
  });

  it("reschedules one appointment, keeps history and rejects occupied or closed slots", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const base = new Date(Date.now() + 46 * 24 * 60 * 60 * 1000);
    base.setUTCHours(18, 0, 0, 0);
    const at = (hours: number) =>
      new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
    const payload = {
      patientId: patients.json()[0].id,
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
    };
    const first = (
      await app.inject({ method: "POST", url: "/appointments", headers, payload: { ...payload, startsAt: at(0) } })
    ).json();
    expect(
      (await app.inject({ method: "POST", url: "/appointments", headers, payload: { ...payload, startsAt: at(2) } })).statusCode,
    ).toBe(201);
    const move = { professionalId: payload.professionalId, roomId: payload.roomId, startsAt: at(1) };
    const moved = await app.inject({
      method: "PUT",
      url: `/appointments/${first.id}/schedule`,
      headers,
      payload: move,
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().startsAt).toBe(at(1));
    const history = await app.inject({
      method: "GET",
      url: `/appointments/${first.id}/reschedules`,
      headers,
    });
    expect(history.json()).toHaveLength(1);
    expect(history.json()[0]).toMatchObject({ previousStartsAt: at(0), startsAt: at(1), actorName: "Aryana Dutra" });
    expect(
      (await app.inject({ method: "PUT", url: `/appointments/${first.id}/schedule`, headers, payload: move })).statusCode,
    ).toBe(200);
    const conflict = await app.inject({
      method: "PUT",
      url: `/appointments/${first.id}/schedule`,
      headers,
      payload: { ...move, startsAt: at(2) },
    });
    expect(conflict.statusCode).toBe(409);
    const afterConflict = await app.inject({
      method: "GET",
      url: `/appointments?from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(3))}`,
      headers,
    });
    expect(afterConflict.json().find((item: Appointment) => item.id === first.id).startsAt).toBe(at(1));
    expect(
      (await app.inject({ method: "GET", url: `/appointments/${first.id}/reschedules`, headers })).json(),
    ).toHaveLength(1);
    expect(
      (await app.inject({ method: "PATCH", url: `/appointments/${first.id}/status`, headers, payload: { status: "cancelled" } })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "PUT", url: `/appointments/${first.id}/schedule`, headers, payload: move })).statusCode,
    ).toBe(409);
    await app.close();
  });

  it("keeps the visit type on create, series, listing and reschedule and counts it in the report", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const base = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    base.setUTCHours(13, 0, 0, 0);
    const at = (hours: number, weeks = 0) =>
      new Date(
        base.getTime() + (weeks * 7 * 24 + hours) * 60 * 60 * 1000,
      ).toISOString();
    const payload = {
      patientId: patients.json()[0].id,
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
    };
    const regular = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...payload, startsAt: at(0) },
    });
    expect(regular.statusCode).toBe(201);
    expect(regular.json().visitType).toBe("regular");
    const evaluation = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...payload, startsAt: at(2), visitType: "evaluation" },
    });
    expect(evaluation.statusCode).toBe(201);
    expect(evaluation.json().visitType).toBe("evaluation");
    const invalid = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...payload, startsAt: at(4), visitType: "vip" },
    });
    expect(invalid.statusCode).toBe(400);
    const series = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: {
        ...payload,
        startsAt: at(4),
        visitType: "trial",
        occurrences: 2,
        intervalWeeks: 1,
      },
    });
    expect(series.statusCode).toBe(201);
    expect(series.json().map((item: Appointment) => item.visitType)).toEqual([
      "trial",
      "trial",
    ]);
    const moved = await app.inject({
      method: "PUT",
      url: `/appointments/${evaluation.json().id}/schedule`,
      headers,
      payload: {
        professionalId: payload.professionalId,
        roomId: payload.roomId,
        startsAt: at(6),
      },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().visitType).toBe("evaluation");
    const listed = await app.inject({
      method: "GET",
      url: `/appointments?from=${encodeURIComponent(at(-1))}&to=${encodeURIComponent(at(8, 1))}`,
      headers,
    });
    const byId = new Map(
      listed.json().map((item: Appointment) => [item.id, item.visitType]),
    );
    expect(byId.get(regular.json().id)).toBe("regular");
    expect(byId.get(evaluation.json().id)).toBe("evaluation");
    for (const item of series.json() as Appointment[])
      expect(byId.get(item.id)).toBe("trial");
    const day = (value: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
        new Date(value),
      );
    const report = await app.inject({
      method: "GET",
      url: `/reports/management?from=${day(at(0))}&to=${day(at(4, 1))}`,
      headers,
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().appointments).toMatchObject({
      total: 4,
      byVisitType: { regular: 1, trial: 2, evaluation: 1 },
    });
    await app.close();
  });

  it("reports trial conversion when the client gets a plan within 30 days of a completed trial", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const serviceId = services.json()[0].id as string;
    const base = {
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId,
    };
    const [clientA, clientB] = [
      patients.json()[0].id as string,
      patients.json()[1].id as string,
    ];
    const createLead = async (fullName: string, phone: string) =>
      (
        await app.inject({
          method: "POST",
          url: "/leads",
          headers,
          payload: { fullName, phone, source: "Instagram", interest: "Pilates" },
        })
      ).json().id as string;
    const convertedLead = await createLead("Fábio Experimental", "11922221111");
    const openLead = await createLead("Gisele Avaliação", "11922220000");
    const schedule = async (
      startsAt: string,
      visitType: string,
      owner: { patientId: string } | { leadId: string },
    ) => {
      const response =
        "leadId" in owner
          ? await app.inject({
              method: "POST",
              url: `/leads/${owner.leadId}/appointments`,
              headers,
              payload: { ...base, startsAt, visitType },
            })
          : await app.inject({
              method: "POST",
              url: "/appointments",
              headers,
              payload: { ...base, patientId: owner.patientId, startsAt, visitType },
            });
      expect(response.statusCode).toBe(201);
      return response.json().id as string;
    };
    const setStatus = async (id: string, status: string) =>
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/appointments/${id}/status`,
            headers,
            payload: { status },
          })
        ).statusCode,
      ).toBe(200);

    // Lead que vira cliente e contrata 8 dias depois: convertida.
    const leadTrial = await schedule("2032-03-01T13:00:00.000Z", "trial", { leadId: convertedLead });
    // Lead que nunca vira cliente: concluída, não convertida.
    const openLeadEvaluation = await schedule("2032-03-02T13:00:00.000Z", "evaluation", { leadId: openLead });
    // Cliente que contrata só depois de 30 dias: não convertida.
    const lateTrial = await schedule("2032-03-03T13:00:00.000Z", "trial", { patientId: clientA });
    // Cliente que contrata no mesmo dia: convertida.
    const sameDayEvaluation = await schedule("2032-03-04T13:00:00.000Z", "evaluation", { patientId: clientB });
    // Cancelada: fora de "agendadas".
    const cancelledTrial = await schedule("2032-03-05T13:00:00.000Z", "trial", { patientId: clientA });
    // Ainda não concluída: só conta em "agendadas".
    await schedule("2032-03-08T13:00:00.000Z", "trial", { patientId: clientB });
    // Atendimento regular concluído: ignorado.
    const regular = await schedule("2032-03-09T13:00:00.000Z", "regular", { patientId: clientA });
    // Experimental fora do período: ignorada.
    await schedule("2032-04-05T13:00:00.000Z", "trial", { patientId: clientA });
    for (const id of [leadTrial, openLeadEvaluation, lateTrial, sameDayEvaluation, regular])
      await setStatus(id, "completed");
    await setStatus(cancelledTrial, "cancelled");

    const createPlan = async (at: string, patientId: string) => {
      vi.setSystemTime(new Date(at));
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers: {
          authorization: `Bearer ${app.jwt.sign({
            sub: "22222222-2222-4222-8222-222222222222",
            clinicId: "11111111-1111-4111-8111-111111111111",
            role: "admin",
          })}`,
        },
        payload: {
          patientId,
          serviceId,
          name: "Pacote pós-experimental",
          kind: "fixed_package",
          totalSessions: 4,
          validFrom: at.slice(0, 10),
          totalValueInCents: 40000,
          installments: 1,
          firstDueDate: at.slice(0, 10),
        },
      });
      expect(plan.statusCode).toBe(201);
    };
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2032-03-08T15:00:00.000Z"));
      const conversion = await app.inject({
        method: "POST",
        url: `/leads/${convertedLead}/convert`,
        headers: {
          authorization: `Bearer ${app.jwt.sign({
            sub: "22222222-2222-4222-8222-222222222222",
            clinicId: "11111111-1111-4111-8111-111111111111",
            role: "admin",
          })}`,
        },
      });
      expect(conversion.statusCode).toBe(200);
      await createPlan("2032-03-09T15:00:00.000Z", conversion.json().patient.id as string);
      await createPlan("2032-03-04T18:00:00.000Z", clientB);
      await createPlan("2032-04-10T15:00:00.000Z", clientA);
      const report = await app.inject({
        method: "GET",
        url: "/reports/management?from=2032-03-01&to=2032-03-31",
        headers: {
          authorization: `Bearer ${app.jwt.sign({
            sub: "22222222-2222-4222-8222-222222222222",
            clinicId: "11111111-1111-4111-8111-111111111111",
            role: "admin",
          })}`,
        },
      });
      expect(report.statusCode).toBe(200);
      expect(report.json().trials).toEqual({
        scheduled: 5,
        completed: 4,
        converted: 2,
        conversionRate: 50,
      });
      const empty = await app.inject({
        method: "GET",
        url: "/reports/management?from=2032-06-01&to=2032-06-30",
        headers: {
          authorization: `Bearer ${app.jwt.sign({
            sub: "22222222-2222-4222-8222-222222222222",
            clinicId: "11111111-1111-4111-8111-111111111111",
            role: "admin",
          })}`,
        },
      });
      expect(empty.json().trials).toEqual({
        scheduled: 0,
        completed: 0,
        converted: 0,
        conversionRate: 0,
      });
    } finally {
      vi.useRealTimers();
    }
    await app.close();
  });

  it("schedules a trial for a lead without converting it and applies the agenda rules", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const clinicId = "11111111-1111-4111-8111-111111111111";
    await seedRoleUsers(app);
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Carla Experimental",
        phone: "11955554444",
        source: "Instagram",
        interest: "Pilates",
      },
    });
    expect(lead.statusCode).toBe(201);
    const leadId = lead.json().id as string;
    const payload = {
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
      startsAt: "2031-05-12T13:00:00.000Z",
      visitType: "trial",
    };

    const denied = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "physiotherapist"), clinicId, role: "user" })}`,
      },
      payload,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
    for (const visitType of [undefined, "regular"]) {
      const invalid = await app.inject({
        method: "POST",
        url: `/leads/${leadId}/appointments`,
        headers,
        payload: { ...payload, visitType },
      });
      expect(invalid.statusCode).toBe(400);
    }
    const missing = await app.inject({
      method: "POST",
      url: "/leads/99999999-9999-4999-8999-000000000000/appointments",
      headers,
      payload,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "LEAD_NOT_FOUND" });

    const receptionHeaders = {
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "reception"), clinicId, role: "user" })}`,
    };
    const created = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers: receptionHeaders,
      payload,
    });
    expect(created.statusCode).toBe(201);
    const appointment = created.json() as Appointment;
    expect(appointment).toMatchObject({
      leadId,
      leadName: "Carla Experimental",
      patientName: "Carla Experimental",
      visitType: "trial",
      status: "scheduled",
    });
    expect(appointment).not.toHaveProperty("patientId");
    const leads = await app.inject({ method: "GET", url: "/leads", headers });
    const storedLead = (leads.json() as Lead[]).find((item) => item.id === leadId);
    expect(storedLead?.stage).toBe("new_contact");
    expect(storedLead).not.toHaveProperty("convertedPatientId");

    const agenda = await app.inject({
      method: "GET",
      url: "/appointments?from=2031-05-12T00:00:00.000Z&to=2031-05-13T00:00:00.000Z",
      headers,
    });
    expect(agenda.json()).toEqual([
      expect.objectContaining({ id: appointment.id, leadId, leadName: "Carla Experimental" }),
    ]);

    const sameProfessional = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        patientId: patients.json()[0].id,
        professionalId: payload.professionalId,
        roomId: rooms.json()[1].id,
        serviceId: payload.serviceId,
        startsAt: payload.startsAt,
      },
    });
    expect(sameProfessional.statusCode).toBe(409);
    expect(sameProfessional.json()).toMatchObject({ code: "APPOINTMENT_CONFLICT" });
    const sameRoom = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, professionalId: professionals.json()[1].id },
    });
    expect(sameRoom.statusCode).toBe(409);
    expect(sameRoom.json()).toMatchObject({ code: "APPOINTMENT_CONFLICT" });

    const block = await app.inject({
      method: "POST",
      url: "/schedule-blocks",
      headers,
      payload: {
        professionalId: payload.professionalId,
        startsAt: "2031-05-13T12:00:00.000Z",
        endsAt: "2031-05-13T18:00:00.000Z",
        reason: "Reunião de equipe",
      },
    });
    expect(block.statusCode).toBe(201);
    const blocked = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-13T13:00:00.000Z" },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: "APPOINTMENT_CONFLICT" });

    const holiday = await app.inject({
      method: "POST",
      url: "/holidays",
      headers,
      payload: { date: "2031-05-14", name: "Feriado municipal" },
    });
    expect(holiday.statusCode).toBe(201);
    const onHoliday = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-14T13:00:00.000Z" },
    });
    expect(onHoliday.statusCode).toBe(409);
    expect(onHoliday.json()).toMatchObject({ code: "HOLIDAY" });

    const evaluation = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-15T13:00:00.000Z", visitType: "evaluation" },
    });
    expect(evaluation.statusCode).toBe(201);
    expect(evaluation.json()).toMatchObject({ leadId, visitType: "evaluation" });

    const converted = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/convert`,
      headers,
    });
    expect(converted.statusCode).toBe(200);
    const afterConversion = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-16T13:00:00.000Z" },
    });
    expect(afterConversion.statusCode).toBe(409);
    expect(afterConversion.json()).toMatchObject({ code: "LEAD_ALREADY_CONVERTED" });
    await app.close();
  });

  it("keeps lead appointments out of sessions, clinical records, NPS, reminders, commissions, sales and client history", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const patientId = patients.json()[0].id as string;
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Davi Avaliação",
        phone: "11944443333",
        source: "Site",
        interest: "Fisioterapia",
      },
    });
    const leadId = lead.json().id as string;
    const payload = {
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
      visitType: "evaluation",
    };
    const done = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-06T13:00:00.000Z" },
    });
    const upcoming = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-20T13:00:00.000Z" },
    });
    expect(done.statusCode).toBe(201);
    expect(upcoming.statusCode).toBe(201);

    // Sessões: finalizar e reabrir não mexe em plano nenhum.
    const plansBefore = (await app.inject({ method: "GET", url: "/plans", headers })).json();
    const completed = await app.inject({
      method: "PATCH",
      url: `/appointments/${done.json().id}/status`,
      headers,
      payload: { status: "completed" },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ status: "completed", leadId });
    const reopened = await app.inject({
      method: "PATCH",
      url: `/appointments/${done.json().id}/status`,
      headers,
      payload: { status: "confirmed" },
    });
    expect(reopened.statusCode).toBe(200);
    await app.inject({
      method: "PATCH",
      url: `/appointments/${done.json().id}/status`,
      headers,
      payload: { status: "completed" },
    });
    expect((await app.inject({ method: "GET", url: "/plans", headers })).json()).toEqual(
      plansBefore,
    );

    // Prontuário e NPS: recusados com código próprio.
    const record = await app.inject({
      method: "POST",
      url: "/clinical-records",
      headers,
      payload: {
        appointmentId: done.json().id,
        subjective: "Relato",
        objective: "Exame",
        assessment: "Avaliação",
        plan: "Plano",
      },
    });
    expect(record.statusCode).toBe(409);
    expect(record.json()).toMatchObject({ code: "LEAD_APPOINTMENT_NOT_ALLOWED" });
    const survey = await app.inject({
      method: "POST",
      url: "/satisfaction",
      headers,
      payload: { patientId, appointmentId: done.json().id, score: 9 },
    });
    expect(survey.statusCode).toBe(409);
    expect(survey.json()).toMatchObject({ code: "LEAD_APPOINTMENT_NOT_ALLOWED" });

    // Lembretes: nada é enfileirado para o lead.
    const reminders = await app.inject({
      method: "POST",
      url: "/communications/reminders/generate",
      headers,
      payload: { referenceDate: "2031-05-20" },
    });
    expect(reminders.statusCode).toBe(200);
    expect(reminders.json()).toMatchObject({ queued: 0, alreadyQueued: 0, skippedByPreference: 0 });

    // Comissões: atendimento de lead finalizado não gera comissão.
    await app.inject({
      method: "POST",
      url: "/finance/commission-rules",
      headers,
      payload: { professionalId: payload.professionalId, percentage: 30, effectiveFrom: "2031-01-01" },
    });
    const commissions = await app.inject({
      method: "POST",
      url: "/finance/commissions/generate",
      headers,
      payload: { competence: "2031-05" },
    });
    expect(commissions.statusCode).toBe(200);
    expect(commissions.json()).toEqual([]);

    // Relatório gerencial (agenda) conta o atendimento pelo tipo.
    const management = await app.inject({
      method: "GET",
      url: "/reports/management?from=2031-05-01&to=2031-05-31",
      headers,
    });
    expect(management.json().appointments).toMatchObject({
      total: 2,
      completed: 1,
      byVisitType: { regular: 0, trial: 0, evaluation: 2 },
    });

    // Linha do tempo de qualquer cliente não mostra o atendimento do lead.
    const timeline = await app.inject({
      method: "GET",
      url: `/patients/${patientId}/timeline`,
      headers,
    });
    expect(timeline.statusCode).toBe(200);
    expect(JSON.stringify(timeline.json())).not.toContain(done.json().id);

    // Sugestões de contato e vendas/retorno ignoram o lead, mesmo depois da data.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2031-06-10T15:00:00.000Z"));
      const laterHeaders = {
        authorization: `Bearer ${app.jwt.sign({
          sub: "22222222-2222-4222-8222-222222222222",
          clinicId: "11111111-1111-4111-8111-111111111111",
          role: "admin",
        })}`,
      };
      const suggestions = await app.inject({
        method: "GET",
        url: "/relationship/suggestions",
        headers: laterHeaders,
      });
      expect(suggestions.statusCode).toBe(200);
      expect(JSON.stringify(suggestions.json())).not.toContain(done.json().id);
      const sales = await app.inject({
        method: "GET",
        url: "/reports/sales?month=2031-06",
        headers: laterHeaders,
      });
      expect(sales.statusCode).toBe(200);
      expect(sales.json().previousComparable.attendedPatients).toBe(0);
      expect(sales.json().patientsWithoutReturn).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
    await app.close();
  });

  it("moves the lead appointments to the new client on conversion", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Elisa Conversão",
        phone: "11933332222",
        source: "Instagram",
        interest: "Pilates",
      },
    });
    const leadId = lead.json().id as string;
    const serviceId = services.json()[0].id as string;
    const payload = {
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId,
    };
    const trial = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-06T13:00:00.000Z", visitType: "trial" },
    });
    const evaluation = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-20T13:00:00.000Z", visitType: "evaluation" },
    });
    expect(trial.statusCode).toBe(201);
    expect(evaluation.statusCode).toBe(201);
    const ids = [trial.json().id as string, evaluation.json().id as string];

    const conversion = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/convert`,
      headers,
    });
    expect(conversion.statusCode).toBe(200);
    expect(conversion.json()).toMatchObject({ reusedExisting: false });
    const patientId = conversion.json().patient.id as string;

    const agenda = await app.inject({
      method: "GET",
      url: "/appointments?from=2031-05-01T00:00:00.000Z&to=2031-05-31T00:00:00.000Z",
      headers,
    });
    const moved = (agenda.json() as Appointment[]).filter((item) => ids.includes(item.id));
    expect(moved).toHaveLength(2);
    for (const item of moved) {
      expect(item).toMatchObject({ patientId, patientName: "Elisa Conversão" });
      expect(item).not.toHaveProperty("leadId");
      expect(item).not.toHaveProperty("leadName");
    }
    expect(moved.map((item) => item.visitType).sort()).toEqual(["evaluation", "trial"]);

    // Linha do tempo do cliente passa a mostrar os atendimentos.
    const timeline = await app.inject({
      method: "GET",
      url: `/patients/${patientId}/timeline`,
      headers,
    });
    expect(timeline.statusCode).toBe(200);
    for (const id of ids) expect(JSON.stringify(timeline.json())).toContain(id);

    // Finalizar consome sessão do plano do cliente.
    const plan = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        patientId,
        serviceId,
        name: "Pacote pós-experimental",
        kind: "fixed_package",
        totalSessions: 4,
        validFrom: "2031-05-01",
        totalValueInCents: 40000,
        installments: 1,
        firstDueDate: "2031-05-01",
      },
    });
    expect(plan.statusCode).toBe(201);
    const completed = await app.inject({
      method: "PATCH",
      url: `/appointments/${ids[0]}/status`,
      headers,
      payload: { status: "completed" },
    });
    expect(completed.statusCode).toBe(200);
    const plans = await app.inject({ method: "GET", url: "/plans", headers });
    expect(
      (plans.json() as { id: string; remainingSessions: number }[]).find(
        (item) => item.id === plan.json().id,
      )?.remainingSessions,
    ).toBe(3);

    // Prontuário e NPS passam a ser aceitos.
    const record = await app.inject({
      method: "POST",
      url: "/clinical-records",
      headers,
      payload: {
        appointmentId: ids[0],
        subjective: "Relato",
        objective: "Exame",
        assessment: "Avaliação",
        plan: "Plano",
      },
    });
    expect(record.statusCode).toBe(201);
    expect(record.json()).toMatchObject({ patientId });
    const survey = await app.inject({
      method: "POST",
      url: "/satisfaction",
      headers,
      payload: { patientId, appointmentId: ids[0], score: 9 },
    });
    expect(survey.statusCode).toBe(201);
    await app.close();
  });

  it("moves the lead appointments to the reused client on conversion", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const existing = patients.json()[0] as { id: string; fullName: string; phone: string };
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Nome do lead diferente",
        phone: existing.phone,
        source: "Indicação",
        interest: "Fisioterapia",
      },
    });
    const leadId = lead.json().id as string;
    const appointment = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: {
        professionalId: professionals.json()[0].id,
        roomId: rooms.json()[0].id,
        serviceId: services.json()[0].id,
        startsAt: "2031-05-06T13:00:00.000Z",
        visitType: "evaluation",
      },
    });
    expect(appointment.statusCode).toBe(201);

    const conversion = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/convert`,
      headers,
    });
    expect(conversion.json()).toMatchObject({
      reusedExisting: true,
      patient: { id: existing.id },
    });
    const agenda = await app.inject({
      method: "GET",
      url: "/appointments?from=2031-05-06T00:00:00.000Z&to=2031-05-07T00:00:00.000Z",
      headers,
    });
    const moved = (agenda.json() as Appointment[]).find(
      (item) => item.id === appointment.json().id,
    );
    expect(moved).toMatchObject({
      patientId: existing.id,
      patientName: existing.fullName,
      visitType: "evaluation",
    });
    expect(moved).not.toHaveProperty("leadId");
    expect(moved).not.toHaveProperty("leadName");
    const timeline = await app.inject({
      method: "GET",
      url: `/patients/${existing.id}/timeline`,
      headers,
    });
    expect(JSON.stringify(timeline.json())).toContain(appointment.json().id);
    await app.close();
  });

  it("versions and finalizes a complete clinical record", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const appointments = (
      await app.inject({
        method: "GET",
        url: `/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        headers,
      })
    ).json();

    const draft = await app.inject({
      method: "POST",
      url: "/clinical-records",
      headers,
      payload: {
        appointmentId: appointments[0].id,
        subjective: "Cliente relata redução da dor.",
        objective: "Amplitude de movimento em evolução.",
        assessment: "Resposta positiva ao tratamento.",
        plan: "Manter exercícios e progressão de carga.",
        painScale: 3,
      },
    });
    expect(draft.statusCode).toBe(201);
    const draftBody = draft.json<{
      id: string;
      appointmentId: string;
      objective: string;
      assessment: string;
      plan: string;
      painScale?: number;
    }>();
    expect(draftBody).toMatchObject({ status: "draft", version: 1 });
    const professionals = (
      await app.inject({ method: "GET", url: "/professionals", headers })
    ).json<Array<{ id: string; crefito: string }>>();
    const professional = professionals.find(
      (item) => item.id === appointments[0].professionalId,
    );
    expect(professional?.crefito).toBeTruthy();
    expect(draft.json()).toMatchObject({
      professionalCrefito: professional!.crefito,
    });
    const listed = (
      await app.inject({ method: "GET", url: "/clinical-records", headers })
    ).json<Array<{ id: string; professionalCrefito: string }>>();
    expect(
      listed.find((item) => item.id === draftBody.id)?.professionalCrefito,
    ).toBe(professional!.crefito);

    const finalized = await app.inject({
      method: "POST",
      url: `/clinical-records/${draftBody.id}/finalize`,
      headers,
    });
    expect(finalized.json()).toMatchObject({ status: "finalized", version: 2 });

    const editAfterFinalize = await app.inject({
      method: "POST",
      url: "/clinical-records",
      headers,
      payload: {
        appointmentId: draftBody.appointmentId,
        subjective: "Tentativa de alteração",
        objective: draftBody.objective,
        assessment: draftBody.assessment,
        plan: draftBody.plan,
        painScale: draftBody.painScale,
      },
    });
    expect(editAfterFinalize.statusCode).toBe(409);

    const revisions = await app.inject({
      method: "GET",
      url: `/clinical-records/${draftBody.id}/revisions`,
      headers,
    });
    expect(revisions.json()).toHaveLength(2);
    await app.close();
  });

  it("denies clinical records to reception profiles", async () => {
    const app = await buildApp({
      repository: new MemoryClinicRepository(),
      logger: false,
    });
    await seedRoleUsers(app);
    const token = app.jwt.sign({
      sub: roleSub(app, "reception"),
      clinicId: "11111111-1111-4111-8111-111111111111",
      role: "user",
    });
    const response = await app.inject({
      method: "GET",
      url: "/clinical-records",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "CLINICAL_ACCESS_DENIED" });
    await app.close();
  });

  it("creates installments and consumes a session exactly once", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const appointments = await app.inject({
      method: "GET",
      url: `/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      headers,
    });
    const appointment = appointments.json()[0];
    const service = services
      .json()
      .find((item: { id: string }) => item.id === appointment.serviceId);
    const patient = patients
      .json()
      .find((item: { id: string }) => item.id === appointment.patientId);
    const date = appointment.startsAt.slice(0, 10);
    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        patientId: patient.id,
        serviceId: service.id,
        name: "Pacote teste",
        kind: "fixed_package",
        totalSessions: 5,
        validFrom: date,
        totalValueInCents: 10001,
        installments: 3,
        firstDueDate: date,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ remainingSessions: 5 });

    const financial = await app.inject({
      method: "GET",
      url: "/finance/summary",
      headers,
    });
    expect(financial.json().receivables).toHaveLength(3);
    expect(
      financial
        .json()
        .receivables.reduce(
          (sum: number, item: { amountInCents: number }) =>
            sum + item.amountInCents,
          0,
        ),
    ).toBe(10001);

    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointment.id}/status`,
      headers,
      payload: { status: "completed" },
    });
    let plans = await app.inject({ method: "GET", url: "/plans", headers });
    expect(plans.json()[0].remainingSessions).toBe(4);

    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointment.id}/status`,
      headers,
      payload: { status: "confirmed" },
    });
    plans = await app.inject({ method: "GET", url: "/plans", headers });
    expect(plans.json()[0].remainingSessions).toBe(5);

    const receivableId = financial.json().receivables[0].id;
    const paid = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivableId}/pay`,
      headers,
    });
    expect(paid.json().status).toBe("paid");
    const reversed = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivableId}/reverse`,
      headers,
    });
    expect(reversed.json().status).toBe("open");
    await app.inject({
      method: "PATCH",
      url: `/plans/${created.json().id}/status`,
      headers,
      payload: { status: "cancelled" },
    });
    const afterCancellation = await app.inject({
      method: "GET",
      url: "/finance/summary",
      headers,
    });
    expect(
      afterCancellation
        .json()
        .receivables.every(
          (item: { status: string }) => item.status === "cancelled",
        ),
    ).toBe(true);
    await app.close();
  });

  it("renews recurring plans automatically, catching up missed periods once", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const patientId = patients.json()[0].id as string;
    const serviceId = services.json()[0].id as string;
    const now = new Date();
    const monthStart = (offset: number) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
        .toISOString()
        .slice(0, 10);
    const monthEnd = (offset: number) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0))
        .toISOString()
        .slice(0, 10);
    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        patientId,
        serviceId,
        name: "Mensalidade Pilates",
        kind: "recurring",
        totalSessions: 8,
        validFrom: monthStart(-3),
        validUntil: monthEnd(-3),
        totalValueInCents: 40000,
        installments: 1,
        firstDueDate: monthStart(-3),
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().autoRenew).toBe(true);

    const listPlans = async () =>
      (
        await app.inject({
          method: "GET",
          url: `/plans?patientId=${patientId}`,
          headers,
        })
      ).json() as {
        id: string;
        status: string;
        validFrom: string;
        validUntil: string;
        remainingSessions: number;
        renewedFromPlanId?: string;
        renewedByPlanId?: string;
      }[];
    const plans = await listPlans();
    expect(plans.map((plan) => plan.validFrom).sort()).toEqual([
      monthStart(-3),
      monthStart(-2),
      monthStart(-1),
      monthStart(0),
    ]);
    const current = plans.find((plan) => plan.validFrom === monthStart(0))!;
    expect(current).toMatchObject({
      status: "active",
      validUntil: monthEnd(0),
      remainingSessions: 8,
    });
    expect(
      plans.filter((plan) => plan.status === "expired").map((plan) => plan.validFrom).sort(),
    ).toEqual([monthStart(-3), monthStart(-2), monthStart(-1)]);
    const original = plans.find((plan) => plan.id === created.json().id)!;
    expect(original.renewedByPlanId).toBeTruthy();
    expect(
      plans.find((plan) => plan.id === original.renewedByPlanId)!.renewedFromPlanId,
    ).toBe(original.id);

    expect(await listPlans()).toHaveLength(4);
    const receivables = (
      await app.inject({ method: "GET", url: "/finance/summary", headers })
    )
      .json()
      .receivables.filter((item: { patientId: string }) => item.patientId === patientId);
    expect(
      receivables.map((item: { dueDate: string }) => item.dueDate).sort(),
    ).toEqual([monthStart(-3), monthStart(-2), monthStart(-1), monthStart(0)]);

    const disabled = await app.inject({
      method: "PATCH",
      url: `/plans/${current.id}/auto-renew`,
      headers,
      payload: { autoRenew: false },
    });
    expect(disabled.json().autoRenew).toBe(false);
    await app.close();
  });

  it("renews a plan manually with new terms only once", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const payload = {
      patientId: patients.json()[0].id,
      serviceId: services.json()[0].id,
      name: "Pacote fisioterapia",
      kind: "fixed_package",
      totalSessions: 10,
      validFrom: "2026-01-01",
      totalValueInCents: 150000,
      installments: 2,
      firstDueDate: "2026-01-05",
    };
    const created = await app.inject({ method: "POST", url: "/plans", headers, payload });
    expect(created.json().autoRenew).toBe(false);
    const withoutEnd = await app.inject({
      method: "PATCH",
      url: `/plans/${created.json().id}/auto-renew`,
      headers,
      payload: { autoRenew: true },
    });
    expect(withoutEnd.statusCode).toBe(409);

    const renewal = {
      name: "Pacote fisioterapia",
      totalSessions: 12,
      validFrom: "2026-10-01",
      validUntil: "2026-12-31",
      totalValueInCents: 172000,
      installments: 3,
      firstDueDate: "2026-10-05",
    };
    const renewed = await app.inject({
      method: "POST",
      url: `/plans/${created.json().id}/renew`,
      headers,
      payload: renewal,
    });
    expect(renewed.statusCode).toBe(201);
    expect(renewed.json()).toMatchObject({
      kind: "fixed_package",
      remainingSessions: 12,
      totalValueInCents: 172000,
      renewedFromPlanId: created.json().id,
      autoRenew: false,
    });
    const again = await app.inject({
      method: "POST",
      url: `/plans/${created.json().id}/renew`,
      headers,
      payload: renewal,
    });
    expect(again.statusCode).toBe(409);
    const movements = await app.inject({
      method: "GET",
      url: `/plans/${renewed.json().id}/movements`,
      headers,
    });
    expect(movements.json()[0]).toMatchObject({
      kind: "credit",
      quantity: 12,
      reason: "Crédito da renovação do plano",
    });

    const other = await app.inject({ method: "POST", url: "/plans", headers, payload });
    await app.inject({
      method: "PATCH",
      url: `/plans/${other.json().id}/status`,
      headers,
      payload: { status: "cancelled" },
    });
    const cancelled = await app.inject({
      method: "POST",
      url: `/plans/${other.json().id}/renew`,
      headers,
      payload: renewal,
    });
    expect(cancelled.statusCode).toBe(409);
    await app.close();
  });

  it("moves and converts leads without duplicating patients", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const before = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const existing = before.json()[0];
    const created = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: existing.fullName,
        phone: existing.phone,
        source: "Indicação",
        interest: "Fisioterapia",
      },
    });
    expect(created.statusCode).toBe(201);
    const invalidLoss = await app.inject({
      method: "PATCH",
      url: `/leads/${created.json().id}/stage`,
      headers,
      payload: { stage: "lost" },
    });
    expect(invalidLoss.statusCode).toBe(400);
    const moved = await app.inject({
      method: "PATCH",
      url: `/leads/${created.json().id}/stage`,
      headers,
      payload: { stage: "contacted" },
    });
    expect(moved.json().stage).toBe("contacted");
    const conversion = await app.inject({
      method: "POST",
      url: `/leads/${created.json().id}/convert`,
      headers,
    });
    expect(conversion.json()).toMatchObject({
      reusedExisting: true,
      patient: { id: existing.id },
      lead: { stage: "won" },
    });
    const after = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    expect(after.json()).toHaveLength(before.json().length);
    await app.close();
  });

  it("respects opt-out and generates reminders idempotently", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const appointments = await app.inject({
      method: "GET",
      url: `/appointments?from=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`,
      headers,
    });
    const appointment = appointments.json()[0];
    const referenceDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date(appointment.startsAt));
    await app.inject({
      method: "PUT",
      url: "/communications/preferences",
      headers,
      payload: {
        patientId: appointment.patientId,
        channel: "whatsapp",
        allowed: false,
      },
    });
    const blocked = await app.inject({
      method: "POST",
      url: "/communications/messages",
      headers,
      payload: {
        patientId: appointment.patientId,
        channel: "whatsapp",
        body: "Mensagem administrativa",
      },
    });
    expect(blocked.statusCode).toBe(409);
    const skipped = await app.inject({
      method: "POST",
      url: "/communications/reminders/generate",
      headers,
      payload: { referenceDate },
    });
    expect(skipped.json().skippedByPreference).toBeGreaterThan(0);
    await app.inject({
      method: "PUT",
      url: "/communications/preferences",
      headers,
      payload: {
        patientId: appointment.patientId,
        channel: "whatsapp",
        allowed: true,
      },
    });
    const first = await app.inject({
      method: "POST",
      url: "/communications/reminders/generate",
      headers,
      payload: { referenceDate },
    });
    expect(first.json().queued).toBeGreaterThan(0);
    const second = await app.inject({
      method: "POST",
      url: "/communications/reminders/generate",
      headers,
      payload: { referenceDate },
    });
    expect(second.json().queued).toBe(0);
    expect(second.json().alreadyQueued).toBeGreaterThan(0);
    const center = await app.inject({
      method: "GET",
      url: "/communications",
      headers,
    });
    expect(center.json()).toMatchObject({ deliveryMode: "outbox_only" });
    expect(center.json().messages.length).toBeGreaterThan(0);
    await app.close();
  });

  it("sends WhatsApp messages to the dedicated number", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = await app.inject({ method: "GET", url: "/patients", headers });
    const patient = patients.json()[0];
    const updated = await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: {
        fullName: patient.fullName,
        phone: patient.phone,
        whatsapp: "(11) 90000-1234",
        email: "contato@example.com",
        tags: patient.tags,
      },
    });
    expect(updated.json().whatsapp).toBe("11900001234");
    const sent = await app.inject({
      method: "POST",
      url: "/communications/messages",
      headers,
      payload: { patientId: patient.id, channel: "whatsapp", body: "Olá" },
    });
    expect(sent.json().recipient).toBe("11900001234");
    const byEmail = await app.inject({
      method: "POST",
      url: "/communications/messages",
      headers,
      payload: { patientId: patient.id, channel: "email", body: "Olá" },
    });
    expect(byEmail.json().recipient).toBe("contato@example.com");
    const withoutWhatsapp = await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: { fullName: patient.fullName, phone: patient.phone, whatsapp: "", tags: patient.tags },
    });
    expect(withoutWhatsapp.json().whatsapp).toBe("");
    const fallback = await app.inject({
      method: "POST",
      url: "/communications/messages",
      headers,
      payload: { patientId: patient.id, channel: "whatsapp", body: "Olá de novo" },
    });
    expect(fallback.json().recipient).toBe(patient.phone);
    await app.close();
  });

  it("versions templates without changing issued document snapshots", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const patient = patients.json()[0];
    const template = await app.inject({
      method: "POST",
      url: "/document-templates",
      headers,
      payload: {
        name: "Contrato de teste",
        kind: "contract",
        body: "Versão original para {{paciente_nome}} em {{data_emissao}}.",
      },
    });
    expect(template.statusCode).toBe(201);
    expect(template.json()).toMatchObject({ version: 1, active: true });
    const document = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        templateId: template.json().id,
        patientId: patient.id,
        title: "Contrato preservado",
      },
    });
    expect(document.statusCode).toBe(201);
    expect(document.json().snapshotBody).toContain("Versão original");
    expect(document.json().snapshotBody).toContain(patient.fullName);
    const nextVersion = await app.inject({
      method: "POST",
      url: `/document-templates/${template.json().id}/versions`,
      headers,
      payload: { body: "Nova versão do contrato para {{paciente_nome}}." },
    });
    expect(nextVersion.json()).toMatchObject({ version: 2, active: true });
    const documents = await app.inject({
      method: "GET",
      url: "/documents",
      headers,
    });
    expect(documents.json()[0].snapshotBody).toContain("Versão original");
    const issued = await app.inject({
      method: "PATCH",
      url: `/documents/${document.json().id}/status`,
      headers,
      payload: { status: "issued" },
    });
    expect(issued.json()).toMatchObject({ status: "issued" });
    const cancelled = await app.inject({
      method: "PATCH",
      url: `/documents/${document.json().id}/status`,
      headers,
      payload: { status: "cancelled" },
    });
    expect(cancelled.json()).toMatchObject({ status: "cancelled" });
    const invalidTransition = await app.inject({
      method: "PATCH",
      url: `/documents/${document.json().id}/status`,
      headers,
      payload: { status: "issued" },
    });
    expect(invalidTransition.statusCode).toBe(409);
    await app.close();
  });

  it("fills professional variables when issuing a document", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
    ]);
    const patient = patients.json()[0];
    const professional = professionals.json()[0];
    const template = await app.inject({
      method: "POST",
      url: "/document-templates",
      headers,
      payload: {
        name: "Declaração assinada",
        kind: "attendance_declaration",
        body: "Declaro que {{paciente_nome}} foi atendido por [{{profissional_nome}}] [{{profissional_crefito}}].",
      },
    });
    expect(template.statusCode).toBe(201);
    const withProfessional = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        templateId: template.json().id,
        patientId: patient.id,
        professionalId: professional.id,
        title: "Declaração com profissional",
      },
    });
    expect(withProfessional.statusCode).toBe(201);
    expect(withProfessional.json()).toMatchObject({
      professionalId: professional.id,
    });
    expect(withProfessional.json().snapshotBody).toContain(
      `[${professional.fullName}] [${professional.crefito}]`,
    );
    const withoutProfessional = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        templateId: template.json().id,
        patientId: patient.id,
        title: "Declaração sem profissional",
      },
    });
    expect(withoutProfessional.statusCode).toBe(201);
    expect(withoutProfessional.json().snapshotBody).toContain("[] []");
    expect(withoutProfessional.json().snapshotBody).not.toContain("{{");
    const unknownProfessional = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        templateId: template.json().id,
        patientId: patient.id,
        professionalId: "99999999-9999-4999-8999-999999999999",
        title: "Declaração inválida",
      },
    });
    expect(unknownProfessional.statusCode).toBe(404);
    expect(unknownProfessional.json()).toMatchObject({
      code: "PROFESSIONAL_NOT_FOUND",
    });
    await app.close();
  });

  it("returns reproducible management metrics and an authenticated CSV", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const report = await app.inject({
      method: "GET",
      url: `/reports/management?from=${date}&to=${date}`,
      headers,
    });
    expect(report.statusCode).toBe(200);
    expect(report.json()).toMatchObject({ from: date, to: date });
    expect(report.json().appointments.total).toBeGreaterThan(0);
    expect(report.json().byProfessional.length).toBeGreaterThan(0);
    const csv = await app.inject({
      method: "GET",
      url: `/reports/management.csv?from=${date}&to=${date}`,
      headers,
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("atendimentos");
    await seedRoleUsers(app);
    const receptionToken = app.jwt.sign({
      sub: roleSub(app, "reception"),
      clinicId: "11111111-1111-4111-8111-111111111111",
      role: "user",
    });
    const denied = await app.inject({
      method: "GET",
      url: `/reports/management?from=${date}&to=${date}`,
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(denied.statusCode).toBe(403);
    const month = date.slice(0, 7);
    const sales = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers,
    });
    expect(sales.statusCode).toBe(200);
    expect(sales.json()).toMatchObject({ month, current: { from: `${month}-01` } });
    const xlsx = await app.inject({
      method: "GET",
      url: `/reports/sales.xlsx?month=${month}`,
      headers,
    });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(xlsx.headers["content-disposition"]).toContain(`vendas-${month}.xlsx`);
    const salesWorkbook = new ExcelJS.Workbook();
    await salesWorkbook.xlsx.load(xlsx.rawPayload as unknown as ExcelJS.Buffer);
    expect(salesWorkbook.creator).toBe("Studios Aryana");
    const deniedSales = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(deniedSales.statusCode).toBe(403);
    await app.close();
  });

  it("creates recurring appointments atomically and enforces schedule blocks", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const start = new Date();
    start.setDate(start.getDate() + 30);
    start.setHours(15, 0, 0, 0);
    const input = {
      patientId: patients.json()[0].id,
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
      startsAt: start.toISOString(),
      occurrences: 3,
      intervalWeeks: 1,
    };
    const recurring = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: input,
    });
    expect(recurring.statusCode).toBe(201);
    expect(recurring.json()).toHaveLength(3);
    expect(
      new Set(recurring.json().map((item: Appointment) => item.seriesId)).size,
    ).toBe(1);

    const blockedStart = new Date(start);
    blockedStart.setHours(18, 0, 0, 0);
    const blockedEnd = new Date(blockedStart);
    blockedEnd.setHours(19, 0, 0, 0);
    const block = await app.inject({
      method: "POST",
      url: "/schedule-blocks",
      headers,
      payload: {
        professionalId: input.professionalId,
        startsAt: blockedStart.toISOString(),
        endsAt: blockedEnd.toISOString(),
        reason: "Reunião de equipe",
      },
    });
    expect(block.statusCode).toBe(201);
    const conflicting = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...input, startsAt: blockedStart.toISOString() },
    });
    expect(conflicting.statusCode).toBe(409);
    await app.inject({
      method: "POST",
      url: `/schedule-blocks/${block.json().id}/cancel`,
      headers,
    });
    const afterCancellation = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...input, startsAt: blockedStart.toISOString() },
    });
    expect(afterCancellation.statusCode).toBe(201);
    await app.close();
  });

  it("tracks lead contacts, owners, tags and overdue tasks", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const ownerId = "22222222-2222-4222-8222-222222222222";
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Contato Comercial",
        phone: "11999990000",
        source: "Instagram",
        interest: "Pilates",
        responsibleUserId: ownerId,
        tags: ["Prioridade", "Pilates"],
      },
    });
    expect(lead.statusCode).toBe(201);
    expect(lead.json()).toMatchObject({
      responsibleName: "Aryana Dutra",
      tags: ["Prioridade", "Pilates"],
    });
    const contact = await app.inject({
      method: "POST",
      url: `/leads/${lead.json().id}/contacts`,
      headers,
      payload: {
        channel: "whatsapp",
        direction: "outbound",
        notes: "Apresentação enviada e avaliação explicada.",
      },
    });
    expect(contact.statusCode).toBe(201);
    expect(contact.json()).toMatchObject({ actorName: "Aryana Dutra" });
    const task = await app.inject({
      method: "POST",
      url: `/leads/${lead.json().id}/tasks`,
      headers,
      payload: {
        title: "Retornar contato",
        dueAt: new Date(Date.now() - 60_000).toISOString(),
        assignedUserId: ownerId,
      },
    });
    expect(task.statusCode).toBe(201);
    let leads = await app.inject({ method: "GET", url: "/leads", headers });
    const withTask = leads
      .json()
      .find((item: Lead) => item.id === lead.json().id);
    expect(withTask).toMatchObject({ openTasks: 1, overdueTasks: 1 });
    const activity = await app.inject({
      method: "GET",
      url: `/leads/${lead.json().id}/activity`,
      headers,
    });
    expect(activity.json().contacts).toHaveLength(1);
    expect(activity.json().tasks).toHaveLength(1);
    await app.inject({
      method: "PATCH",
      url: `/lead-tasks/${task.json().id}/status`,
      headers,
      payload: { status: "completed" },
    });
    leads = await app.inject({ method: "GET", url: "/leads", headers });
    expect(
      leads.json().find((item: Lead) => item.id === lead.json().id),
    ).toMatchObject({ openTasks: 0, overdueTasks: 0 });
    await app.close();
  });

  it("operates receivables, payables, receipts and monthly cash flow", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patientsResponse, servicesResponse] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const patient = patientsResponse.json()[0];
    const service = servicesResponse.json()[0];
    const date = new Date().toISOString().slice(0, 10);

    const plan = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        patientId: patient.id,
        serviceId: service.id,
        name: "Plano financeiro",
        kind: "fixed_package",
        totalSessions: 1,
        validFrom: date,
        totalValueInCents: 12_000,
        installments: 1,
        firstDueDate: date,
      },
    });
    expect(plan.statusCode).toBe(201);

    let workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const receivableId = workspace.json().summary.receivables[0].id;
    const adjusted = await app.inject({
      method: "PATCH",
      url: `/finance/receivables/${receivableId}/adjust`,
      headers,
      payload: {
        amountInCents: 11_500,
        reason: "Desconto comercial autorizado",
      },
    });
    expect(adjusted.json()).toMatchObject({
      amountInCents: 11_500,
      status: "open",
    });
    const received = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivableId}/pay`,
      headers,
      payload: { paymentMethod: "card" },
    });
    expect(received.json()).toMatchObject({
      status: "paid",
      paymentMethod: "card",
    });
    const receipt = await app.inject({
      method: "GET",
      url: `/finance/receivables/${receivableId}/receipt`,
      headers,
    });
    expect(receipt.statusCode).toBe(200);
    expect(receipt.json()).toMatchObject({
      patientName: patient.fullName,
      amountInCents: 11_500,
      paymentMethod: "card",
    });

    const category = workspace
      .json()
      .categories.find((item: { kind: string }) => item.kind === "expense");
    const costCenter = workspace.json().costCenters[0];
    const payable = await app.inject({
      method: "POST",
      url: "/finance/payables",
      headers,
      payload: {
        description: "Aluguel da unidade",
        supplier: "Imobiliária Centro",
        categoryId: category.id,
        costCenterId: costCenter.id,
        dueDate: date,
        amountInCents: 4_000,
      },
    });
    expect(payable.statusCode).toBe(201);
    const expense = await app.inject({
      method: "POST",
      url: `/finance/payables/${payable.json().id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    expect(expense.json()).toMatchObject({
      status: "paid",
      paymentMethod: "pix",
    });

    workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(workspace.json()).toMatchObject({
      paidExpensesThisMonthInCents: 4_000,
      cashBalanceThisMonthInCents: 7_500,
    });

    const reversed = await app.inject({
      method: "POST",
      url: `/finance/payables/${payable.json().id}/reverse`,
      headers,
    });
    expect(reversed.json()).toMatchObject({ status: "open" });
    await app.close();
  });

  it("reports the daily cash by payment method on the clinic day", async () => {
    const { app, token } = await authenticatedApp();
    const setupHeaders = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms, workspace] =
      await Promise.all([
        app.inject({ method: "GET", url: "/patients", headers: setupHeaders }),
        app.inject({ method: "GET", url: "/services", headers: setupHeaders }),
        app.inject({ method: "GET", url: "/professionals", headers: setupHeaders }),
        app.inject({ method: "GET", url: "/rooms", headers: setupHeaders }),
        app.inject({ method: "GET", url: "/finance/workspace", headers: setupHeaders }),
      ]);
    const clinicId = "11111111-1111-4111-8111-111111111111";
    await seedRoleUsers(app);
    const headersAs = (role: UserRole = "owner") => ({
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
    });
    const at = (iso: string) => vi.setSystemTime(new Date(iso));
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // 12h de São Paulo em 10/03/2031.
      at("2031-03-10T15:00:00.000Z");
      const headers = headersAs();
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: {
          patientId: patients.json()[0].id,
          serviceId: services.json()[0].id,
          name: "Plano do caixa",
          kind: "fixed_package",
          totalSessions: 1,
          validFrom: "2031-03-10",
          totalValueInCents: 12_000,
          installments: 1,
          firstDueDate: "2031-03-10",
        },
      });
      expect(plan.statusCode).toBe(201);
      const receivable = (
        await app.inject({ method: "GET", url: "/finance/workspace", headers })
      )
        .json()
        .summary.receivables.find(
          (item: { planId?: string }) => item.planId === plan.json().id,
        );
      const paid = await app.inject({
        method: "POST",
        url: `/finance/receivables/${receivable.id}/pay`,
        headers,
        payload: { paymentMethod: "card" },
      });
      expect(paid.statusCode).toBe(200);

      at("2031-03-10T16:00:00.000Z");
      const payable = await app.inject({
        method: "POST",
        url: "/finance/payables",
        headers,
        payload: {
          description: "Material de limpeza",
          supplier: "Mercado Central",
          categoryId: workspace
            .json()
            .categories.find((item: { kind: string }) => item.kind === "expense").id,
          costCenterId: workspace.json().costCenters[0].id,
          dueDate: "2031-03-10",
          amountInCents: 4_000,
        },
      });
      expect(payable.statusCode).toBe(201);
      await app.inject({
        method: "POST",
        url: `/finance/payables/${payable.json().id}/pay`,
        headers,
        payload: { paymentMethod: "pix" },
      });

      const appointment = await app.inject({
        method: "POST",
        url: "/appointments",
        headers,
        payload: {
          patientId: patients.json()[0].id,
          professionalId: professionals.json()[0].id,
          roomId: rooms.json()[0].id,
          serviceId: services.json()[0].id,
          startsAt: "2031-03-10T13:00:00.000Z",
        },
      });
      expect(appointment.statusCode).toBe(201);
      await app.inject({
        method: "PATCH",
        url: `/appointments/${appointment.json().id}/status`,
        headers,
        payload: { status: "completed" },
      });
      await app.inject({
        method: "POST",
        url: "/finance/commission-rules",
        headers,
        payload: {
          professionalId: professionals.json()[0].id,
          percentage: 30,
          effectiveFrom: "2031-03-01",
        },
      });
      const commissions = await app.inject({
        method: "POST",
        url: "/finance/commissions/generate",
        headers,
        payload: { competence: "2031-03" },
      });
      expect(commissions.json()).toHaveLength(1);
      const commission = commissions.json()[0];

      // 23h30 de São Paulo, ainda 10/03 (já 11/03 em UTC): estorno e comissão.
      at("2031-03-11T02:30:00.000Z");
      const reversed = await app.inject({
        method: "POST",
        url: `/finance/receivables/${receivable.id}/reverse`,
        headers,
      });
      expect(reversed.statusCode).toBe(200);
      at("2031-03-11T02:40:00.000Z");
      const commissionPaid = await app.inject({
        method: "POST",
        url: `/finance/commissions/${commission.id}/pay`,
        headers,
      });
      expect(commissionPaid.statusCode).toBe(200);

      // Sem data: vale o dia de hoje na clínica (ainda 10/03).
      const today = await app.inject({
        method: "GET",
        url: "/finance/daily-cash",
        headers,
      });
      expect(today.statusCode).toBe(200);
      const explicit = await app.inject({
        method: "GET",
        url: "/finance/daily-cash?date=2031-03-10",
        headers: headersAs("finance"),
      });
      expect(explicit.statusCode).toBe(200);
      expect(explicit.json()).toEqual(today.json());
      const cash = today.json();
      expect(cash).toMatchObject({
        date: "2031-03-10",
        totalInflowInCents: 0,
        totalOutflowInCents: 4_000 + commission.amountInCents,
        balanceInCents: -(4_000 + commission.amountInCents),
      });
      expect(cash.byPaymentMethod).toEqual([
        {
          paymentMethod: "pix",
          inflowInCents: 0,
          outflowInCents: 4_000,
          balanceInCents: -4_000,
        },
        {
          paymentMethod: "card",
          inflowInCents: 0,
          outflowInCents: 0,
          balanceInCents: 0,
        },
        {
          paymentMethod: "unspecified",
          inflowInCents: 0,
          outflowInCents: commission.amountInCents,
          balanceInCents: -commission.amountInCents,
        },
      ]);
      expect(
        cash.movements.map((item: { kind: string; amountInCents: number }) => [
          item.kind,
          item.amountInCents,
        ]),
      ).toEqual([
        ["receipt", 12_000],
        ["payable", 4_000],
        ["receipt_reversal", -12_000],
        ["commission", commission.amountInCents],
      ]);
      expect(cash.movements[2]).toMatchObject({
        occurredAt: "2031-03-11T02:30:00.000Z",
        paymentMethod: "card",
        direction: "in",
      });

      const nextDay = await app.inject({
        method: "GET",
        url: "/finance/daily-cash?date=2031-03-11",
        headers,
      });
      expect(nextDay.json()).toMatchObject({
        date: "2031-03-11",
        byPaymentMethod: [],
        totalInflowInCents: 0,
        totalOutflowInCents: 0,
        balanceInCents: 0,
        movements: [],
      });

      const invalid = await app.inject({
        method: "GET",
        url: "/finance/daily-cash?date=2031-02-30",
        headers,
      });
      expect(invalid.statusCode).toBe(400);
      const denied = await app.inject({
        method: "GET",
        url: "/finance/daily-cash",
        headers: headersAs("reception"),
      });
      expect(denied.statusCode).toBe(403);
    } finally {
      vi.useRealTimers();
    }
    await app.close();
  });

  it("forecasts confirmed and projected cash flow by month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 12h de São Paulo em 10/12/2031: o horizonte de 3 meses vira o ano.
    vi.setSystemTime(new Date("2031-12-10T15:00:00.000Z"));
    try {
      const { app } = await authenticatedApp();
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const headersAs = (role: UserRole = "owner") => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const headers = headersAs();
      const forecast = async (query = "?months=3") => {
        const response = await app.inject({
          method: "GET",
          url: `/finance/forecast${query}`,
          headers,
        });
        expect(response.statusCode).toBe(200);
        return response.json();
      };
      // Os dados demo também entram: compara-se a diferença.
      const before = await forecast();
      expect(before).toMatchObject({ startMonth: "2031-12", endMonth: "2032-02" });
      expect(before.months.map((item: { month: string }) => item.month)).toEqual([
        "2031-12",
        "2032-01",
        "2032-02",
      ]);

      const [patients, services, workspace] = await Promise.all([
        app.inject({ method: "GET", url: "/patients", headers }),
        app.inject({ method: "GET", url: "/services", headers }),
        app.inject({ method: "GET", url: "/finance/workspace", headers }),
      ]);
      const planBase = {
        patientId: patients.json()[0].id,
        serviceId: services.json()[0].id,
        kind: "fixed_package",
        totalSessions: 4,
        validFrom: "2031-12-01",
        validUntil: "2031-12-31",
        totalValueInCents: 12_000,
        installments: 2,
        firstDueDate: "2031-12-15",
      };
      const created = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: { ...planBase, name: "Plano mensal renovável", autoRenew: true },
      });
      expect(created.statusCode).toBe(201);
      const withoutRenewal = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: { ...planBase, name: "Plano sem renovação", autoRenew: false },
      });
      expect(withoutRenewal.statusCode).toBe(201);
      const cancelled = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: { ...planBase, name: "Plano cancelado", autoRenew: true },
      });
      await app.inject({
        method: "PATCH",
        url: `/plans/${cancelled.json().id}/status`,
        headers,
        payload: { status: "cancelled" },
      });
      const expense = {
        description: "Aluguel da sala",
        categoryId: workspace
          .json()
          .categories.find((item: { kind: string }) => item.kind === "expense").id,
        costCenterId: workspace.json().costCenters[0].id,
        amountInCents: 1_000,
        dayOfMonth: 5,
        startMonth: "2031-11",
      };
      for (const payload of [
        expense,
        { ...expense, amountInCents: 9_000, active: false },
        { ...expense, amountInCents: 500, endMonth: "2031-12" },
      ]) {
        const response = await app.inject({
          method: "POST",
          url: "/finance/recurring-payables",
          headers,
          payload,
        });
        expect(response.statusCode).toBe(201);
      }

      const after = await forecast();
      const delta = (
        month: number,
        part: "confirmed" | "projected",
        field: "inflowInCents" | "outflowInCents",
      ) => after.months[month][part][field] - before.months[month][part][field];
      // Plano em 2 parcelas: dez e jan confirmados; renovações em jan e fev projetadas.
      expect([0, 1, 2].map((m) => delta(m, "confirmed", "inflowInCents"))).toEqual([
        6_000 + 6_000,
        6_000 + 6_000,
        0,
      ]);
      expect([0, 1, 2].map((m) => delta(m, "projected", "inflowInCents"))).toEqual([
        0,
        6_000,
        12_000,
      ]);
      // Despesas: nov (atrasada) e dez lançadas; jan e fev projetadas.
      expect([0, 1, 2].map((m) => delta(m, "confirmed", "outflowInCents"))).toEqual([
        1_000 + 500,
        0,
        0,
      ]);
      expect([0, 1, 2].map((m) => delta(m, "projected", "outflowInCents"))).toEqual([
        0,
        1_000,
        1_000,
      ]);
      expect(after.overdue.outflowInCents - before.overdue.outflowInCents).toBe(
        1_000 + 500,
      );
      expect(after.totals.balanceInCents - before.totals.balanceInCents).toBe(
        24_000 + 18_000 - 1_500 - 2_000,
      );
      for (const month of after.months)
        expect(month.balanceInCents).toBe(
          month.confirmed.balanceInCents + month.projected.balanceInCents,
        );

      // Consultar de novo não duplica nada (renovação e competências já lançadas).
      expect(await forecast()).toEqual({ ...after, generatedAt: expect.any(String) });

      const standard = await forecast("");
      expect(standard.months).toHaveLength(6);
      expect(standard.endMonth).toBe("2032-05");
      for (const query of ["?months=0", "?months=13", "?months=abc", "?months=2.5"]) {
        const invalid = await app.inject({
          method: "GET",
          url: `/finance/forecast${query}`,
          headers,
        });
        expect(invalid.statusCode).toBe(400);
      }
      const finance = await app.inject({
        method: "GET",
        url: "/finance/forecast",
        headers: headersAs("finance"),
      });
      expect(finance.statusCode).toBe(200);
      const denied = await app.inject({
        method: "GET",
        url: "/finance/forecast",
        headers: headersAs("reception"),
      });
      expect(denied.statusCode).toBe(403);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports client retention and plan cancellations by month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 12h de São Paulo em 15/03/2033.
    vi.setSystemTime(new Date("2033-03-15T15:00:00.000Z"));
    try {
      const { app } = await authenticatedApp();
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const headersAs = (role: UserRole = "owner") => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const headers = headersAs();
      type Month = {
        month: string;
        activeClients: number;
        newClients: number;
        lostClients: number;
        cancelledPlans: number;
        cancelledValueInCents: number;
      };
      const retention = async (query = "?from=2033-01-01&to=2033-03-31") => {
        const response = await app.inject({
          method: "GET",
          url: `/reports/retention${query}`,
          headers,
        });
        expect(response.statusCode).toBe(200);
        return response.json() as {
          from: string;
          to: string;
          startMonth: string;
          endMonth: string;
          months: Month[];
        };
      };
      // Os dados demo também entram: compara-se a diferença.
      const before = await retention();
      expect(before).toMatchObject({
        from: "2033-01-01",
        to: "2033-03-31",
        startMonth: "2033-01",
        endMonth: "2033-03",
      });
      expect(before.months.map((item) => item.month)).toEqual([
        "2033-01",
        "2033-02",
        "2033-03",
      ]);

      const services = await app.inject({ method: "GET", url: "/services", headers });
      const createPatient = async (fullName: string, phone: string) => {
        const response = await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload: { fullName, phone, tags: [] },
        });
        expect(response.statusCode).toBe(201);
        return response.json().id as string;
      };
      const createPlan = async (
        patientId: string,
        validFrom: string,
        validUntil?: string,
      ) => {
        const response = await app.inject({
          method: "POST",
          url: "/plans",
          headers,
          payload: {
            patientId,
            serviceId: services.json()[0].id,
            kind: "fixed_package",
            name: "Plano de retenção",
            totalSessions: 4,
            validFrom,
            ...(validUntil ? { validUntil } : {}),
            totalValueInCents: 12_000,
            installments: 2,
            firstDueDate: validFrom,
          },
        });
        expect(response.statusCode).toBe(201);
        return response.json().id as string;
      };
      // Plano só em fevereiro: novo e ativo em fevereiro, perdido em março.
      await createPlan(
        await createPatient("Retenção Fevereiro", "11955550001"),
        "2033-02-01",
        "2033-02-28",
      );
      // Plano de março cancelado em março, com as duas parcelas em aberto.
      const cancelledPlan = await createPlan(
        await createPatient("Retenção Março", "11955550002"),
        "2033-03-01",
      );
      const cancellation = await app.inject({
        method: "PATCH",
        url: `/plans/${cancelledPlan}/status`,
        headers,
        payload: { status: "cancelled" },
      });
      expect(cancellation.statusCode).toBe(200);

      const after = await retention();
      const delta = (month: string, key: keyof Omit<Month, "month">) =>
        after.months.find((item) => item.month === month)![key] -
        before.months.find((item) => item.month === month)![key];
      expect(delta("2033-01", "activeClients")).toBe(0);
      expect(delta("2033-02", "activeClients")).toBe(1);
      expect(delta("2033-02", "newClients")).toBe(1);
      expect(delta("2033-02", "lostClients")).toBe(0);
      expect(delta("2033-03", "activeClients")).toBe(1);
      expect(delta("2033-03", "newClients")).toBe(1);
      expect(delta("2033-03", "lostClients")).toBe(1);
      expect(delta("2033-03", "cancelledPlans")).toBe(1);
      expect(delta("2033-03", "cancelledValueInCents")).toBe(12_000);

      // Parâmetros vazios: até hoje, seis meses; meses futuros não entram.
      const defaults = await retention("?from=&to=");
      expect(defaults).toMatchObject({
        from: "2032-10-01",
        to: "2033-03-15",
        startMonth: "2032-10",
        endMonth: "2033-03",
      });
      expect(defaults.months).toHaveLength(6);
      const future = await retention("?from=2033-02-01&to=2033-08-31");
      expect(future.endMonth).toBe("2033-03");
      expect(future.months).toHaveLength(2);

      for (const query of [
        "?from=abc",
        "?from=2033-03-01&to=2033-02-01",
        "?from=2033-04-01",
        "?from=2031-01-01&to=2033-03-01",
      ]) {
        const invalid = await app.inject({
          method: "GET",
          url: `/reports/retention${query}`,
          headers,
        });
        expect(invalid.statusCode).toBe(400);
      }
      const finance = await app.inject({
        method: "GET",
        url: "/reports/retention",
        headers: headersAs("finance"),
      });
      expect(finance.statusCode).toBe(200);
      for (const role of ["reception", "physiotherapist"] as const) {
        const denied = await app.inject({
          method: "GET",
          url: "/reports/retention",
          headers: headersAs(role),
        });
        expect(denied.statusCode).toBe(403);
      }
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports client rankings and the age distribution of active clients", async () => {
    // Os dados demo são montados na data real; o período do teste fica longe deles.
    const { app } = await authenticatedApp();
    vi.useFakeTimers({ toFake: ["Date"] });
    // 12h de São Paulo de quarta, 17/05/2034.
    vi.setSystemTime(new Date("2034-05-17T15:00:00.000Z"));
    try {
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const headersAs = (role: UserRole = "owner") => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const headers = headersAs();
      type Report = {
        from: string;
        to: string;
        topBySessions: { patientId: string; completedSessions: number }[];
        topByRevenue: { patientId: string; receivedInCents: number }[];
        activeClients: number;
        ageDistribution: { band: string; clients: number }[];
      };
      const clientsReport = async (query = "?from=2034-05-01&to=2034-05-31") => {
        const response = await app.inject({
          method: "GET",
          url: `/reports/clients${query}`,
          headers,
        });
        expect(response.statusCode).toBe(200);
        return response.json() as Report;
      };
      // Os dados demo (planos em aberto) também entram: compara-se a diferença.
      const before = await clientsReport();
      expect(before).toMatchObject({ from: "2034-05-01", to: "2034-05-31" });

      const [services, professionals, rooms] = await Promise.all([
        app.inject({ method: "GET", url: "/services", headers }),
        app.inject({ method: "GET", url: "/professionals", headers }),
        app.inject({ method: "GET", url: "/rooms", headers }),
      ]);
      const createPatient = async (fullName: string, phone: string, birthDate: string) => {
        const response = await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload: { fullName, phone, birthDate, tags: [] },
        });
        expect(response.statusCode).toBe(201);
        return response.json().id as string;
      };
      const completedVisit = async (patientId: string, startsAt: string) => {
        const created = await app.inject({
          method: "POST",
          url: "/appointments",
          headers,
          payload: {
            patientId,
            professionalId: professionals.json()[0].id,
            roomId: rooms.json()[0].id,
            serviceId: services.json()[0].id,
            startsAt,
          },
        });
        expect(created.statusCode).toBe(201);
        const completed = await app.inject({
          method: "PATCH",
          url: `/appointments/${created.json().id}/status`,
          headers,
          payload: { status: "completed" },
        });
        expect(completed.statusCode).toBe(200);
      };
      const paidPlan = async (patientId: string) => {
        const plan = await app.inject({
          method: "POST",
          url: "/plans",
          headers,
          payload: {
            patientId,
            serviceId: services.json()[0].id,
            kind: "fixed_package",
            name: "Plano do ranking",
            totalSessions: 4,
            validFrom: "2034-05-01",
            totalValueInCents: 12_000,
            installments: 1,
            firstDueDate: "2034-05-10",
          },
        });
        expect(plan.statusCode).toBe(201);
        const receivable = (
          await app.inject({ method: "GET", url: "/finance/workspace", headers })
        )
          .json()
          .summary.receivables.find(
            (item: { planId?: string }) => item.planId === plan.json().id,
          );
        const paid = await app.inject({
          method: "POST",
          url: `/finance/receivables/${receivable.id}/pay`,
          headers,
          payload: { paymentMethod: "pix" },
        });
        expect(paid.statusCode).toBe(200);
        return receivable.id as string;
      };

      // 44 anos em 31/05/2034 (faz 45 só em 01/06); duas sessões; pago e estornado.
      const adult = await createPatient("Ranking Adulto", "11955560001", "1989-06-01");
      // Sem data de nascimento; uma sessão; pago.
      const noDate = await createPatient("Ranking Sem Data", "11955560002", "");
      await completedVisit(adult, "2034-05-15T13:00:00.000Z");
      await completedVisit(adult, "2034-05-16T13:00:00.000Z");
      await completedVisit(noDate, "2034-05-15T16:00:00.000Z");
      const reversedReceivable = await paidPlan(adult);
      await paidPlan(noDate);
      const reversed = await app.inject({
        method: "POST",
        url: `/finance/receivables/${reversedReceivable}/reverse`,
        headers,
      });
      expect(reversed.statusCode).toBe(200);

      const after = await clientsReport();
      const sessionsIndex = (patientId: string) =>
        after.topBySessions.findIndex((item) => item.patientId === patientId);
      expect(after.topBySessions[sessionsIndex(adult)]?.completedSessions).toBe(2);
      expect(after.topBySessions[sessionsIndex(noDate)]?.completedSessions).toBe(1);
      expect(sessionsIndex(adult)).toBeLessThan(sessionsIndex(noDate));
      expect(before.topBySessions).toEqual([]);
      expect(after.topBySessions.map((item) => item.patientId)).toEqual([adult, noDate]);
      expect(
        after.topByRevenue.find((item) => item.patientId === noDate)?.receivedInCents,
      ).toBe(12_000);
      expect(after.topByRevenue.some((item) => item.patientId === adult)).toBe(false);
      expect(after.activeClients - before.activeClients).toBe(2);
      const bandDelta = (band: string) =>
        after.ageDistribution.find((item) => item.band === band)!.clients -
        before.ageDistribution.find((item) => item.band === band)!.clients;
      expect(bandDelta("30-44")).toBe(1);
      expect(bandDelta("unknown")).toBe(1);
      expect(bandDelta("45-59")).toBe(0);

      // Fora do período: nada dos novos clientes nos rankings.
      const april = await clientsReport("?from=2034-04-01&to=2034-04-30");
      expect(april.topBySessions.some((item) => item.patientId === adult)).toBe(false);
      expect(april.topByRevenue.some((item) => item.patientId === noDate)).toBe(false);

      // Parâmetros vazios: até hoje, seis meses.
      expect(await clientsReport("?from=&to=")).toMatchObject({
        from: "2033-12-01",
        to: "2034-05-17",
      });
      for (const query of ["?from=abc", "?from=2034-06-01&to=2034-05-01"]) {
        const invalid = await app.inject({
          method: "GET",
          url: `/reports/clients${query}`,
          headers,
        });
        expect(invalid.statusCode).toBe(400);
      }
      const finance = await app.inject({
        method: "GET",
        url: "/reports/clients",
        headers: headersAs("finance"),
      });
      expect(finance.statusCode).toBe(200);
      for (const role of ["reception", "physiotherapist"] as const) {
        const denied = await app.inject({
          method: "GET",
          url: "/reports/clients",
          headers: headersAs(role),
        });
        expect(denied.statusCode).toBe(403);
      }
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("generates fixed monthly expenses once per month, catching up and respecting pause and end", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00.000Z"));
    try {
      const { app } = await authenticatedApp();
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const headersAs = (role: UserRole = "owner") => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const at = (iso: string) => vi.setSystemTime(new Date(iso));
      let workspace = await app.inject({
        method: "GET",
        url: "/finance/workspace",
        headers: headersAs(),
      });
      const category = workspace
        .json()
        .categories.find((item: { kind: string }) => item.kind === "expense");
      const income = workspace
        .json()
        .categories.find((item: { kind: string }) => item.kind === "income");
      const costCenter = workspace.json().costCenters[0];
      const base = {
        description: "Aluguel da sala",
        supplier: "Imobiliária Centro",
        categoryId: category.id,
        costCenterId: costCenter.id,
        amountInCents: 250_000,
        dayOfMonth: 5,
        startMonth: "2026-07",
      };

      const denied = await app.inject({
        method: "POST",
        url: "/finance/recurring-payables",
        headers: headersAs("reception"),
        payload: base,
      });
      expect(denied.statusCode).toBe(403);
      for (const invalid of [
        { ...base, dayOfMonth: 29 },
        { ...base, dayOfMonth: 0 },
        { ...base, startMonth: "2026-13" },
        { ...base, endMonth: "2026-06" },
      ]) {
        const response = await app.inject({
          method: "POST",
          url: "/finance/recurring-payables",
          headers: headersAs(),
          payload: invalid,
        });
        expect(response.statusCode).toBe(400);
      }
      if (income) {
        const wrongKind = await app.inject({
          method: "POST",
          url: "/finance/recurring-payables",
          headers: headersAs(),
          payload: { ...base, categoryId: income.id },
        });
        expect(wrongKind.statusCode).toBe(404);
        expect(wrongKind.json().code).toBe("FINANCIAL_CLASSIFICATION_NOT_FOUND");
      }

      const created = await app.inject({
        method: "POST",
        url: "/finance/recurring-payables",
        headers: headersAs(),
        payload: base,
      });
      expect(created.statusCode).toBe(201);
      const model = created.json() as { id: string };
      expect(created.json()).toMatchObject({
        description: "Aluguel da sala",
        supplier: "Imobiliária Centro",
        categoryName: category.name,
        costCenterName: costCenter.name,
        amountInCents: 250_000,
        dayOfMonth: 5,
        startMonth: "2026-07",
        active: true,
      });
      expect(created.json().endMonth).toBeUndefined();

      const generated = async () => {
        workspace = await app.inject({
          method: "GET",
          url: "/finance/workspace",
          headers: headersAs(),
        });
        expect(workspace.statusCode).toBe(200);
        return (
          workspace.json().payables as {
            recurringPayableId?: string;
            competence?: string;
            dueDate: string;
            amountInCents: number;
            status: string;
          }[]
        )
          .filter((item) => item.recurringPayableId === model.id)
          .sort((a, b) => a.competence!.localeCompare(b.competence!));
      };

      // Abrir o financeiro gera do mês inicial até o mês atual.
      let payables = await generated();
      expect(payables.map((item) => item.competence)).toEqual([
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
      ]);
      expect(payables.map((item) => item.dueDate)).toEqual([
        "2026-07-05",
        "2026-08-05",
        "2026-09-05",
        "2026-10-05",
      ]);
      expect(payables[0]).toMatchObject({
        amountInCents: 250_000,
        status: "open",
        description: "Aluguel da sala",
        supplier: "Imobiliária Centro",
        categoryId: category.id,
        costCenterId: costCenter.id,
      });

      // Idempotente: abrir de novo não duplica.
      expect(await generated()).toHaveLength(4);
      const listed = await app.inject({
        method: "GET",
        url: "/finance/recurring-payables",
        headers: headersAs(),
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual([
        expect.objectContaining({ id: model.id, lastCompetence: "2026-10" }),
      ]);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/finance/recurring-payables",
            headers: headersAs("reception"),
          })
        ).statusCode,
      ).toBe(403);

      // Meses sem abrir o financeiro são recuperados uma vez.
      at("2027-01-15T15:00:00.000Z");
      payables = await generated();
      expect(payables.map((item) => item.competence)).toEqual([
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
        "2026-11",
        "2026-12",
        "2027-01",
      ]);
      expect(payables.at(-1)!.dueDate).toBe("2027-01-05");
      expect(await generated()).toHaveLength(7);

      // Pausa: nada é gerado; ao reativar, só a partir do mês da reativação.
      const paused = await app.inject({
        method: "PUT",
        url: `/finance/recurring-payables/${model.id}`,
        headers: headersAs(),
        payload: { ...base, active: false },
      });
      expect(paused.statusCode).toBe(200);
      expect(paused.json().active).toBe(false);
      at("2027-03-10T15:00:00.000Z");
      expect(await generated()).toHaveLength(7);
      at("2027-04-10T15:00:00.000Z");
      const resumed = await app.inject({
        method: "PUT",
        url: `/finance/recurring-payables/${model.id}`,
        headers: headersAs(),
        payload: { ...base, amountInCents: 260_000, active: true },
      });
      expect(resumed.json()).toMatchObject({
        active: true,
        resumedFromMonth: "2027-04",
        amountInCents: 260_000,
      });
      payables = await generated();
      expect(payables.map((item) => item.competence).slice(-2)).toEqual([
        "2027-01",
        "2027-04",
      ]);
      expect(payables.at(-1)!.amountInCents).toBe(260_000);
      expect(payables[0]!.amountInCents).toBe(250_000);

      // Encerramento: nada depois do mês final.
      const ended = await app.inject({
        method: "PUT",
        url: `/finance/recurring-payables/${model.id}`,
        headers: headersAs(),
        payload: { ...base, amountInCents: 260_000, endMonth: "2027-05" },
      });
      expect(ended.json()).toMatchObject({
        endMonth: "2027-05",
        resumedFromMonth: "2027-04",
      });
      at("2027-08-20T15:00:00.000Z");
      payables = await generated();
      expect(payables.map((item) => item.competence).slice(-3)).toEqual([
        "2027-01",
        "2027-04",
        "2027-05",
      ]);
      expect(payables).toHaveLength(9);
      expect(await generated()).toHaveLength(9);

      const inUse = await app.inject({
        method: "DELETE",
        url: `/finance/recurring-payables/${model.id}`,
        headers: headersAs(),
      });
      expect(inUse.statusCode).toBe(409);
      expect(inUse.json().code).toBe("RECURRING_PAYABLE_IN_USE");

      // Modelo futuro ainda não gera nada e pode ser excluído.
      const future = await app.inject({
        method: "POST",
        url: "/finance/recurring-payables",
        headers: headersAs(),
        payload: { ...base, description: "Internet", startMonth: "2027-09" },
      });
      expect(future.statusCode).toBe(201);
      await generated();
      expect(
        workspace
          .json()
          .payables.some(
            (item: { recurringPayableId?: string }) =>
              item.recurringPayableId === future.json().id,
          ),
      ).toBe(false);
      const removed = await app.inject({
        method: "DELETE",
        url: `/finance/recurring-payables/${future.json().id}`,
        headers: headersAs(),
      });
      expect(removed.statusCode).toBe(204);
      const missing = await app.inject({
        method: "PUT",
        url: `/finance/recurring-payables/${future.json().id}`,
        headers: headersAs(),
        payload: base,
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe("RECURRING_PAYABLE_NOT_FOUND");
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/finance/recurring-payables/${future.json().id}`,
            headers: headersAs(),
          })
        ).statusCode,
      ).toBe(404);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a protected longitudinal clinical record", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const patient = patients.json()[0];
    let workspace = await app.inject({
      method: "GET",
      url: `/clinical-workspace/${patient.id}`,
      headers,
    });
    expect(workspace.statusCode).toBe(200);
    const customTemplate = await app.inject({
      method: "POST",
      url: "/assessment-templates",
      headers,
      payload: {
        name: "Avaliação funcional lombar",
        specialty: "Fisioterapia ortopédica",
        fields: [
          {
            key: "chief_complaint",
            label: "Queixa principal",
            type: "text",
            required: true,
          },
          {
            key: "pain_scale",
            label: "Escala de dor",
            type: "scale",
            required: true,
            min: 0,
            max: 10,
            unit: "0–10",
          },
          {
            key: "range_of_motion",
            label: "Amplitude de movimento",
            type: "number",
            required: false,
            unit: "graus",
          },
        ],
      },
    });
    expect(customTemplate.statusCode).toBe(201);
    const template = customTemplate.json();

    const invalidAssessment = await app.inject({
      method: "POST",
      url: "/clinical-assessments",
      headers,
      payload: {
        patientId: patient.id,
        templateId: template.id,
        values: { chief_complaint: "Dor lombar", pain_scale: 12 },
      },
    });
    expect(invalidAssessment.statusCode).toBe(400);

    const assessment = await app.inject({
      method: "POST",
      url: "/clinical-assessments",
      headers,
      payload: {
        patientId: patient.id,
        templateId: template.id,
        values: {
          chief_complaint: "Dor lombar ao permanecer sentado.",
          pain_scale: 7,
          range_of_motion: 65,
        },
        notes: "Avaliação inicial.",
      },
    });
    expect(assessment.statusCode).toBe(201);
    expect(assessment.json()).toMatchObject({
      patientId: patient.id,
      templateName: template.name,
    });

    const goal = await app.inject({
      method: "POST",
      url: "/therapeutic-goals",
      headers,
      payload: {
        patientId: patient.id,
        title: "Reduzir escala de dor",
        baselineValue: 7,
        targetValue: 2,
        unit: "0–10",
      },
    });
    expect(goal.statusCode).toBe(201);
    const measurement = await app.inject({
      method: "POST",
      url: "/clinical-measurements",
      headers,
      payload: {
        patientId: patient.id,
        goalId: goal.json().id,
        name: "Escala de dor",
        value: 2,
        unit: "0–10",
        measuredAt: new Date().toISOString(),
      },
    });
    expect(measurement.statusCode).toBe(201);
    const achieved = await app.inject({
      method: "PATCH",
      url: `/therapeutic-goals/${goal.json().id}/status`,
      headers,
      payload: { status: "achieved" },
    });
    expect(achieved.json()).toMatchObject({ status: "achieved" });
    expect(achieved.json().achievedAt).toBeTypeOf("string");

    const closure = await app.inject({
      method: "POST",
      url: "/treatment-closures",
      headers,
      payload: {
        patientId: patient.id,
        kind: "discharge",
        summary: "Objetivos alcançados e quadro funcional estabilizado.",
        recommendations: "Manter exercícios domiciliares.",
        occurredAt: new Date().toISOString(),
      },
    });
    expect(closure.statusCode).toBe(201);

    const [professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        patientId: patient.id,
        professionalId: professionals.json()[0].id,
        roomId: rooms.json()[0].id,
        serviceId: services.json()[0].id,
        startsAt: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(appointment.statusCode).toBe(201);
    const draft = await app.inject({
      method: "POST",
      url: "/clinical-records",
      headers,
      payload: {
        appointmentId: appointment.json().id,
        subjective: "Cliente relata melhora funcional progressiva.",
        objective: "Teste funcional com resposta satisfatória.",
        assessment: "Evolução compatível com os objetivos propostos.",
        plan: "Finalizar ciclo e manter programa domiciliar.",
        painScale: 2,
      },
    });
    const prematureAddendum = await app.inject({
      method: "POST",
      url: "/clinical-addenda",
      headers,
      payload: {
        clinicalRecordId: draft.json().id,
        reason: "Complemento necessário",
        content: "Informação clínica complementar registrada posteriormente.",
      },
    });
    expect(prematureAddendum.statusCode).toBe(409);
    await app.inject({
      method: "POST",
      url: `/clinical-records/${draft.json().id}/finalize`,
      headers,
    });
    const addendum = await app.inject({
      method: "POST",
      url: "/clinical-addenda",
      headers,
      payload: {
        clinicalRecordId: draft.json().id,
        reason: "Complemento necessário",
        content: "Informação clínica complementar registrada posteriormente.",
      },
    });
    expect(addendum.statusCode).toBe(201);

    const pdfContent = Buffer.from("%PDF-1.4\nclinical-test");
    const invalidAttachment = await app.inject({
      method: "POST",
      url: "/clinical-attachments",
      headers,
      payload: {
        patientId: patient.id,
        fileName: "imagem-falsa.pdf",
        mimeType: "application/pdf",
        sizeInBytes: 4,
        contentBase64: Buffer.from("fake").toString("base64"),
      },
    });
    expect(invalidAttachment.statusCode).toBe(400);
    const attachment = await app.inject({
      method: "POST",
      url: "/clinical-attachments",
      headers,
      payload: {
        patientId: patient.id,
        fileName: "laudo.pdf",
        mimeType: "application/pdf",
        sizeInBytes: pdfContent.length,
        contentBase64: pdfContent.toString("base64"),
        notes: "Laudo de apoio.",
      },
    });
    expect(attachment.statusCode).toBe(201);
    expect(attachment.json().sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(attachment.json().contentBase64).toBeUndefined();
    const downloaded = await app.inject({
      method: "GET",
      url: `/clinical-attachments/${attachment.json().id}/content`,
      headers,
    });
    expect(downloaded.json().contentBase64).toBe(pdfContent.toString("base64"));
    const exported = await app.inject({
      method: "GET",
      url: `/clinical-workspace/${patient.id}/export`,
      headers,
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-disposition"]).toContain("attachment");

    workspace = await app.inject({
      method: "GET",
      url: `/clinical-workspace/${patient.id}`,
      headers,
    });
    expect(workspace.json().assessments).toHaveLength(1);
    expect(workspace.json().measurements).toHaveLength(1);
    expect(workspace.json().closures).toHaveLength(1);
    expect(workspace.json().attachments).toHaveLength(1);
    expect(workspace.json().addenda).toHaveLength(1);
    expect(workspace.json().goals[0]).toMatchObject({ status: "achieved" });
    const accessEvents = await app.inject({
      method: "GET",
      url: `/clinical-workspace/${patient.id}/access-events`,
      headers,
    });
    expect(
      accessEvents.json().map((item: { action: string }) => item.action),
    ).toEqual(
      expect.arrayContaining([
        "read",
        "upload",
        "download",
        "export",
        "addendum",
      ]),
    );
    await app.close();
  });

  it("renegotiates debt and generates commissions idempotently", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
    ]);
    const startsAt = new Date(
      Date.now() + 55 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const date = startsAt.slice(0, 10);
    await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        patientId: patients.json()[0].id,
        serviceId: services.json()[0].id,
        name: "Plano renegociado",
        kind: "fixed_package",
        totalSessions: 2,
        validFrom: date,
        totalValueInCents: 10000,
        installments: 2,
        firstDueDate: date,
      },
    });
    let workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const ids = workspace
      .json()
      .summary.receivables.map((item: { id: string }) => item.id);
    const renegotiated = await app.inject({
      method: "POST",
      url: "/finance/renegotiations",
      headers,
      payload: {
        receivableIds: ids,
        totalAmountInCents: 9001,
        installments: 3,
        firstDueDate: date,
        reason: "Acordo comercial de teste",
      },
    });
    expect(renegotiated.statusCode).toBe(201);
    expect(renegotiated.json().newReceivables).toHaveLength(3);
    expect(
      renegotiated
        .json()
        .newReceivables.reduce(
          (sum: number, item: { amountInCents: number }) =>
            sum + item.amountInCents,
          0,
        ),
    ).toBe(9001);

    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        patientId: patients.json()[0].id,
        professionalId: professionals.json()[0].id,
        roomId: rooms.json()[0].id,
        serviceId: services.json()[0].id,
        startsAt,
      },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointment.json().id}/status`,
      headers,
      payload: { status: "completed" },
    });
    await app.inject({
      method: "POST",
      url: "/finance/commission-rules",
      headers,
      payload: {
        professionalId: professionals.json()[0].id,
        percentage: 30,
        effectiveFrom: date,
      },
    });
    const first = await app.inject({
      method: "POST",
      url: "/finance/commissions/generate",
      headers,
      payload: { competence: startsAt.slice(0, 7) },
    });
    const second = await app.inject({
      method: "POST",
      url: "/finance/commissions/generate",
      headers,
      payload: { competence: startsAt.slice(0, 7) },
    });
    expect(first.json()).toHaveLength(1);
    expect(second.json()).toHaveLength(1);
    const paid = await app.inject({
      method: "POST",
      url: `/finance/commissions/${first.json()[0].id}/pay`,
      headers,
    });
    expect(paid.json().status).toBe("paid");
    workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(workspace.json().commissions).toHaveLength(1);
    await app.close();
  });

  it("manages group capacity, waitlist and one-time replacement credits", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
    ]);
    const references = {
      patients: patients.json(),
      service: services.json()[0],
      professional: professionals.json()[0],
      room: rooms
        .json()
        .find((item: { capacity: number }) => item.capacity >= 4),
    };
    const createGroup = async (
      capacity: number,
      weeklySlots = [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
    ) =>
      app.inject({
        method: "POST",
        url: "/groups",
        headers,
        payload: {
          capacity,
          serviceId: references.service.id,
          professionalId: references.professional.id,
          roomId: references.room.id,
          weeklySlots,
        },
      });
    const group = await createGroup(1);
    expect(group.statusCode).toBe(201);
    expect(group.json().name).toBe(
      groupClassName(references.service.name, group.json().sequence),
    );
    const enroll = (patientId: string) =>
      app.inject({
        method: "POST",
        url: "/group-enrollments",
        headers,
        payload: { groupId: group.json().id, patientId },
      });
    const first = await enroll(references.patients[0].id);
    const waiting = await enroll(references.patients[1].id);
    expect(first.json().status).toBe("active");
    expect(waiting.json()).toMatchObject({
      status: "waitlisted",
      queuePosition: 1,
    });
    const updatedGroup = await app.inject({
      method: "PUT",
      url: `/groups/${group.json().id}`,
      headers,
      payload: { capacity: 2, weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }, { weekday: 4, startTime: "18:00", endTime: "19:30" }] },
    });
    expect(updatedGroup.statusCode).toBe(200);
    expect(updatedGroup.json()).toMatchObject({ capacity: 2, activeEnrollments: 2, waitlistCount: 0 });
    expect(updatedGroup.json().weeklySlots).toHaveLength(2);
    const tooSmall = await app.inject({
      method: "PUT",
      url: `/groups/${group.json().id}`,
      headers,
      payload: { capacity: 1, weeklySlots: updatedGroup.json().weeklySlots },
    });
    expect(tooSmall.statusCode).toBe(409);
    await app.inject({
      method: "POST",
      url: `/group-enrollments/${first.json().id}/cancel`,
      headers,
    });
    const agendaRange = `from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 13 * 7 * 86_400_000).toISOString())}`;
    const agenda = await app.inject({ method: "GET", url: `/group-sessions?${agendaRange}`, headers });
    expect(agenda.statusCode).toBe(200);
    const sessions = agenda
      .json()
      .filter((item: { groupId: string }) => item.groupId === group.json().id);
    // Terças 18:00–19:00 e quintas 18:00–19:30 reservadas automaticamente por 12 semanas.
    expect(sessions.length).toBeGreaterThanOrEqual(22);
    for (const session of sessions) {
      const local = localParts(new Date(session.startsAt), "America/Sao_Paulo");
      const minutes = (new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000;
      expect([local.weekday, local.time, minutes]).toEqual(local.weekday === 2 ? [2, "18:00", 60] : [4, "18:00", 90]);
    }
    expect(sessions[0]).toMatchObject({
      professionalName: references.professional.fullName,
      roomName: references.room.name,
    });
    const startsAt = new Date(sessions[0].startsAt);
    const attendance = await app.inject({
      method: "PUT",
      url: `/group-sessions/${sessions[0].id}/attendance/${references.patients[1].id}`,
      headers,
      payload: { status: "excused_absence", notes: "Atestado" },
    });
    expect(attendance.statusCode).toBe(200);
    const workspace = await app.inject({
      method: "GET",
      url: `/groups/workspace?from=${encodeURIComponent(startsAt.toISOString())}&to=${encodeURIComponent(new Date(startsAt.getTime() + 20 * 86_400_000).toISOString())}`,
      headers,
    });
    expect(
      workspace
        .json()
        .enrollments.find(
          (item: { id: string }) => item.id === waiting.json().id,
        ).status,
    ).toBe("active");
    const credit = workspace.json().replacementCredits[0];
    expect(credit.status).toBe("available");
    const sameSlot = await createGroup(4);
    expect(sameSlot.statusCode).toBe(409);
    expect(sameSlot.json().message).toContain(group.json().name);
    const targetGroup = await createGroup(4, [{ weekday: 3, startTime: "10:00", endTime: "11:00" }]);
    expect(targetGroup.json()).toMatchObject({
      sequence: group.json().sequence + 1,
      name: groupClassName(references.service.name, group.json().sequence + 1),
    });
    const targetSessions = await app.inject({ method: "GET", url: `/group-sessions?${agendaRange}`, headers });
    const targetSession = targetSessions
      .json()
      .find((item: { groupId: string }) => item.groupId === targetGroup.json().id);
    const booking = await app.inject({
      method: "POST",
      url: "/group-replacements/book",
      headers,
      payload: { creditId: credit.id, sessionId: targetSession.id },
    });
    expect(booking.json().credit.status).toBe("used");
    const duplicate = await app.inject({
      method: "POST",
      url: "/group-replacements/book",
      headers,
      payload: { creditId: credit.id, sessionId: targetSession.id },
    });
    expect(duplicate.statusCode).toBe(409);
    await app.close();
  });

  it("reserves group hours in the agenda and blocks conflicting appointments", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
    ]);
    const service = services.json()[0];
    const professional = professionals.json()[0];
    const room = rooms.json().find((item: { capacity: number }) => item.capacity >= 4);
    const timezone = "America/Sao_Paulo";
    // Primeira sexta-feira a partir de `weeksAhead` semanas, no horário local informado.
    const friday = (weeksAhead: number, time: string) => {
      let date = localParts(new Date(Date.now() + weeksAhead * 7 * 86_400_000), timezone).date;
      while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 5) {
        const next = new Date(`${date}T12:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        date = next.toISOString().slice(0, 10);
      }
      return zonedTimeToUtc(date, time, timezone).toISOString();
    };
    const book = (startsAt: string) =>
      app.inject({
        method: "POST",
        url: "/appointments",
        headers,
        payload: {
          patientId: patients.json()[0].id,
          professionalId: professional.id,
          roomId: room.id,
          serviceId: service.id,
          startsAt,
        },
      });
    const createGroup = (startTime: string, endTime: string) =>
      app.inject({
        method: "POST",
        url: "/groups",
        headers,
        payload: {
          capacity: 4,
          serviceId: service.id,
          professionalId: professional.id,
          roomId: room.id,
          weeklySlots: [{ weekday: 5, startTime, endTime }],
        },
      });

    const booked = await book(friday(20, "07:00"));
    expect(booked.statusCode).toBe(201);
    const blocked = await createGroup("07:00", "08:00");
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe("GROUP_SCHEDULE_CONFLICT");
    expect(blocked.json().message).toContain("Atendimento de");

    const group = await createGroup("06:00", "06:50");
    expect(group.statusCode).toBe(201);
    expect((await book(friday(2, "06:00"))).json().code).toBe("APPOINTMENT_CONFLICT");
    // Além das 12 semanas já reservadas, o horário fixo da turma continua ocupado.
    expect((await book(friday(30, "06:30"))).json().code).toBe("APPOINTMENT_CONFLICT");
    expect((await book(friday(30, "06:50"))).statusCode).toBe(201);
    await app.close();
  });

  it("controls stock and reverses inventory and finance when a tab is cancelled", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const product = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: {
        name: "Faixa elástica",
        sku: "FX-001",
        unit: "un",
        costInCents: 2000,
        salePriceInCents: 4500,
        initialStock: 5,
        minimumStock: 2,
      },
    });
    expect(product.statusCode).toBe(201);
    const excessiveLoss = await app.inject({
      method: "POST",
      url: "/inventory/movements",
      headers,
      payload: {
        productId: product.json().id,
        kind: "loss",
        quantity: 6,
        notes: "Avaria identificada",
      },
    });
    expect(excessiveLoss.statusCode).toBe(409);
    const tab = await app.inject({
      method: "POST",
      url: "/patient-tabs",
      headers,
      payload: { patientId: patients.json()[0].id, notes: "Venda interna" },
    });
    const withItem = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/items`,
      headers,
      payload: { productId: product.json().id, quantity: 2 },
    });
    expect(withItem.json().totalInCents).toBe(9000);
    let inventory = await app.inject({
      method: "GET",
      url: "/inventory/workspace",
      headers,
    });
    expect(inventory.json().products[0].currentStock).toBe(3);
    const closed = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/close`,
      headers,
      payload: {
        settlement: "paid",
        paymentMethod: "pix",
        dueDate: new Date().toISOString().slice(0, 10),
      },
    });
    expect(closed.json()).toMatchObject({
      status: "closed",
      paymentStatus: "paid",
    });
    let finance = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(finance.json().summary.receivables[0].status).toBe("paid");
    const month = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date()).slice(0, 7);
    const soldReport = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers,
    });
    expect(soldReport.json().current).toMatchObject({
      grossSalesInCents: 9000,
      netSalesInCents: 9000,
      receivedInCents: 9000,
    });
    const cancelled = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/cancel`,
      headers,
    });
    expect(cancelled.json().status).toBe("cancelled");
    inventory = await app.inject({
      method: "GET",
      url: "/inventory/workspace",
      headers,
    });
    expect(inventory.json().products[0].currentStock).toBe(5);
    expect(
      inventory.json().movements.map((item: { kind: string }) => item.kind),
    ).toEqual(
      expect.arrayContaining(["initial_stock", "sale", "sale_reversal"]),
    );
    finance = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(finance.json().summary.receivables[0].status).toBe("cancelled");
    const cancelledReport = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers,
    });
    expect(cancelledReport.json().current).toMatchObject({
      grossSalesInCents: 9000,
      cancelledSalesInCents: 9000,
      netSalesInCents: 0,
      receivedInCents: 9000,
    });
    const duplicateCancellation = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/cancel`,
      headers,
    });
    expect(duplicateCancellation.statusCode).toBe(409);
    await app.close();
  });

  it("manages holidays as owner and refuses appointments, reschedules and series on them", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const clinicId = "11111111-1111-4111-8111-111111111111";
    await seedRoleUsers(app);
    const receptionHeaders = {
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "reception"), clinicId, role: "user" })}`,
    };
    const day = (offset: number) =>
      new Date(Date.UTC(2031, 3, 21 + offset)).toISOString().slice(0, 10);
    const holidayDate = day(0);

    expect((await app.inject({ method: "GET", url: "/holidays", headers })).json()).toEqual([]);
    const forbidden = await app.inject({
      method: "POST",
      url: "/holidays",
      headers: receptionHeaders,
      payload: { date: holidayDate, name: "Tiradentes" },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ code: "ADMIN_ACCESS_REQUIRED" });
    const invalid = await app.inject({
      method: "POST",
      url: "/holidays",
      headers,
      payload: { date: "21/04/2031", name: "Tiradentes" },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/holidays",
      headers,
      payload: { date: holidayDate, name: "  Tiradentes " },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ clinicId, date: holidayDate, name: "Tiradentes" });
    const duplicate = await app.inject({
      method: "POST",
      url: "/holidays",
      headers,
      payload: { date: holidayDate, name: "Outro" },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ code: "HOLIDAY_DUPLICATE" });
    const earlier = await app.inject({
      method: "POST",
      url: "/holidays",
      headers,
      payload: { date: day(-20), name: "Aniversário da clínica" },
    });
    expect(earlier.statusCode).toBe(201);

    const listed = await app.inject({ method: "GET", url: "/holidays", headers: receptionHeaders });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().map((item: { date: string }) => item.date)).toEqual([day(-20), holidayDate]);
    const ranged = await app.inject({
      method: "GET",
      url: `/holidays?from=${day(-1)}&to=${day(1)}`,
      headers,
    });
    expect(ranged.json()).toHaveLength(1);
    expect(ranged.json()[0]).toMatchObject({ name: "Tiradentes" });

    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const payload = {
      patientId: patients.json()[0].id,
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
    };
    const onHoliday = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...payload, startsAt: `${holidayDate}T15:00:00.000Z` },
    });
    expect(onHoliday.statusCode).toBe(409);
    expect(onHoliday.json()).toMatchObject({ code: "HOLIDAY" });
    expect(onHoliday.json().message).toContain("Tiradentes");
    // 22h30 do feriado em São Paulo já é o dia seguinte em UTC.
    const lateOnHoliday = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...payload, startsAt: `${day(1)}T01:30:00.000Z` },
    });
    expect(lateOnHoliday.statusCode).toBe(409);
    expect(lateOnHoliday.json()).toMatchObject({ code: "HOLIDAY" });
    // 23h da véspera em São Paulo já é o feriado em UTC, mas não na clínica.
    const eve = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...payload, startsAt: `${holidayDate}T02:00:00.000Z` },
    });
    expect(eve.statusCode).toBe(201);

    const moved = await app.inject({
      method: "PUT",
      url: `/appointments/${eve.json().id}/schedule`,
      headers,
      payload: {
        professionalId: payload.professionalId,
        roomId: payload.roomId,
        startsAt: `${holidayDate}T15:00:00.000Z`,
      },
    });
    expect(moved.statusCode).toBe(409);
    expect(moved.json()).toMatchObject({ code: "HOLIDAY" });
    expect(moved.json().message).toContain("Tiradentes");

    const series = {
      ...payload,
      startsAt: `${day(-7)}T15:00:00.000Z`,
      occurrences: 3,
      intervalWeeks: 1,
    };
    const recurring = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: series,
    });
    expect(recurring.statusCode).toBe(409);
    expect(recurring.json()).toMatchObject({ code: "HOLIDAY" });
    expect(recurring.json().message).toContain("Tiradentes");
    const agenda = await app.inject({
      method: "GET",
      url: `/appointments?from=${day(-8)}T00:00:00.000Z&to=${day(15)}T00:00:00.000Z`,
      headers,
    });
    expect(agenda.json().map((item: Appointment) => item.id)).toEqual([eve.json().id]);

    const receptionDelete = await app.inject({
      method: "DELETE",
      url: `/holidays/${created.json().id}`,
      headers: receptionHeaders,
    });
    expect(receptionDelete.statusCode).toBe(403);
    expect(receptionDelete.json()).toMatchObject({ code: "ADMIN_ACCESS_REQUIRED" });
    const removed = await app.inject({
      method: "DELETE",
      url: `/holidays/${created.json().id}`,
      headers,
    });
    expect(removed.statusCode).toBe(204);
    const removedAgain = await app.inject({
      method: "DELETE",
      url: `/holidays/${created.json().id}`,
      headers,
    });
    expect(removedAgain.statusCode).toBe(404);
    expect(removedAgain.json()).toMatchObject({ code: "HOLIDAY_NOT_FOUND" });
    const afterRemoval = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: series,
    });
    expect(afterRemoval.statusCode).toBe(201);
    expect(afterRemoval.json()).toHaveLength(3);
    await app.close();
  });

  it("reads relationship settings with defaults and lets only the owner update them", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const initial = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers,
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual(defaultRelationshipSettings);

    const updatedSettings = {
      ...defaultRelationshipSettings,
      birthdayDaysAhead: 3,
      planExpiringDays: 10,
      formerClientMinDays: 15,
      formerClientMaxDays: 45,
      messages: {
        ...defaultRelationshipSettings.messages,
        birthday: "Parabéns, {{nome}}!",
      },
    };
    const updated = await app.inject({
      method: "PUT",
      url: "/relationship/settings",
      headers,
      payload: updatedSettings,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual(updatedSettings);
    const reread = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers,
    });
    expect(reread.json()).toEqual(updatedSettings);

    const invalid = await app.inject({
      method: "PUT",
      url: "/relationship/settings",
      headers,
      payload: { ...updatedSettings, formerClientMinDays: 90, formerClientMaxDays: 30 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });

    const clinicId = "11111111-1111-4111-8111-111111111111";
    await seedRoleUsers(app);
    const receptionHeaders = {
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "reception"), clinicId, role: "user" })}`,
    };
    const receptionRead = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers: receptionHeaders,
    });
    expect(receptionRead.statusCode).toBe(200);
    expect(receptionRead.json()).toEqual(updatedSettings);
    const receptionWrite = await app.inject({
      method: "PUT",
      url: "/relationship/settings",
      headers: receptionHeaders,
      payload: defaultRelationshipSettings,
    });
    expect(receptionWrite.statusCode).toBe(403);
    expect(receptionWrite.json()).toMatchObject({ code: "ADMIN_ACCESS_REQUIRED" });

    const physiotherapistRead = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "physiotherapist"), clinicId, role: "user" })}`,
      },
    });
    expect(physiotherapistRead.statusCode).toBe(403);
    expect(physiotherapistRead.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
    await app.close();
  });

  it("lists contact suggestions and hides them after a contact or until the snooze date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00.000Z"));
    try {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const roleHeaders = (role: UserRole) => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const patient = (
        await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload: {
            fullName: "Rita Relacionamento",
            phone: "11955554444",
            birthDate: "1990-10-10",
            tags: [],
          },
        })
      ).json() as { id: string };
      const service = (
        await app.inject({ method: "GET", url: "/services", headers })
      ).json()[0] as { id: string };
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: {
          patientId: patient.id,
          serviceId: service.id,
          name: "Pacote relacionamento",
          kind: "fixed_package",
          totalSessions: 20,
          validFrom: "2026-09-01",
          validUntil: "2027-03-01",
          totalValueInCents: 30000,
          installments: 1,
          firstDueDate: "2026-09-05",
        },
      });
      expect(plan.statusCode).toBe(201);

      type Suggestion = { patientId: string; reason: string; referenceKey: string };
      const suggestionsFor = async (requestHeaders: Record<string, string>) => {
        const response = await app.inject({
          method: "GET",
          url: "/relationship/suggestions",
          headers: requestHeaders,
        });
        expect(response.statusCode).toBe(200);
        return (response.json() as Suggestion[]).filter(
          (item) => item.patientId === patient.id,
        );
      };

      const ownerSuggestions = await suggestionsFor(headers);
      expect(ownerSuggestions.map((item) => item.reason).sort()).toEqual([
        "birthday",
        "overdue_payment",
      ]);
      const birthday = ownerSuggestions.find((item) => item.reason === "birthday")!;
      expect(birthday.referenceKey).toBe(`${patient.id}:2026`);
      const overdue = ownerSuggestions.find(
        (item) => item.reason === "overdue_payment",
      )!;

      const receptionSuggestions = await suggestionsFor(roleHeaders("reception"));
      expect(receptionSuggestions.map((item) => item.reason)).toEqual(["birthday"]);
      const financeSuggestions = await suggestionsFor(roleHeaders("finance"));
      expect(financeSuggestions.map((item) => item.reason)).toContain(
        "overdue_payment",
      );

      const physiotherapist = roleHeaders("physiotherapist");
      for (const request of [
        { method: "GET" as const, url: "/relationship/suggestions" },
        { method: "GET" as const, url: "/relationship/activities" },
        {
          method: "POST" as const,
          url: "/relationship/activities",
          payload: {
            patientId: patient.id,
            reason: "birthday",
            referenceKey: birthday.referenceKey,
            outcome: "contacted",
          },
        },
      ]) {
        const denied = await app.inject({ ...request, headers: physiotherapist });
        expect(denied.statusCode).toBe(403);
        expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
      }

      const contacted = await app.inject({
        method: "POST",
        url: "/relationship/activities",
        headers: roleHeaders("reception"),
        payload: {
          patientId: patient.id,
          reason: "birthday",
          referenceKey: birthday.referenceKey,
          outcome: "contacted",
          notes: "Mensagem de parabéns enviada",
        },
      });
      expect(contacted.statusCode).toBe(201);
      expect(contacted.json()).toMatchObject({
        clinicId,
        patientId: patient.id,
        reason: "birthday",
        outcome: "contacted",
        notes: "Mensagem de parabéns enviada",
        actorUserId: roleSub(app, "reception"),
      });
      expect(
        (await suggestionsFor(headers)).map((item) => item.reason),
      ).toEqual(["overdue_payment"]);

      const pastSnooze = await app.inject({
        method: "POST",
        url: "/relationship/activities",
        headers,
        payload: {
          patientId: patient.id,
          reason: "overdue_payment",
          referenceKey: overdue.referenceKey,
          outcome: "snoozed",
          snoozeUntil: "2026-10-10",
        },
      });
      expect(pastSnooze.statusCode).toBe(400);
      const unknownPatient = await app.inject({
        method: "POST",
        url: "/relationship/activities",
        headers,
        payload: {
          patientId: "fafafafa-fafa-4afa-8afa-fafafafafafa",
          reason: "birthday",
          referenceKey: "x",
          outcome: "contacted",
        },
      });
      expect(unknownPatient.statusCode).toBe(404);

      const snoozed = await app.inject({
        method: "POST",
        url: "/relationship/activities",
        headers,
        payload: {
          patientId: patient.id,
          reason: "overdue_payment",
          referenceKey: overdue.referenceKey,
          outcome: "snoozed",
          snoozeUntil: "2026-10-12",
        },
      });
      expect(snoozed.statusCode).toBe(201);
      expect(snoozed.json()).toMatchObject({ snoozeUntil: "2026-10-12" });
      expect(await suggestionsFor(headers)).toEqual([]);

      // O token de login expira com o avanço do relógio: assina um novo a cada data.
      vi.setSystemTime(new Date("2026-10-12T15:00:00.000Z"));
      expect(await suggestionsFor(roleHeaders("owner"))).toEqual([]);
      vi.setSystemTime(new Date("2026-10-13T15:00:00.000Z"));
      const ownerHeaders = roleHeaders("owner");
      expect(
        (await suggestionsFor(ownerHeaders)).map((item) => item.reason),
      ).toEqual(["overdue_payment"]);

      const activities = await app.inject({
        method: "GET",
        url: `/relationship/activities?patientId=${patient.id}`,
        headers: roleHeaders("finance"),
      });
      expect(activities.statusCode).toBe(200);
      expect(
        activities.json().map((item: { outcome: string }) => item.outcome),
      ).toEqual(["snoozed", "contacted"]);
      const otherPatient = await app.inject({
        method: "GET",
        url: "/relationship/activities?patientId=99999999-9999-4999-8999-999999999999",
        headers: ownerHeaders,
      });
      expect(otherPatient.json()).toEqual([]);
      const all = await app.inject({
        method: "GET",
        url: "/relationship/activities",
        headers: ownerHeaders,
      });
      expect(all.json()).toHaveLength(2);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("suggests contacting detractors from the last 30 days until the survey is handled", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00.000Z"));
    try {
      const app = await buildApp({
        repository: new MemoryClinicRepository(),
        logger: false,
      });
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const headers = (role: UserRole = "owner") => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const patient = (
        await app.inject({
          method: "POST",
          url: "/patients",
          headers: headers(),
          payload: { fullName: "Nair Detratora", phone: "11944443333", tags: [] },
        })
      ).json() as { id: string };
      const survey = async (score: number) => {
        const response = await app.inject({
          method: "POST",
          url: "/satisfaction",
          headers: headers("reception"),
          payload: { patientId: patient.id, score },
        });
        expect(response.statusCode).toBe(201);
        return response.json() as { id: string };
      };
      type Suggestion = {
        patientId: string;
        reason: string;
        referenceKey: string;
        dueDate?: string;
      };
      const detractorSuggestions = async (role: UserRole = "owner") => {
        const response = await app.inject({
          method: "GET",
          url: "/relationship/suggestions",
          headers: headers(role),
        });
        expect(response.statusCode).toBe(200);
        return (response.json() as Suggestion[]).filter(
          (item) =>
            item.patientId === patient.id && item.reason === "nps_detractor",
        );
      };

      await survey(8);
      expect(await detractorSuggestions()).toEqual([]);
      const first = await survey(3);
      expect(await detractorSuggestions("reception")).toMatchObject([
        { referenceKey: first.id, dueDate: "2026-10-10" },
      ]);

      const contacted = await app.inject({
        method: "POST",
        url: "/relationship/activities",
        headers: headers("reception"),
        payload: {
          patientId: patient.id,
          reason: "nps_detractor",
          referenceKey: first.id,
          outcome: "contacted",
        },
      });
      expect(contacted.statusCode).toBe(201);
      expect(await detractorSuggestions()).toEqual([]);

      const second = await survey(6);
      expect(await detractorSuggestions()).toMatchObject([
        { referenceKey: second.id },
      ]);
      vi.setSystemTime(new Date("2026-11-09T15:00:00.000Z"));
      expect(await detractorSuggestions()).toHaveLength(1);
      vi.setSystemTime(new Date("2026-11-10T15:00:00.000Z"));
      expect(await detractorSuggestions()).toEqual([]);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists the month's birthdays with the age turning and whether they were congratulated", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00.000Z"));
    try {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      await seedRoleUsers(app);
      const roleHeaders = (role: UserRole) => ({
        authorization: `Bearer ${app.jwt.sign({
          sub: roleSub(app, role),
          clinicId: "11111111-1111-4111-8111-111111111111",
          role: tokenRole(role),
        })}`,
      });
      const createPatient = async (fullName: string, birthDate?: string) =>
        (
          await app.inject({
            method: "POST",
            url: "/patients",
            headers,
            payload: {
              fullName,
              phone: "11955554444",
              whatsapp: "11966665555",
              ...(birthDate ? { birthDate } : {}),
              tags: [],
            },
          })
        ).json() as { id: string };
      const rita = await createPatient("Rita Aniversário", "1990-10-10");
      const bruno = await createPatient("Bruno Aniversário", "1985-10-03");
      const leap = await createPatient("Lia Bissexta", "2000-02-29");
      const noBirthday = await createPatient("Sem Data Nascimento");
      const ours = [rita.id, bruno.id, leap.id, noBirthday.id];

      type Entry = {
        patientId: string;
        date: string;
        day: number;
        ageTurning: number;
        referenceKey: string;
        congratulated: boolean;
        patientName: string;
        whatsapp?: string;
      };
      const birthdays = async (
        query: string,
        requestHeaders: Record<string, string> = headers,
      ) => {
        const response = await app.inject({
          method: "GET",
          url: `/relationship/birthdays${query}`,
          headers: requestHeaders,
        });
        expect(response.statusCode).toBe(200);
        return response.json() as Entry[];
      };

      const october = await birthdays("?month=2026-10");
      const patients = (
        await app.inject({ method: "GET", url: "/patients", headers })
      ).json() as { id: string; status: string }[];
      for (const entry of october) {
        expect(entry.date.slice(0, 7)).toBe("2026-10");
        expect(patients.find((item) => item.id === entry.patientId)?.status).toBe(
          "active",
        );
      }
      const days = october.map((entry) => entry.day);
      expect(days).toEqual([...days].sort((a, b) => a - b));
      const ourOctober = october.filter((entry) => ours.includes(entry.patientId));
      expect(ourOctober).toEqual([
        expect.objectContaining({
          patientId: bruno.id,
          patientName: "Bruno Aniversário",
          whatsapp: "11966665555",
          date: "2026-10-03",
          day: 3,
          ageTurning: 41,
          referenceKey: `${bruno.id}:2026`,
          congratulated: false,
        }),
        expect.objectContaining({
          patientId: rita.id,
          date: "2026-10-10",
          day: 10,
          ageTurning: 36,
          referenceKey: `${rita.id}:2026`,
          congratulated: false,
        }),
      ]);
      expect(
        (await birthdays("", roleHeaders("reception"))).filter((entry) =>
          ours.includes(entry.patientId),
        ),
      ).toEqual(ourOctober);

      // Adiar ou registrar outro ano não conta como parabéns dado.
      for (const payload of [
        { referenceKey: `${rita.id}:2025`, outcome: "contacted" },
        { referenceKey: `${rita.id}:2026`, outcome: "snoozed", snoozeUntil: "2026-10-11" },
        { referenceKey: `${bruno.id}:2026`, outcome: "contacted" },
      ]) {
        const created = await app.inject({
          method: "POST",
          url: "/relationship/activities",
          headers,
          payload: {
            patientId: payload.referenceKey.split(":")[0],
            reason: "birthday",
            ...payload,
          },
        });
        expect(created.statusCode).toBe(201);
      }
      const afterContact = (
        await birthdays("?month=2026-10", roleHeaders("finance"))
      ).filter((entry) => ours.includes(entry.patientId));
      expect(
        afterContact.map((entry) => [entry.patientId, entry.congratulated]),
      ).toEqual([
        [bruno.id, true],
        [rita.id, false],
      ]);

      const february2027 = (await birthdays("?month=2027-02")).filter((entry) =>
        ours.includes(entry.patientId),
      );
      expect(february2027).toEqual([
        expect.objectContaining({
          patientId: leap.id,
          date: "2027-02-28",
          day: 28,
          ageTurning: 27,
          referenceKey: `${leap.id}:2027`,
        }),
      ]);
      const february2028 = (await birthdays("?month=2028-02")).filter((entry) =>
        ours.includes(entry.patientId),
      );
      expect(february2028).toEqual([
        expect.objectContaining({ date: "2028-02-29", day: 29, ageTurning: 28 }),
      ]);

      for (const month of ["2026-13", "2026-1", "outubro"]) {
        const invalid = await app.inject({
          method: "GET",
          url: `/relationship/birthdays?month=${month}`,
          headers,
        });
        expect(invalid.statusCode).toBe(400);
      }
      const denied = await app.inject({
        method: "GET",
        url: "/relationship/birthdays?month=2026-10",
        headers: roleHeaders("physiotherapist"),
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("records satisfaction surveys for completed appointments once and summarizes the NPS", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const clinicId = "11111111-1111-4111-8111-111111111111";
    const sub = "22222222-2222-4222-8222-222222222222";
    await seedRoleUsers(app);
    const roleHeaders = (role: UserRole) => ({
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
    });
    const helena = "99999999-9999-4999-8999-999999999999";
    const lucas = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const helenaAppointment = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const post = (payload: object, requestHeaders = headers) =>
      app.inject({
        method: "POST",
        url: "/satisfaction",
        headers: requestHeaders,
        payload,
      });

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/satisfaction",
      payload: { patientId: helena, score: 10 },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const notCompleted = await post({
      patientId: helena,
      appointmentId: helenaAppointment,
      score: 10,
    });
    expect(notCompleted.statusCode).toBe(400);
    expect(notCompleted.json()).toMatchObject({
      code: "SATISFACTION_APPOINTMENT_NOT_COMPLETED",
    });

    const completed = await app.inject({
      method: "PATCH",
      url: `/appointments/${helenaAppointment}/status`,
      headers,
      payload: { status: "completed" },
    });
    expect(completed.statusCode).toBe(200);

    const otherPatient = await post({
      patientId: lucas,
      appointmentId: helenaAppointment,
      score: 10,
    });
    expect(otherPatient.statusCode).toBe(400);
    expect(otherPatient.json()).toMatchObject({
      code: "SATISFACTION_APPOINTMENT_MISMATCH",
    });

    const missingAppointment = await post({
      patientId: helena,
      appointmentId: "12121212-1212-4121-8121-121212121212",
      score: 10,
    });
    expect(missingAppointment.statusCode).toBe(404);
    expect(missingAppointment.json()).toMatchObject({
      code: "APPOINTMENT_NOT_FOUND",
    });

    const missingPatient = await post({
      patientId: "12121212-1212-4121-8121-121212121212",
      score: 10,
    });
    expect(missingPatient.statusCode).toBe(404);
    expect(missingPatient.json()).toMatchObject({ code: "PATIENT_NOT_FOUND" });

    for (const payload of [
      { patientId: helena, score: 11 },
      { patientId: helena, score: -1 },
      { patientId: helena, score: 7.5 },
      { patientId: helena },
      { patientId: helena, score: 8, comment: "x".repeat(1001) },
      { patientId: "não-é-uuid", score: 8 },
    ]) {
      const invalid = await post(payload);
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    }

    const created = await post({
      patientId: helena,
      appointmentId: helenaAppointment,
      score: 10,
      comment: "  Atendimento excelente.  ",
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({
      id: expect.any(String),
      clinicId,
      patientId: helena,
      patientName: "Helena Almeida",
      appointmentId: helenaAppointment,
      score: 10,
      comment: "Atendimento excelente.",
      actorUserId: sub,
      createdAt: expect.any(String),
    });

    const duplicate = await post(
      { patientId: helena, appointmentId: helenaAppointment, score: 3 },
      roleHeaders("reception"),
    );
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ code: "SATISFACTION_DUPLICATE" });

    const byRole = [
      ["reception", 8],
      ["physiotherapist", 5],
      ["finance", 0],
    ] as const;
    for (const [role, score] of byRole) {
      const response = await post(
        { patientId: lucas, score },
        roleHeaders(role),
      );
      expect(response.statusCode).toBe(201);
      expect(response.json()).not.toHaveProperty("appointmentId");
      expect(response.json()).not.toHaveProperty("comment");
    }

    for (const role of [
      "owner",
      "reception",
      "physiotherapist",
      "finance",
    ] as const) {
      const report = await app.inject({
        method: "GET",
        url: "/satisfaction",
        headers: roleHeaders(role),
      });
      expect(report.statusCode).toBe(200);
      expect(report.json().summary).toEqual({
        total: 4,
        promoters: 1,
        passives: 1,
        detractors: 2,
        nps: -25,
      });
    }
    const report = await app.inject({
      method: "GET",
      url: "/satisfaction",
      headers,
    });
    expect(
      report
        .json()
        .surveys.map((item: { score: number; patientName: string }) => [
          item.patientName,
          item.score,
        ]),
    ).toEqual([
      ["Lucas Ribeiro", 0],
      ["Lucas Ribeiro", 5],
      ["Lucas Ribeiro", 8],
      ["Helena Almeida", 10],
    ]);
    const unauthenticatedList = await app.inject({
      method: "GET",
      url: "/satisfaction",
    });
    expect(unauthenticatedList.statusCode).toBe(401);
    await app.close();
  });

  it("filters satisfaction surveys by the clinic date and defaults to the current month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // 31/10 às 23h30 em São Paulo = 01/11 02h30 UTC: conta em outubro.
      vi.setSystemTime(new Date("2026-11-01T02:30:00.000Z"));
      const app = await buildApp({
        repository: new MemoryClinicRepository(),
        logger: false,
      });
      const clinicId = "11111111-1111-4111-8111-111111111111";
      const sub = "22222222-2222-4222-8222-222222222222";
      const headers = () => ({
        authorization: `Bearer ${app.jwt.sign({ sub, clinicId, role: "admin" })}`,
      });
      const list = (query = "") =>
        app.inject({
          method: "GET",
          url: `/satisfaction${query}`,
          headers: headers(),
        });

      const empty = await list();
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual({
        from: "2026-10-01",
        to: "2026-10-31",
        surveys: [],
        summary: {
          total: 0,
          promoters: 0,
          passives: 0,
          detractors: 0,
          nps: null,
        },
      });

      for (const score of [9, 10, 7]) {
        const created = await app.inject({
          method: "POST",
          url: "/satisfaction",
          headers: headers(),
          payload: { patientId: "99999999-9999-4999-8999-999999999999", score },
        });
        expect(created.statusCode).toBe(201);
      }
      const october = await list();
      expect(october.json()).toMatchObject({
        from: "2026-10-01",
        to: "2026-10-31",
        summary: { total: 3, promoters: 2, passives: 1, detractors: 0, nps: 67 },
      });

      vi.setSystemTime(new Date("2026-11-01T15:00:00.000Z"));
      const november = await list();
      expect(november.json()).toMatchObject({
        from: "2026-11-01",
        to: "2026-11-01",
        surveys: [],
        summary: { total: 0, nps: null },
      });

      const explicit = await list("?from=2026-10-31&to=2026-10-31");
      expect(explicit.statusCode).toBe(200);
      expect(explicit.json().summary.total).toBe(3);
      const onlyTo = await list("?to=2026-10-15");
      expect(onlyTo.json()).toMatchObject({
        from: "2026-10-01",
        to: "2026-10-15",
        summary: { total: 0 },
      });
      const onlyFrom = await list("?from=2026-10-01");
      expect(onlyFrom.json()).toMatchObject({
        from: "2026-10-01",
        to: "2026-11-01",
        summary: { total: 3 },
      });

      for (const query of [
        "?from=2026-11-01&to=2026-10-01",
        "?from=31/10/2026",
        "?to=2026-13-01",
      ]) {
        const invalid = await list(query);
        expect(invalid.statusCode).toBe(400);
        expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
      }
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the client timeline from the most recent event without clinical content", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      let clock = Date.parse("2026-09-01T12:00:00.000Z");
      vi.setSystemTime(clock);
      const tick = () => {
        clock += 60_000;
        vi.setSystemTime(clock);
      };
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const roleHeaders = (role: UserRole, clinic = clinicId) => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId: clinic, role: tokenRole(role) })}`,
      });
      const helena = "99999999-9999-4999-8999-999999999999";
      const helenaAppointment = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      const services = await app.inject({ method: "GET", url: "/services", headers });

      tick();
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/appointments/${helenaAppointment}/status`,
            headers,
            payload: { status: "completed" },
          })
        ).statusCode,
      ).toBe(200);
      const record = await app.inject({
        method: "POST",
        url: "/clinical-records",
        headers,
        payload: {
          appointmentId: helenaAppointment,
          subjective: "SEGREDO-CLINICO-SUBJETIVO",
        },
      });
      expect(record.statusCode).toBe(201);

      tick();
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: {
          patientId: helena,
          serviceId: services.json()[0].id,
          name: "Pacote linha do tempo",
          kind: "fixed_package",
          totalSessions: 4,
          validFrom: "2026-09-01",
          validUntil: "2026-09-30",
          totalValueInCents: 32000,
          installments: 1,
          firstDueDate: "2026-09-01",
        },
      });
      expect(plan.statusCode).toBe(201);
      const summary = await app.inject({ method: "GET", url: "/finance/summary", headers });
      const receivable = summary
        .json()
        .receivables.find((item: { planId?: string }) => item.planId === plan.json().id);
      tick();
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/finance/receivables/${receivable.id}/pay`,
            headers,
            payload: { paymentMethod: "pix" },
          })
        ).statusCode,
      ).toBe(200);
      tick();
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/finance/receivables/${receivable.id}/reverse`,
            headers,
          })
        ).statusCode,
      ).toBe(200);
      tick();
      const renewed = await app.inject({
        method: "POST",
        url: `/plans/${plan.json().id}/renew`,
        headers,
        payload: {
          name: "Pacote linha do tempo",
          totalSessions: 4,
          validFrom: "2026-10-01",
          validUntil: "2026-10-31",
          totalValueInCents: 34000,
          installments: 1,
          firstDueDate: "2026-10-01",
        },
      });
      expect(renewed.statusCode).toBe(201);
      tick();
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/plans/${renewed.json().id}/status`,
            headers,
            payload: { status: "cancelled" },
          })
        ).statusCode,
      ).toBe(200);
      tick();
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/relationship/activities",
            headers,
            payload: {
              patientId: helena,
              reason: "plan_expiring",
              referenceKey: plan.json().id,
              outcome: "contacted",
              notes: "Pediu retorno",
            },
          })
        ).statusCode,
      ).toBe(201);
      tick();
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/communications/messages",
            headers,
            payload: { patientId: helena, channel: "whatsapp", body: "Olá, Helena!" },
          })
        ).statusCode,
      ).toBe(201);
      tick();
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/satisfaction",
            headers,
            payload: {
              patientId: helena,
              appointmentId: helenaAppointment,
              score: 6,
              comment: "Esperou muito",
            },
          })
        ).statusCode,
      ).toBe(201);
      await app.inject({
        method: "POST",
        url: "/satisfaction",
        headers,
        payload: { patientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", score: 10 },
      });

      const response = await app.inject({
        method: "GET",
        url: `/patients/${helena}/timeline`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const timeline = response.json() as Array<{
        id: string;
        kind: string;
        occurredAt: string;
        title: string;
        detail?: string;
        amountInCents?: number;
        status?: string;
        score?: number;
      }>;
      const times = timeline.map((item) => Date.parse(item.occurredAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(response.body).not.toContain("SEGREDO-CLINICO");
      expect(timeline.filter((item) => item.kind === "satisfaction")).toEqual([
        {
          id: expect.stringMatching(/^satisfaction:/),
          kind: "satisfaction",
          occurredAt: new Date(clock).toISOString(),
          title: "Pesquisa de satisfação: nota 6",
          detail: "Esperou muito",
          score: 6,
        },
      ]);
      expect(timeline).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: `appointment:${helenaAppointment}`,
            kind: "appointment",
            status: "completed",
          }),
          expect.objectContaining({
            id: `plan_created:${plan.json().id}`,
            title: "Plano contratado: Pacote linha do tempo",
            amountInCents: 32000,
          }),
          expect.objectContaining({
            id: `plan_renewed:${renewed.json().id}`,
            kind: "plan_renewed",
            amountInCents: 34000,
          }),
          expect.objectContaining({
            id: `plan_cancelled:${renewed.json().id}`,
            kind: "plan_cancelled",
          }),
          expect.objectContaining({
            kind: "payment",
            title: "Pagamento recebido",
            amountInCents: 32000,
          }),
          expect.objectContaining({
            kind: "payment_reversal",
            amountInCents: -32000,
          }),
          expect.objectContaining({
            kind: "contact",
            detail: "Contato feito · Pediu retorno",
            status: "contacted",
          }),
          expect.objectContaining({
            kind: "message",
            detail: "Olá, Helena!",
          }),
        ]),
      );
      const recent = timeline
        .filter((item) => item.kind !== "appointment")
        .slice(0, 8)
        .map((item) => item.kind);
      expect(recent).toEqual([
        "satisfaction",
        "message",
        "contact",
        "plan_cancelled",
        "plan_renewed",
        "payment_reversal",
        "payment",
        "plan_created",
      ]);

      for (const role of ["reception", "finance"] as const) {
        const allowed = await app.inject({
          method: "GET",
          url: `/patients/${helena}/timeline`,
          headers: roleHeaders(role),
        });
        expect(allowed.statusCode).toBe(200);
      }
      const physiotherapist = await app.inject({
        method: "GET",
        url: `/patients/${helena}/timeline`,
        headers: roleHeaders("physiotherapist"),
      });
      expect(physiotherapist.statusCode).toBe(403);
      expect(physiotherapist.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
      const unauthenticated = await app.inject({
        method: "GET",
        url: `/patients/${helena}/timeline`,
      });
      expect(unauthenticated.statusCode).toBe(401);
      // Token de outra clínica: o usuário não existe lá, então a sessão é recusada (401).
      const otherClinic = await app.inject({
        method: "GET",
        url: `/patients/${helena}/timeline`,
        headers: roleHeaders("owner", "12121212-1212-4121-8121-121212121212"),
      });
      expect(otherClinic.statusCode).toBe(401);
      for (const [url, requestHeaders] of [
        ["/patients/12121212-1212-4121-8121-121212121212/timeline", headers],
        ["/patients/nao-e-uuid/timeline", headers],
      ] as const) {
        const missing = await app.inject({ method: "GET", url, headers: requestHeaders });
        expect(missing.statusCode).toBe(404);
        expect(missing.json()).toMatchObject({ code: "PATIENT_NOT_FOUND" });
      }
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("previews and imports patients from CSV and XLSX files", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const existing = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: { fullName: "Cliente Existente", phone: "21977776666", cpf: "98765432100", tags: [] },
    });
    expect(existing.statusCode).toBe(201);
    const csv = [
      "Nome;Telefone;CPF;E-mail",
      "Ana Importada;(21) 98888-1111;;ana@example.com",
      "Bruno Importado;21988882222;123.456.789-09;",
      "X;;;",
      "Outra Existente;21 97777-6666;;",
      "Ana Repetida;21988881111;;",
    ].join("\n");
    const file = { fileName: "clientes.CSV", contentBase64: Buffer.from(csv, "utf8").toString("base64") };

    const preview = await app.inject({ method: "POST", url: "/patients/import/preview", headers, payload: file });
    expect(preview.statusCode).toBe(200);
    const analysis = preview.json() as {
      rows: Array<{ line: number; status: string; duplicateOf?: { kind: string } }>;
      errors: string[];
      totals: { valid: number; error: number; duplicate: number };
    };
    expect(analysis.errors).toEqual([]);
    expect(analysis.totals).toEqual({ valid: 2, error: 1, duplicate: 2 });
    expect(analysis.rows.map((row) => [row.line, row.status])).toEqual([
      [2, "valid"],
      [3, "valid"],
      [4, "error"],
      [5, "duplicate"],
      [6, "duplicate"],
    ]);
    expect(analysis.rows[3]?.duplicateOf).toMatchObject({ kind: "existing" });
    expect(analysis.rows[4]?.duplicateOf).toMatchObject({ kind: "row" });
    // A prévia não grava nada.
    const beforeImport = await app.inject({ method: "GET", url: "/patients?search=Importad", headers });
    expect(beforeImport.json()).toEqual([]);

    const imported = await app.inject({ method: "POST", url: "/patients/import", headers, payload: file });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toEqual({ created: 2, skipped: 2, errors: 1 });
    const listed = await app.inject({ method: "GET", url: "/patients?search=Importad", headers });
    expect((listed.json() as Array<{ fullName: string }>).map((item) => item.fullName)).toEqual([
      "Ana Importada",
      "Bruno Importado",
    ]);

    const again = await app.inject({ method: "POST", url: "/patients/import", headers, payload: file });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ created: 0, skipped: 4, errors: 1 });
    const relisted = await app.inject({ method: "GET", url: "/patients?search=Importad", headers });
    expect(relisted.json()).toHaveLength(2);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Clientes");
    sheet.addRow(["Nome completo", "Celular", "Data de nascimento"]);
    sheet.addRow(["Carla Planilha", "(31) 99999-0001", "05/06/1985"]);
    sheet.addRow(["Ana Importada", "21988881111", null]);
    const xlsx = {
      fileName: "clientes.xlsx",
      contentBase64: Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64"),
    };
    const xlsxPreview = await app.inject({ method: "POST", url: "/patients/import/preview", headers, payload: xlsx });
    expect(xlsxPreview.statusCode).toBe(200);
    expect(xlsxPreview.json()).toMatchObject({
      totals: { valid: 1, error: 0, duplicate: 1 },
      rows: [
        { line: 2, status: "valid", fullName: "Carla Planilha", input: { birthDate: "1985-06-05" } },
        { line: 3, status: "duplicate", duplicateOf: { kind: "existing", field: "phone" } },
      ],
    });
    const xlsxImport = await app.inject({ method: "POST", url: "/patients/import", headers, payload: xlsx });
    expect(xlsxImport.json()).toEqual({ created: 1, skipped: 1, errors: 0 });

    const onlyErrors = {
      fileName: "erros.csv",
      contentBase64: Buffer.from("Nome;Telefone\nX;\n", "utf8").toString("base64"),
    };
    const noneValid = await app.inject({ method: "POST", url: "/patients/import", headers, payload: onlyErrors });
    expect(noneValid.statusCode).toBe(200);
    expect(noneValid.json()).toEqual({ created: 0, skipped: 0, errors: 1 });
    await app.close();
  });

  it("rejects invalid patient import files and non-commercial profiles", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const csv = Buffer.from("Nome;Telefone\nAna Importada;21988881111\n", "utf8").toString("base64");
    await seedRoleUsers(app);
    const physiotherapist = {
      authorization: `Bearer ${app.jwt.sign({
        sub: roleSub(app, "physiotherapist"),
        clinicId: "11111111-1111-4111-8111-111111111111",
        role: "user",
      })}`,
    };
    for (const url of ["/patients/import/preview", "/patients/import"]) {
      const wrongExtension = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { fileName: "clientes.pdf", contentBase64: csv },
      });
      expect(wrongExtension.statusCode).toBe(400);
      expect(wrongExtension.json()).toMatchObject({ code: "PATIENT_IMPORT_UNSUPPORTED_FILE" });

      const noExtension = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { fileName: "clientes", contentBase64: csv },
      });
      expect(noExtension.statusCode).toBe(400);
      expect(noExtension.json()).toMatchObject({ code: "PATIENT_IMPORT_UNSUPPORTED_FILE" });

      const tooLarge = await app.inject({
        method: "POST",
        url,
        headers,
        payload: {
          fileName: "grande.csv",
          contentBase64: Buffer.alloc(2 * 1024 * 1024 + 1, "a").toString("base64"),
        },
      });
      expect(tooLarge.statusCode).toBe(413);
      expect(tooLarge.json()).toMatchObject({ code: "PATIENT_IMPORT_TOO_LARGE" });

      const brokenXlsx = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { fileName: "quebrada.xlsx", contentBase64: csv },
      });
      expect(brokenXlsx.statusCode).toBe(400);
      expect(brokenXlsx.json()).toMatchObject({ code: "PATIENT_IMPORT_INVALID_FILE" });

      const missingBody = await app.inject({ method: "POST", url, headers, payload: {} });
      expect(missingBody.statusCode).toBe(400);

      const denied = await app.inject({
        method: "POST",
        url,
        headers: physiotherapist,
        payload: { fileName: "clientes.csv", contentBase64: csv },
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });

      const unauthenticated = await app.inject({
        method: "POST",
        url,
        payload: { fileName: "clientes.csv", contentBase64: csv },
      });
      expect(unauthenticated.statusCode).toBe(401);
    }
    const missingColumn = await app.inject({
      method: "POST",
      url: "/patients/import",
      headers,
      payload: {
        fileName: "sem-telefone.csv",
        contentBase64: Buffer.from("Nome\nAna Importada\n", "utf8").toString("base64"),
      },
    });
    expect(missingColumn.statusCode).toBe(400);
    expect(missingColumn.json()).toMatchObject({ code: "PATIENT_IMPORT_INVALID_FILE" });
    const list = await app.inject({ method: "GET", url: "/patients?search=Importad", headers });
    expect(list.json()).toEqual([]);
    await app.close();
  });
  describe("patient export", () => {
    const tag = "exporta-t034";
    async function setup() {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const create = async (payload: Record<string, unknown>) => {
        const response = await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload,
        });
        expect(response.statusCode).toBe(201);
        return response.json() as { id: string; recordNumber: string };
      };
      const ana = await create({
        fullName: 'Ana; "Exportada"',
        phone: "11911110001",
        email: "ana.exporta@example.com",
        birthDate: "1990-03-20",
        notes: "Linha 1\nLinha 2",
        tags: [tag, "vip"],
      });
      const bruno = await create({
        fullName: "Bruno Exportado",
        phone: "11911110002",
        birthDate: "1988-07-02",
        tags: [tag],
      });
      const carla = await create({
        fullName: "Carla Exportada",
        phone: "11911110003",
        tags: ["outra-t034"],
      });
      return { app, headers, ana, bruno, carla };
    }
    const bom = String.fromCharCode(0xfeff);
    const csvLines = (body: string) => {
      expect(body.startsWith(bom)).toBe(true);
      return body.slice(1).replace(/\r\n$/, "").split("\r\n");
    };
    const tokenHeaders = (app: Awaited<ReturnType<typeof setup>>["app"], role: UserRole) => ({
      authorization: `Bearer ${app.jwt.sign({
        sub: roleSub(app, role),
        clinicId: "11111111-1111-4111-8111-111111111111",
        role: tokenRole(role),
      })}`,
    });

    it("exports CSV with BOM, semicolons, escaping and chosen columns", async () => {
      const { app, headers, ana } = await setup();
      const all = await app.inject({
        method: "GET",
        url: `/patients/export?format=csv&tags=${tag}`,
        headers,
      });
      expect(all.statusCode).toBe(200);
      expect(all.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(all.headers["content-disposition"]).toMatch(
        /^attachment; filename="clientes-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      expect(csvLines(all.body)[0]).toBe(
        "nome;prontuário;cpf;telefone;whatsapp;email;nascimento;etiquetas;situação;contato de emergência;telefone de emergência;observações;cadastrado em",
      );
      expect(all.body).toContain(
        `\r\n"Ana; ""Exportada""";${ana.recordNumber};;11911110001;;ana.exporta@example.com;20/03/1990;${tag}, vip;ativo;;;"Linha 1\nLinha 2";`,
      );

      const chosen = await app.inject({
        method: "GET",
        url: `/patients/export?columns=phone,fullName&tags=${tag}`,
        headers,
      });
      expect(chosen.statusCode).toBe(200);
      expect(csvLines(chosen.body)).toEqual([
        "nome;telefone",
        '"Ana; ""Exportada""";11911110001',
        "Bruno Exportado;11911110002",
      ]);
      await app.close();
    });

    it("exports XLSX readable by ExcelJS", async () => {
      const { app, headers } = await setup();
      const response = await app.inject({
        method: "GET",
        url: `/patients/export?format=xlsx&columns=fullName,tags,birthDate&tags=${tag}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(response.headers["content-disposition"]).toMatch(/clientes-.*\.xlsx"$/);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.rawPayload as unknown as ArrayBuffer);
      const sheet = workbook.getWorksheet("Clientes")!;
      const values = (sheet.getSheetValues() as unknown[][])
        .slice(1)
        .map((row) => row.slice(1));
      expect(values).toEqual([
        ["nome", "nascimento", "etiquetas"],
        ['Ana; "Exportada"', "20/03/1990", `${tag}, vip`],
        ["Bruno Exportado", "02/07/1988", tag],
      ]);
      await app.close();
    });

    it("applies status, tags, birthday month, active plan and search filters", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date("2032-03-15T15:00:00.000Z"));
        const { app, headers, bruno } = await setup();
        const names = async (query: string) => {
          const response = await app.inject({
            method: "GET",
            url: `/patients/export?columns=fullName&${query}`,
            headers,
          });
          expect(response.statusCode).toBe(200);
          return csvLines(response.body).slice(1);
        };
        expect(await names(`tags=${tag},outra-t034`)).toEqual([
          '"Ana; ""Exportada"""',
          "Bruno Exportado",
          "Carla Exportada",
        ]);
        expect(await names(`tags=${tag}&birthdayMonth=true`)).toEqual([
          '"Ana; ""Exportada"""',
        ]);
        expect(await names(`tags=${tag}&birthdayMonth=false`)).toHaveLength(2);
        expect(await names("search=Bruno%20Exportado")).toEqual(["Bruno Exportado"]);

        const services = await app.inject({ method: "GET", url: "/services", headers });
        const plan = await app.inject({
          method: "POST",
          url: "/plans",
          headers,
          payload: {
            patientId: bruno.id,
            serviceId: services.json()[0].id,
            name: "Pacote exportação",
            kind: "fixed_package",
            totalSessions: 4,
            validFrom: "2032-03-15",
            totalValueInCents: 40000,
            installments: 1,
            firstDueDate: "2032-03-15",
          },
        });
        expect(plan.statusCode).toBe(201);
        expect(await names(`tags=${tag}&activePlan=true`)).toEqual(["Bruno Exportado"]);
        expect(await names(`tags=${tag}&activePlan=false`)).toEqual([
          '"Ana; ""Exportada"""',
        ]);

        const patients = (
          await app.inject({ method: "GET", url: "/patients", headers })
        ).json() as Array<{ status: string }>;
        const inactiveCount = patients.filter((item) => item.status === "inactive").length;
        expect(inactiveCount).toBeGreaterThan(0);
        const inactive = await app.inject({
          method: "GET",
          url: "/patients/export?columns=fullName,status&status=inactive",
          headers,
        });
        const inactiveRows = csvLines(inactive.body).slice(1);
        expect(inactiveRows).toHaveLength(inactiveCount);
        expect(inactiveRows.every((row) => row.endsWith(";inativo"))).toBe(true);

        const empty = await app.inject({
          method: "GET",
          url: "/patients/export?format=&status=&tags=&birthdayMonth=&activePlan=&search=&columns=",
          headers,
        });
        expect(empty.statusCode).toBe(200);
        expect(empty.headers["content-type"]).toBe("text/csv; charset=utf-8");
        const emptyLines = csvLines(empty.body);
        expect(emptyLines[0]?.split(";")).toHaveLength(13);
        expect(emptyLines).toHaveLength(patients.length + 1);
        await app.close();
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects invalid format, column and filters", async () => {
      const { app, headers } = await setup();
      for (const query of [
        "format=pdf",
        "columns=fullName,senha",
        "status=archived",
        "activePlan=sim",
        "birthdayMonth=1",
      ]) {
        const response = await app.inject({
          method: "GET",
          url: `/patients/export?${query}`,
          headers,
        });
        expect(response.statusCode, query).toBe(400);
        expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
      }
      await app.close();
    });

    it("is restricted to the owner", async () => {
      const { app } = await setup();
      await seedRoleUsers(app);
      for (const role of ["reception", "finance", "physiotherapist"] as UserRole[]) {
        const response = await app.inject({
          method: "GET",
          url: "/patients/export",
          headers: tokenHeaders(app, role),
        });
        expect(response.statusCode, role).toBe(403);
        expect(response.json()).toMatchObject({ code: "ADMIN_ACCESS_REQUIRED" });
      }
      const anonymous = await app.inject({ method: "GET", url: "/patients/export" });
      expect(anonymous.statusCode).toBe(401);
      const audit = await app.inject({
        method: "GET",
        url: "/admin/audit-events",
        headers: tokenHeaders(app, "owner"),
      });
      expect(
        (audit.json() as Array<{ action: string }>).some(
          (event) => event.action === "patients.exported",
        ),
      ).toBe(false);
      await app.close();
    });

    it("records each export in the administrative audit", async () => {
      const { app, headers } = await setup();
      const response = await app.inject({
        method: "GET",
        url: `/patients/export?format=xlsx&tags=${tag}&birthdayMonth=false&columns=fullName,phone`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const audit = await app.inject({ method: "GET", url: "/admin/audit-events", headers });
      expect(audit.statusCode).toBe(200);
      const [latest] = audit.json() as Array<Record<string, unknown>>;
      expect(latest).toMatchObject({
        action: "patients.exported",
        entityType: "patient",
        actorName: expect.any(String),
        metadata: {
          format: "xlsx",
          columns: ["fullName", "phone"],
          filters: { tags: [tag], birthdayMonth: false },
          count: 2,
        },
      });
      await app.close();
    });
  });

  describe("segmented broadcast", () => {
    const tag = "comunicado-t039";
    async function setup() {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const create = async (payload: Record<string, unknown>) => {
        const response = await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload,
        });
        expect(response.statusCode).toBe(201);
        return response.json() as { id: string; fullName: string };
      };
      const ana = await create({
        fullName: "Ana Comunicado Silva",
        phone: "11922220001",
        whatsapp: "11988880001",
        email: "ana.comunicado@example.com",
        birthDate: "1990-03-20",
        tags: [tag],
      });
      const bruno = await create({
        fullName: "Bruno Comunicado",
        phone: "11922220002",
        birthDate: "1988-07-02",
        tags: [tag],
      });
      const carla = await create({
        fullName: "Carla Comunicado",
        phone: "11922220003",
        email: "carla.comunicado@example.com",
        tags: [tag],
      });
      await create({
        fullName: "Dora Fora do Segmento",
        phone: "11922220004",
        email: "dora@example.com",
        tags: ["outra-t039"],
      });
      const optOut = await app.inject({
        method: "PUT",
        url: "/communications/preferences",
        headers,
        payload: { patientId: carla.id, channel: "email", allowed: false },
      });
      expect(optOut.statusCode).toBe(200);
      const manualCount = async () =>
        (
          (
            await app.inject({ method: "GET", url: "/communications", headers })
          ).json() as { messages: Array<{ kind: string }> }
        ).messages.filter((message) => message.kind === "manual").length;
      return { app, headers, ana, bruno, carla, manualCount };
    }

    it("previews the segment without writing, skipping opt-out and missing destination", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date("2032-03-15T15:00:00.000Z"));
        const { app, headers, ana, bruno, carla, manualCount } = await setup();
        const before = await manualCount();
        const preview = (payload: Record<string, unknown>) =>
          app.inject({
            method: "POST",
            url: "/communications/broadcast/preview",
            headers,
            payload,
          });
        const email = await preview({
          segment: { tags: [tag] },
          channel: "email",
          body: "Oi, {{nome}}! Temos novidades.",
        });
        expect(email.statusCode).toBe(200);
        expect(email.json()).toEqual({
          preview: true,
          channel: "email",
          matched: 3,
          queued: 1,
          skipped: [
            { patientId: bruno.id, patientName: bruno.fullName, reason: "no_destination" },
            { patientId: carla.id, patientName: carla.fullName, reason: "opt_out" },
          ],
          sampleBody: "Oi, Ana! Temos novidades.",
        });
        expect(await manualCount()).toBe(before);

        // O opt-out é por canal: no WhatsApp a Carla recebe.
        const whatsapp = await preview({
          segment: { tags: [tag] },
          channel: "whatsapp",
          body: "Oi, {{nome}}!",
        });
        expect(whatsapp.json()).toMatchObject({ matched: 3, queued: 3, skipped: [] });

        const birthdays = await preview({
          segment: { tags: [tag], birthdayMonth: true },
          channel: "whatsapp",
          body: "Parabéns, {{nome}}!",
        });
        expect(birthdays.json()).toMatchObject({
          matched: 1,
          queued: 1,
          sampleBody: "Parabéns, Ana!",
        });

        const withoutPlan = await preview({
          segment: { tags: [tag], activePlan: false },
          channel: "whatsapp",
          body: "Oi",
        });
        expect(withoutPlan.json()).toMatchObject({ matched: 3 });
        const services = await app.inject({ method: "GET", url: "/services", headers });
        const plan = await app.inject({
          method: "POST",
          url: "/plans",
          headers,
          payload: {
            patientId: ana.id,
            serviceId: services.json()[0].id,
            name: "Pacote comunicado",
            kind: "fixed_package",
            totalSessions: 4,
            validFrom: "2032-03-15",
            totalValueInCents: 40000,
            installments: 1,
            firstDueDate: "2032-03-15",
          },
        });
        expect(plan.statusCode).toBe(201);
        const withPlan = await preview({
          segment: { tags: [tag], activePlan: true },
          channel: "whatsapp",
          body: "Oi",
        });
        expect(withPlan.json()).toMatchObject({ matched: 1, queued: 1 });
        const noPlan = await preview({
          segment: { tags: [tag], activePlan: false },
          channel: "whatsapp",
          body: "Oi",
        });
        expect(noPlan.json()).toMatchObject({ matched: 2 });

        const inactive = await preview({
          segment: { tags: [tag], status: "inactive" },
          channel: "whatsapp",
          body: "Oi",
        });
        expect(inactive.json()).toMatchObject({ matched: 0, queued: 0, skipped: [] });
        expect(inactive.json()).not.toHaveProperty("sampleBody");
        const emptyFilters = await preview({
          segment: { tags: [tag], status: "", activePlan: "" },
          channel: "whatsapp",
          body: "Oi",
        });
        expect(emptyFilters.statusCode).toBe(200);
        expect(emptyFilters.json()).toMatchObject({ matched: 3 });
        expect(await manualCount()).toBe(before);
        await app.close();
      } finally {
        vi.useRealTimers();
      }
    });

    it("queues manual messages in the outbox with the first name filled in", async () => {
      const { app, headers, ana, carla, manualCount } = await setup();
      const before = await manualCount();
      const response = await app.inject({
        method: "POST",
        url: "/communications/broadcast",
        headers,
        payload: {
          segment: { tags: [tag] },
          channel: "email",
          body: "Oi, {{nome}}! Temos novidades.",
        },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        preview: false,
        channel: "email",
        matched: 3,
        queued: 1,
      });
      expect(response.json().skipped).toHaveLength(2);
      expect(await manualCount()).toBe(before + 1);

      const whatsapp = await app.inject({
        method: "POST",
        url: "/communications/broadcast",
        headers,
        payload: { segment: { tags: [tag] }, channel: "whatsapp", body: "Até breve, {{nome}}." },
      });
      expect(whatsapp.statusCode).toBe(201);
      expect(whatsapp.json()).toMatchObject({ queued: 3, skipped: [] });
      const center = await app.inject({ method: "GET", url: "/communications", headers });
      const messages = (
        center.json() as {
          deliveryMode: string;
          messages: Array<Record<string, unknown>>;
        }
      ).messages.filter((message) => message.kind === "manual");
      expect(center.json().deliveryMode).toBe("outbox_only");
      expect(messages).toHaveLength(before + 4);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            patientId: ana.id,
            channel: "email",
            recipient: "ana.comunicado@example.com",
            body: "Oi, Ana! Temos novidades.",
            status: "queued",
            attempts: 0,
          }),
          expect.objectContaining({
            patientId: ana.id,
            channel: "whatsapp",
            recipient: "11988880001",
            body: "Até breve, Ana.",
          }),
          expect.objectContaining({
            patientId: carla.id,
            channel: "whatsapp",
            recipient: "11922220003",
            body: "Até breve, Carla.",
          }),
        ]),
      );
      expect(
        messages.some(
          (message) => message.patientId === carla.id && message.channel === "email",
        ),
      ).toBe(false);
      await app.close();
    });

    it("skips messages that exceed the limit once the name is filled in", async () => {
      const { app, headers } = await setup();
      const created = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: { fullName: "Maximiliano Comunicado", phone: "11922220005", tags: [tag] },
      });
      expect(created.statusCode).toBe(201);
      // Modelo com 500 caracteres: "Ana", "Bruno" e "Carla" cabem; "Maximiliano" passa (503).
      const response = await app.inject({
        method: "POST",
        url: "/communications/broadcast/preview",
        headers,
        payload: {
          segment: { tags: [tag] },
          channel: "whatsapp",
          body: `{{nome}}${"x".repeat(492)}`,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        matched: 4,
        queued: 3,
        skipped: [
          {
            patientId: created.json().id,
            patientName: "Maximiliano Comunicado",
            reason: "message_too_long",
          },
        ],
      });
      await app.close();
    });

    it("validates the input and requires commercial access", async () => {
      const { app, headers } = await setup();
      for (const payload of [
        { channel: "sms", body: "Oi" },
        { channel: "email", body: "  " },
        { channel: "email", body: "x".repeat(501) },
        { segment: { status: "archived" }, channel: "email", body: "Oi" },
        { segment: { activePlan: "sim" }, channel: "email", body: "Oi" },
      ]) {
        for (const url of ["/communications/broadcast/preview", "/communications/broadcast"]) {
          const response = await app.inject({ method: "POST", url, headers, payload });
          expect(response.statusCode, JSON.stringify(payload)).toBe(400);
          expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
        }
      }
      await seedRoleUsers(app);
      const physiotherapist = {
        authorization: `Bearer ${app.jwt.sign({
          sub: roleSub(app, "physiotherapist"),
          clinicId: "11111111-1111-4111-8111-111111111111",
          role: "user" as const,
        })}`,
      };
      const payload = { segment: { tags: [tag] }, channel: "whatsapp", body: "Oi" };
      for (const url of ["/communications/broadcast/preview", "/communications/broadcast"]) {
        const denied = await app.inject({
          method: "POST",
          url,
          headers: physiotherapist,
          payload,
        });
        expect(denied.statusCode).toBe(403);
        expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
        const anonymous = await app.inject({ method: "POST", url, payload });
        expect(anonymous.statusCode).toBe(401);
      }
      await app.close();
    });
  });

  describe("module permissions per user", () => {
    async function createUser(
      app: TestApp,
      ownerHeaders: Record<string, string>,
      payload: Record<string, unknown>,
    ) {
      const email = `${String(payload.role)}.${Math.random().toString(36).slice(2)}@teste.local`;
      // Perfil antigo como atalho: usuário comum com os módulos que o perfil tinha.
      const { role, ...rest } = payload;
      const legacy = (["reception", "physiotherapist", "finance"] as const).find(
        (item) => item === role,
      );
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
        payload: { fullName: "Usuária Teste", email, password: "SenhaForte123", ...body },
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
    const newPatient = { fullName: "Cliente Permissão", phone: "11977770000" };

    it("lets a reception user with the finance module use /finance", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const plain = await createUser(app, owner, { role: "reception" });
      const denied = await app.inject({ method: "GET", url: "/finance/workspace", headers: plain.headers });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "FINANCE_ACCESS_DENIED" });

      const withFinance = await createUser(app, owner, {
        role: "reception",
        modules: ["agenda", "patients", "finance"],
        editModules: ["agenda", "patients", "finance"],
      });
      for (const url of ["/finance/workspace", "/finance/summary", "/finance/daily-cash"]) {
        const allowed = await app.inject({ method: "GET", url, headers: withFinance.headers });
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
        ["/patients/export", "ADMIN_ACCESS_REQUIRED"],
        ["/reports/management", "MANAGEMENT_ACCESS_DENIED"],
      ] as const) {
        const denied = await app.inject({ method: "HEAD", url, headers: reception.headers });
        expect(denied.statusCode, url).toBe(403);
        const get = await app.inject({ method: "GET", url, headers: reception.headers });
        expect(get.json(), url).toMatchObject({ code });
        expect((await app.inject({ method: "HEAD", url })).statusCode, url).toBe(401);
      }
      for (const url of ["/admin/users", "/finance/workspace"]) {
        const allowed = await app.inject({ method: "HEAD", url, headers: owner });
        expect(allowed.statusCode, url).toBe(200);
      }
      const withFinance = await createUser(app, owner, {
        role: "reception",
        modules: ["agenda", "finance"],
        editModules: ["agenda", "finance"],
      });
      const financeHead = await app.inject({ method: "HEAD", url: "/finance/workspace", headers: withFinance.headers });
      expect(financeHead.statusCode).toBe(200);
      await app.close();
    });

    it("refuses /patients to a user without the patients module", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const user = await createUser(app, owner, { role: "reception", modules: ["agenda", "crm"] });
      const list = await app.inject({ method: "GET", url: "/patients", headers: user.headers });
      expect(list.statusCode).toBe(403);
      expect(list.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
      const create = await app.inject({ method: "POST", url: "/patients", headers: user.headers, payload: newPatient });
      expect(create.statusCode).toBe(403);
      await app.close();
    });

    it("reads relationship settings with Contatos sugeridos or Configurações", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      for (const modules of [["relationship"], ["settings"]]) {
        const user = await createUser(app, owner, { role: "reception", modules });
        const read = await app.inject({ method: "GET", url: "/relationship/settings", headers: user.headers });
        expect(read.statusCode, modules.join()).toBe(200);
        expect(read.json()).toEqual(defaultRelationshipSettings);
        const head = await app.inject({ method: "HEAD", url: "/relationship/settings", headers: user.headers });
        expect(head.statusCode, modules.join()).toBe(200);
        const write = await app.inject({
          method: "PUT",
          url: "/relationship/settings",
          headers: user.headers,
          payload: defaultRelationshipSettings,
        });
        expect(write.statusCode).toBe(403);
      }
      const without = await createUser(app, owner, { role: "reception", modules: ["agenda", "crm"] });
      const denied = await app.inject({ method: "GET", url: "/relationship/settings", headers: without.headers });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
      expect(denied.json().message).toContain("Contatos sugeridos");
      const deniedHead = await app.inject({ method: "HEAD", url: "/relationship/settings", headers: without.headers });
      expect(deniedHead.statusCode).toBe(403);
      await app.close();
    });

    it("lists minimal client options to whoever sees a module that picks clients", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const full = (await app.inject({ method: "GET", url: "/patients", headers: owner })).json() as Array<{
        id: string;
        fullName: string;
        tags: string[];
      }>;
      expect(full.length).toBeGreaterThan(0);
      for (const module of ["agenda", "communications", "contracts", "groups", "patients"]) {
        const user = await createUser(app, owner, { role: "reception", modules: [module] });
        const options = await app.inject({ method: "GET", url: "/patients/options", headers: user.headers });
        expect(options.statusCode, module).toBe(200);
        const body = options.json() as Array<Record<string, unknown>>;
        expect(body).toEqual(full.map(({ id, fullName, tags }) => ({ id, fullName, tags })));
        for (const item of body) expect(Object.keys(item).sort()).toEqual(["fullName", "id", "tags"]);
        const head = await app.inject({ method: "HEAD", url: "/patients/options", headers: user.headers });
        expect(head.statusCode, module).toBe(200);
        if (module !== "patients") {
          const list = await app.inject({ method: "GET", url: "/patients", headers: user.headers });
          expect(list.statusCode, module).toBe(403);
        }
      }
      const crmOnly = await createUser(app, owner, { role: "reception", modules: ["crm", "finance"] });
      const denied = await app.inject({ method: "GET", url: "/patients/options", headers: crmOnly.headers });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
      expect((await app.inject({ method: "HEAD", url: "/patients/options", headers: crmOnly.headers })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: "/patients/options" })).statusCode).toBe(401);
      await app.close();
    });

    it("lets the default physiotherapist read clients but not save them", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const physio = await createUser(app, owner, { role: "physiotherapist" });
      const list = await app.inject({ method: "GET", url: "/patients", headers: physio.headers });
      expect(list.statusCode).toBe(200);
      const patientId = (list.json() as Array<{ id: string }>)[0]!.id;
      const create = await app.inject({ method: "POST", url: "/patients", headers: physio.headers, payload: newPatient });
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
      expect((await app.inject({ method: "GET", url: "/dashboard", headers: physio.headers })).statusCode).toBe(200);
      await app.close();
    });

    it("lets a physiotherapist with patients editing create clients", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const physio = await createUser(app, owner, {
        role: "physiotherapist",
        editModules: ["agenda", "groups", "clinical", "patients"],
      });
      const create = await app.inject({ method: "POST", url: "/patients", headers: physio.headers, payload: newPatient });
      expect(create.statusCode).toBe(201);
      await app.close();
    });

    it("applies module changes and deactivation without a new login", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const physio = await createUser(app, owner, { role: "physiotherapist" });
      const before = await app.inject({ method: "POST", url: "/patients", headers: physio.headers, payload: newPatient });
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
      const after = await app.inject({ method: "POST", url: "/patients", headers: physio.headers, payload: newPatient });
      expect(after.statusCode).toBe(201);

      const deactivated = await app.inject({
        method: "PATCH",
        url: `/admin/users/${physio.id}`,
        headers: owner,
        payload: { fullName: "Usuária Teste", role: "user", active: false },
      });
      expect(deactivated.statusCode).toBe(200);
      for (const url of ["/patients", "/dashboard", "/me"]) {
        const refused = await app.inject({ method: "GET", url, headers: physio.headers });
        expect(refused.statusCode, url).toBe(401);
        expect(refused.json()).toMatchObject({ code: "UNAUTHORIZED" });
      }
      await app.close();
    });

    it("starts a new common user without any module (only the overview)", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const user = await createUser(app, owner, { role: "user" });
      const me = await app.inject({ method: "GET", url: "/me", headers: user.headers });
      expect(me.json()).toMatchObject({ role: "user", modules: [], editModules: [] });
      expect((await app.inject({ method: "GET", url: "/dashboard", headers: user.headers })).statusCode).toBe(200);
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
        const denied = await app.inject({ method: "GET", url, headers: user.headers });
        expect(denied.statusCode, url).toBe(403);
      }
      for (const url of ["/admin/users", "/admin/clinic-settings", "/admin/audit-events", "/patients/export"]) {
        const get = await app.inject({ method: "GET", url, headers: user.headers });
        expect(get.statusCode, url).toBe(403);
        expect(get.json(), url).toMatchObject({ code: "ADMIN_ACCESS_REQUIRED" });
        expect((await app.inject({ method: "HEAD", url, headers: user.headers })).statusCode, url).toBe(403);
      }
      // Nem com todos os módulos o usuário comum entra na Administração.
      const full = await createUser(app, owner, {
        role: "user",
        modules: appModuleSchema.options,
        editModules: appModuleSchema.options,
      });
      expect((await app.inject({ method: "GET", url: "/finance/workspace", headers: full.headers })).statusCode).toBe(200);
      for (const url of ["/admin/users", "/admin/permission-matrix"]) {
        expect((await app.inject({ method: "GET", url, headers: full.headers })).statusCode, url).toBe(403);
        expect((await app.inject({ method: "HEAD", url, headers: full.headers })).statusCode, url).toBe(403);
      }
      await app.close();
    });

    it("gives an admin every module and the administration, ignoring stored lists", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const admin = await createUser(app, owner, { role: "admin", modules: ["agenda"], editModules: [] });
      const me = await app.inject({ method: "GET", url: "/me", headers: admin.headers });
      expect(me.json()).toMatchObject({
        role: "admin",
        modules: appModuleSchema.options,
        editModules: appModuleSchema.options,
      });
      for (const url of ["/admin/users", "/admin/audit-events", "/finance/workspace", "/leads", "/plans"]) {
        expect((await app.inject({ method: "GET", url, headers: admin.headers })).statusCode, url).toBe(200);
        expect((await app.inject({ method: "HEAD", url, headers: admin.headers })).statusCode, url).toBe(200);
      }
      const listed = (await app.inject({ method: "GET", url: "/admin/users", headers: owner })).json() as Array<{
        id: string;
        customModules: boolean;
      }>;
      expect(listed.find((item) => item.id === admin.id)?.customModules).toBe(false);
      await app.close();
    });

    it("never lets the clinic lose its last active admin", async () => {
      const { app, token } = await authenticatedApp();
      const owner = { authorization: `Bearer ${token}` };
      const patch = (id: string, headers: Record<string, string>, payload: Record<string, unknown>) =>
        app.inject({
          method: "PATCH",
          url: `/admin/users/${id}`,
          headers,
          payload: { fullName: "Usuária Teste", ...payload },
        });
      const demoted = await patch(OWNER_ID, owner, { fullName: "Aryana Dutra", role: "user", active: true });
      expect(demoted.statusCode).toBe(409);
      expect(demoted.json()).toMatchObject({ code: "LAST_ADMIN" });
      expect((await app.inject({ method: "GET", url: "/admin/users", headers: owner })).statusCode).toBe(200);

      // Com outro admin ativo dá para rebaixar; admin desativado não conta.
      const second = await createUser(app, owner, { role: "admin" });
      expect((await patch(second.id, owner, { role: "admin", active: false })).statusCode).toBe(200);
      const stillLast = await patch(OWNER_ID, owner, { fullName: "Aryana Dutra", role: "user", active: true });
      expect(stillLast.statusCode).toBe(409);
      expect(stillLast.json()).toMatchObject({ code: "LAST_ADMIN" });
      expect((await patch(second.id, owner, { role: "admin", active: true })).statusCode).toBe(200);
      const handedOver = await patch(OWNER_ID, owner, { fullName: "Aryana Dutra", role: "user", active: true });
      expect(handedOver.statusCode).toBe(200);
      expect(handedOver.json()).toMatchObject({ role: "user", modules: [] });
      // A ex-admin perde a Administração na hora; a nova admin não pode se rebaixar nem desativar a última.
      expect((await app.inject({ method: "GET", url: "/admin/users", headers: owner })).statusCode).toBe(403);
      const selfDemotion = await patch(second.id, second.headers, { role: "user", active: true });
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
});
