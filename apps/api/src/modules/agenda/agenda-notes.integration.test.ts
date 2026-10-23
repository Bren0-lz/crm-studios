import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import {
  noteClinicId as clinicId,
  noteOwnerId as actor,
  noteInput,
  verifyAgendaNotesRepository,
} from "../../test-support/agenda-notes-suite.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actor, clinicId, role: "admin" })}`,
  };
  return { app, repository, headers };
}
describe("agenda notes", () => {
  it("persists series, scopes, tenant isolation and history in memory", async () => {
    await verifyAgendaNotesRepository(new MemoryClinicRepository());
  });
  it("validates API input and scope; rejects a recurrence atomically", async () => {
    const { app, headers, repository } = await setup();
    for (const patch of [
      { description: " " },
      { backgroundColor: "#123456" },
      { endsAt: noteInput.startsAt },
      { professionalId: "99999999-9999-4999-8999-999999999999" },
    ]) {
      const result = await app.inject({
        method: "POST",
        url: "/agenda-notes",
        headers,
        payload: { ...noteInput, ...patch },
      });
      expect(result.statusCode).toBe(patch.professionalId ? 404 : 400);
    }
    const excessive = await app.inject({
      method: "POST",
      url: "/agenda-notes",
      headers,
      payload: {
        ...noteInput,
        repeat: { until: "2039-10-30", weekdays: [0, 1, 2, 3, 4, 5, 6] },
      },
    });
    expect(excessive.statusCode).toBe(400);
    expect(
      await repository.listAgendaNotes(
        clinicId,
        "2038-01-01T00:00:00Z",
        "2040-01-01T00:00:00Z",
      ),
    ).toEqual([]);
    const created = await app.inject({
      method: "POST",
      url: "/agenda-notes",
      headers,
      payload: noteInput,
    });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json()[0].id as string;
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/agenda-notes/${id}`,
          headers,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/agenda-notes/${id}?scope=this`,
          headers,
          payload: { ...noteInput, description: "Editada" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/agenda-notes/${id}?scope=this`,
          headers,
        })
      ).statusCode,
    ).toBe(204);
  });
  it("restricts a linked professional to own notes, permits shared reads and denies ungranted writes", async () => {
    const { app, repository } = await setup();
    const professionals = await repository.listProfessionals(clinicId);
    const user = await repository.createAdminUser(
      clinicId,
      actor,
      {
        fullName: "Profissional teste",
        email: "notes@example.com",
        password: "Password123",
        role: "user",
        permissions: ["agenda.view", "agenda.notes"],
      },
      "unused-hash",
    );
    await repository.setAdminUserProfessional(
      clinicId,
      actor,
      user.id,
      professionals[0]!.id,
    );
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    const own = await repository.createAgendaNotes(clinicId, actor, {
      ...noteInput,
      professionalId: professionals[0]!.id,
      repeat: undefined,
    });
    const other = await repository.createAgendaNotes(clinicId, actor, {
      ...noteInput,
      professionalId: professionals[1]!.id,
    });
    const shared = await repository.createAgendaNotes(clinicId, actor, {
      ...noteInput,
      repeat: undefined,
    });
    const list = await app.inject({
      method: "GET",
      url: "/agenda-notes?from=2038-10-01T00:00:00Z&to=2038-11-01T00:00:00Z",
      headers,
    });
    expect(list.statusCode).toBe(200);
    expect(
      list
        .json()
        .map((item: { id: string }) => item.id)
        .sort(),
    ).toEqual([own[0]!.id, shared[0]!.id].sort());
    for (const item of [other[0]!, shared[0]!]) {
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/agenda-notes/${item.id}?scope=following`,
            headers,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/agenda-notes/${item.id}?scope=following`,
            headers,
            payload: { ...noteInput, professionalId: professionals[0]!.id },
          })
        ).statusCode,
      ).toBe(404);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/agenda-notes",
          headers,
          payload: noteInput,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/agenda-notes",
          headers,
          payload: { ...noteInput, professionalId: professionals[0]!.id },
        })
      ).statusCode,
    ).toBe(201);
    await repository.updateAdminUser(clinicId, actor, user.id, {
      fullName: user.fullName,
      role: "user",
      active: true,
      permissions: ["agenda.view"],
    });
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/agenda-notes/${own[0]!.id}?scope=this`,
          headers,
        })
      ).statusCode,
    ).toBe(403);
  });
});
