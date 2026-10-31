import { randomUUID } from "node:crypto";
import type { AdminUser, PayrollEmployee } from "@crm/contracts";
import type { FastifyInstance } from "fastify";
import type { ClinicRepository } from "../repository.js";

/**
 * Colaborador da folha como o sistema cria: um usuário com salário (Administração › Usuários),
 * opcionalmente ligado a um profissional da agenda e restrito a uma filial.
 */
export async function createSalariedUser(
  repo: ClinicRepository,
  clinicId: string,
  actorId: string,
  input: {
    name: string;
    role?: string;
    salaryInCents: number | null;
    professionalId?: string;
    branchId?: string;
  },
) {
  const created = await repo.createAdminUser(
    clinicId,
    actorId,
    {
      fullName: input.name,
      email: `folha-${randomUUID()}@studios.test`,
      role: "user",
      password: "senha-de-teste",
      ...(input.role ? { jobTitle: input.role } : {}),
      ...(input.branchId
        ? { branchAccess: { allBranches: false, branchIds: [input.branchId] } }
        : {}),
      salaryInCents: input.salaryInCents,
    },
    "hash-de-teste",
  );
  const user = input.professionalId
    ? (await repo.setAdminUserProfessional(
        clinicId,
        actorId,
        created.id,
        input.professionalId,
      ))!
    : created;
  const employee = (await repo.listPayrollEmployees(clinicId)).find(
    (item) => item.userId === user.id,
  )!;
  return { user, employee };
}

/**
 * Pela API: põe na folha o usuário ligado ao profissional (ou cria um usuário com salário e o
 * liga). Devolve o id do colaborador da folha.
 */
export async function salariedEmployeeViaApi(
  app: FastifyInstance,
  headers: Record<string, string>,
  input: {
    name: string;
    professionalId?: string;
    salaryInCents: number | null;
  },
) {
  const users = (
    await app.inject({ method: "GET", url: "/admin/users", headers })
  ).json<AdminUser[]>();
  const owner = input.professionalId
    ? users.find((item) => item.professionalId === input.professionalId)
    : undefined;
  const saved = owner
    ? await app.inject({
        method: "PATCH",
        url: `/admin/users/${owner.id}`,
        headers,
        payload: {
          fullName: owner.fullName,
          role: owner.role,
          active: owner.active,
          salaryInCents: input.salaryInCents,
        },
      })
    : await app.inject({
        method: "POST",
        url: "/admin/users",
        headers,
        payload: {
          fullName: input.name,
          email: `folha-${randomUUID()}@studios.test`,
          role: "user",
          password: "senha-de-teste",
          salaryInCents: input.salaryInCents,
        },
      });
  if (saved.statusCode >= 300) throw new Error(saved.body);
  const userId = saved.json<AdminUser>().id;
  if (input.professionalId && !owner) {
    const linked = await app.inject({
      method: "PUT",
      url: `/admin/users/${userId}/professional`,
      headers,
      payload: { professionalId: input.professionalId },
    });
    if (linked.statusCode >= 300) throw new Error(linked.body);
  }
  const employees = (
    await app.inject({
      method: "GET",
      url: "/finance/payroll/employees",
      headers,
    })
  ).json<PayrollEmployee[]>();
  return employees.find((item) => item.userId === userId)!.id;
}
