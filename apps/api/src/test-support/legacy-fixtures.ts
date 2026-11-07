import { expect } from "vitest";
import { buildApp } from "../app.js";
import { MemoryClinicRepository } from "../memory-repository.js";
import {
  type LegacyRole,
  legacyRoleDefaultEditModules,
  legacyRoleDefaultModules,
} from "../modules/administration/legacy-roles.js";

/**
 * Os testes de acesso usam os perfis antigos como "fixtures": cada um vira um usuário real com
 * os módulos que o perfil tinha (o que a migração 0042 gravou). `owner` = o admin demo.
 */
export type UserRole = LegacyRole;

/** Tipo no token (a API relê o tipo e os módulos do usuário a cada requisição). */
export const tokenRole = (role: LegacyRole): "admin" | "user" =>
  role === "owner" ? "admin" : "user";

export async function configuredPlan<
  T extends {
    name: string;
    totalValueInCents: number;
    serviceId: string;
    totalSessions: number;
  },
>(
  app: TestApp,
  input: T,
): Promise<
  T & {
    planTemplateId: string;
    services: {
      serviceId: string;
      totalSessions: number;
      totalValueInCents: number;
    }[];
  }
> {
  const token = app.jwt.sign({
    sub: OWNER_ID,
    clinicId: "11111111-1111-4111-8111-111111111111",
    role: "admin",
  });
  const response = await app.inject({
    method: "POST",
    url: "/plan-templates",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      name: input.name,
      totalValueInCents: input.totalValueInCents,
      services: [
        {
          serviceId: input.serviceId,
          totalSessions: input.totalSessions,
          totalValueInCents: input.totalValueInCents,
        },
      ],
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  return {
    ...input,
    services: [
      {
        serviceId: input.serviceId,
        totalSessions: input.totalSessions,
        totalValueInCents: input.totalValueInCents,
      },
    ],
    planTemplateId: response.json().id as string,
  };
}

export async function authenticatedApp() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({
    repository,
    logger: false,
  });
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@movimenta.local", password: "Admin@123" },
  });
  return { app, token: response.json().token as string, repository };
}

export const OWNER_ID = "22222222-2222-4222-8222-222222222222";

export type TestApp = Awaited<ReturnType<typeof buildApp>>;

export const roleUserIds = new WeakMap<TestApp, Record<UserRole, string>>();

/**
 * A API relê o usuário do token a cada requisição (perfil, módulos, ativo): tokens de outros
 * perfis precisam ser de usuários reais. Cria uma usuária de cada perfil (uma vez por app).
 */
export async function seedRoleUsers(app: TestApp) {
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
export function roleSub(app: TestApp, role: UserRole) {
  const ids = roleUserIds.get(app);
  if (!ids) throw new Error("Chame seedRoleUsers(app) antes de roleSub.");
  return ids[role];
}

/** Configura as etiquetas (T062: o cadastro do cliente só aceita etiquetas configuradas). */
export async function configureTags(
  app: TestApp,
  headers: Record<string, string>,
  names: string[],
) {
  for (const name of names) {
    const created = await app.inject({
      method: "POST",
      url: "/patient-tags",
      headers,
      payload: { name },
    });
    expect(created.statusCode, name).toBe(201);
  }
}
