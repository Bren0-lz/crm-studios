import { describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { runBranchScenario } from "../../test-support/branch-scenario.js";
import {
  authenticatedApp,
  type TestApp,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

type Headers = Record<string, string>;

async function setup() {
  const { app, token } = await authenticatedApp();
  const admin: Headers = { authorization: `Bearer ${token}` };
  const branches = await app.inject({
    method: "GET",
    url: "/branches",
    headers: admin,
  });
  expect(branches.statusCode).toBe(200);
  const matriz = (branches.json() as { id: string; isDefault: boolean }[])[0]!;
  expect(matriz.isDefault).toBe(true);
  const created = await app.inject({
    method: "POST",
    url: "/admin/branches",
    headers: admin,
    payload: { name: "Centro", address: "Rua A, 10" },
  });
  expect(created.statusCode, created.body).toBe(201);
  const centro = created.json() as { id: string };
  return { app, admin, matrizId: matriz.id, centroId: centro.id };
}

const inBranch = (headers: Headers, branchId: string): Headers => ({
  ...headers,
  "x-branch-id": branchId,
});

async function createResources(app: TestApp, headers: Headers) {
  const professional = await app.inject({
    method: "POST",
    url: "/professionals",
    headers,
    payload: {
      fullName: "Dra. Centro",
      crefito: "CREFITO-3 999999-F",
      specialty: "Pilates",
      color: "#336699",
    },
  });
  expect(professional.statusCode, professional.body).toBe(201);
  const room = await app.inject({
    method: "POST",
    url: "/rooms",
    headers,
    payload: { name: "Sala Movimento", capacity: 1 },
  });
  expect(room.statusCode, room.body).toBe(201);
  return {
    professional: professional.json() as { id: string; branchId: string },
    room: room.json() as { id: string; branchId: string },
  };
}

function nextWeekAt(hour: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

describe("branches", () => {
  it("keeps professionals, rooms and appointments in their branch and consolidates without the header", async () => {
    const { app, admin, matrizId, centroId } = await setup();
    const centro = inBranch(admin, centroId);
    const matriz = inBranch(admin, matrizId);
    // Mesmo nome de sala da Matriz: nomes únicos valem dentro da filial.
    const { professional, room } = await createResources(app, centro);
    expect(professional.branchId).toBe(centroId);
    expect(room.branchId).toBe(centroId);

    const ids = async (url: string, headers: Headers) =>
      (
        (await app.inject({ method: "GET", url, headers })).json() as {
          id: string;
        }[]
      ).map((item) => item.id);
    expect(await ids("/professionals", centro)).toEqual([professional.id]);
    expect(await ids("/professionals", matriz)).not.toContain(professional.id);
    expect(await ids("/professionals", admin)).toContain(professional.id);
    expect(await ids("/rooms", centro)).toEqual([room.id]);

    const patients = (
      await app.inject({ method: "GET", url: "/patients", headers: admin })
    ).json() as { id: string }[];
    const services = (
      await app.inject({ method: "GET", url: "/services", headers: admin })
    ).json() as { id: string }[];
    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: centro,
      payload: {
        patientId: patients[0]!.id,
        professionalId: professional.id,
        roomId: room.id,
        serviceId: services[0]!.id,
        startsAt: nextWeekAt(13),
      },
    });
    expect(appointment.statusCode, appointment.body).toBe(201);
    expect(appointment.json().branchId).toBe(centroId);

    const range = `from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(nextWeekAt(23))}`;
    expect(await ids(`/appointments?${range}`, centro)).toEqual([
      appointment.json().id,
    ]);
    expect(await ids(`/appointments?${range}`, matriz)).not.toContain(
      appointment.json().id,
    );
    // "all" = histórico consolidado (ficha do cliente).
    expect(
      await ids(`/appointments?${range}`, inBranch(admin, "all")),
    ).toContain(appointment.json().id);

    const matrizProfessional = (
      await app.inject({
        method: "GET",
        url: "/professionals",
        headers: matriz,
      })
    ).json()[0] as { id: string };
    const mixed = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: admin,
      payload: {
        patientId: patients[0]!.id,
        professionalId: matrizProfessional.id,
        roomId: room.id,
        serviceId: services[0]!.id,
        startsAt: nextWeekAt(15),
      },
    });
    expect(mixed.statusCode).toBe(409);
    expect(mixed.json().code).toBe("BRANCH_MISMATCH");
    await app.close();
  });

  it("limits a user to the branches granted by the admin", async () => {
    const { app, admin, matrizId, centroId } = await setup();
    await createResources(app, inBranch(admin, centroId));
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: admin,
      payload: {
        fullName: "Recepção Centro",
        email: "recepcao.centro@teste.local",
        role: "user",
        password: "SenhaForte123",
        modules: ["agenda"],
        editModules: ["agenda"],
        branchAccess: { allBranches: false, branchIds: [centroId] },
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({
      allBranches: false,
      branchIds: [centroId],
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "recepcao.centro@teste.local",
        password: "SenhaForte123",
      },
    });
    const user: Headers = {
      authorization: `Bearer ${login.json().token as string}`,
    };
    const branches = await app.inject({
      method: "GET",
      url: "/branches",
      headers: user,
    });
    expect(branches.json().map((item: { id: string }) => item.id)).toEqual([
      centroId,
    ]);
    const denied = await app.inject({
      method: "GET",
      url: "/professionals",
      headers: inBranch(user, matrizId),
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("BRANCH_ACCESS_DENIED");
    const professionals = await app.inject({
      method: "GET",
      url: "/professionals",
      headers: user,
    });
    expect(
      professionals.json().map((item: { fullName: string }) => item.fullName),
    ).toEqual(["Dra. Centro"]);
    await app.close();
  });

  it("refuses to deactivate the default branch or to repeat a name", async () => {
    const { app, admin, matrizId } = await setup();
    const inactive = await app.inject({
      method: "PUT",
      url: `/admin/branches/${matrizId}`,
      headers: admin,
      payload: { name: "Matriz", active: false },
    });
    expect(inactive.statusCode).toBe(409);
    expect(inactive.json().code).toBe("BRANCH_DEFAULT_INACTIVE");
    const duplicate = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers: admin,
      payload: { name: "centro" },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe("BRANCH_NAME_DUPLICATE");
    await app.close();
  });
});

describe("branches in the memory repository", () => {
  it("separates registrations, agenda, inventory, commercial and finance by branch", async () => {
    await runBranchScenario(new MemoryClinicRepository());
  });
});
