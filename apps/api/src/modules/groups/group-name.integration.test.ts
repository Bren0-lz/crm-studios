import { groupClassName, type PermissionKey } from "@crm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup(permissions: PermissionKey[]) {
  const repository = new MemoryClinicRepository(false);
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const user = await repository.createAdminUser(
    clinicId,
    actorId,
    {
      fullName: "Usuário Turmas",
      email: "turmas@example.com",
      password: "Password123",
      role: "user",
      permissions,
    },
    "unused-hash",
  );
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
  };
  const adminHeaders = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  const [service] = await repository.listServices(clinicId);
  const [professional] = await repository.listProfessionals(clinicId);
  const [room] = await repository.listRooms(clinicId);
  const input = {
    serviceId: service!.id,
    professionalId: professional!.id,
    roomId: room!.id,
    capacity: 1,
    weeklySlots: [{ weekday: 2, startTime: "06:00", endTime: "07:00" }],
  };
  return { app, repository, headers, adminHeaders, input, service: service! };
}

describe("group naming authorization", () => {
  it("allows existing creation but requires an explicit grant for a custom name", async () => {
    const { app, headers, input, service } = await setup([
      "groups.view",
      "groups.create",
    ]);
    const denied = await app.inject({
      method: "POST",
      url: "/groups",
      headers,
      payload: { ...input, name: "Personalizada" },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().details.permission).toBe("groups.rename");
    const created = await app.inject({
      method: "POST",
      url: "/groups",
      headers,
      payload: input,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().name).toBe(groupClassName(service.name, 1));
  });

  it("permits renaming without granting creation or schedule editing and audits the command", async () => {
    const { app, repository, headers, adminHeaders, input } = await setup([
      "groups.view",
      "groups.rename",
    ]);
    const created = await app.inject({
      method: "POST",
      url: "/groups",
      headers: adminHeaders,
      payload: { ...input, name: "  Pilates inicial  " },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().name).toBe("Pilates inicial");
    const group = created.json();
    const audit = vi.spyOn(repository, "recordAdminAuditEvent");
    const renamed = await app.inject({
      method: "PATCH",
      url: `/groups/${group.id}/name`,
      headers,
      payload: { name: "  Pilates manhã  " },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ ...group, name: "Pilates manhã" });
    expect(audit).toHaveBeenCalledWith(
      clinicId,
      expect.any(String),
      "operation.groups.rename",
      "groups",
      expect.objectContaining({ subjectName: "Pilates manhã" }),
      group.id,
    );
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/groups/${group.id}`,
          headers,
          payload: input,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/groups",
          headers,
          payload: input,
        })
      ).statusCode,
    ).toBe(403);
  });

  it("rejects names without permission and cannot rename through the schedule endpoint", async () => {
    const { app, repository, headers, input } = await setup([
      "groups.view",
      "groups.update",
    ]);
    const group = await repository.createGroupClass(clinicId, input);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/groups/${group.id}/name`,
          headers,
          payload: { name: "Proibido" },
        })
      ).statusCode,
    ).toBe(403);
    const updated = await app.inject({
      method: "PUT",
      url: `/groups/${group.id}`,
      headers,
      payload: {
        capacity: input.capacity,
        weeklySlots: input.weeklySlots,
        name: "Proibido",
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe(group.name);
  });

  it("validates names, missing groups and branch access", async () => {
    const { app, repository, headers, input } = await setup([
      "groups.view",
      "groups.rename",
    ]);
    const group = await repository.createGroupClass(clinicId, input);
    const url = `/groups/${group.id}/name`;
    for (const payload of [
      { name: " " },
      { name: "a".repeat(121) },
      { name: "Nome", capacity: 99 },
    ])
      expect(
        (await app.inject({ method: "PATCH", url, headers, payload }))
          .statusCode,
      ).toBe(400);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/groups/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/name",
          headers,
          payload: { name: "Nome" },
        })
      ).statusCode,
    ).toBe(404);
    const branch = (await repository.saveBranch(clinicId, actorId, {
      name: "Outra filial",
    }))!;
    const denied = await app.inject({
      method: "PATCH",
      url,
      headers: { ...headers, "X-Branch-Id": branch.id },
      payload: { name: "Nome" },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("BRANCH_ACCESS_DENIED");
  });
});
