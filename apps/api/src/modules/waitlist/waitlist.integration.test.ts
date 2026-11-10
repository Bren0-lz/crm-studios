import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  verifyWaitlistRepository,
  waitlistActorId as actor,
  waitlistClinicId as clinicId,
} from "../../test-support/waitlist-suite.js";

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
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Carla Espera",
    phone: "11977776666",
    tags: [],
  });
  const [service] = await repository.listServices(clinicId);
  return { app, repository, headers, patient, service: service! };
}

describe("lista de espera", () => {
  it("mantém filas por item, recusa duplicados e isola clínicas em memória", async () => {
    await verifyWaitlistRepository(new MemoryClinicRepository());
  });

  it("valida a entrada, atualiza a situação e remove pela API", async () => {
    const { app, headers, patient, service } = await setup();
    for (const payload of [
      { patientId: patient.id, kind: "service" },
      { patientId: patient.id, kind: "product" },
      { patientId: patient.id, kind: "turma", serviceId: service.id },
      {
        patientId: patient.id,
        kind: "service",
        serviceId: service.id,
        notes: "x".repeat(501),
      },
    ]) {
      const result = await app.inject({
        method: "POST",
        url: "/waitlist",
        headers,
        payload,
      });
      expect(result.statusCode).toBe(400);
    }
    const created = await app.inject({
      method: "POST",
      url: "/waitlist",
      headers,
      payload: {
        patientId: patient.id,
        kind: "service",
        serviceId: service.id,
        notes: " Só à noite ",
      },
    });
    expect(created.statusCode).toBe(201);
    const entry = created.json();
    expect(entry).toMatchObject({
      patientName: "Carla Espera",
      itemName: service.name,
      notes: "Só à noite",
      productId: null,
      status: "waiting",
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/waitlist",
      headers,
      payload: {
        patientId: patient.id,
        kind: "service",
        serviceId: service.id,
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().message).toBe(
      `O cliente já está na lista de espera de ${service.name}.`,
    );

    const empty = await app.inject({
      method: "PATCH",
      url: `/waitlist/${entry.id}`,
      headers,
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
    const updated = await app.inject({
      method: "PATCH",
      url: `/waitlist/${entry.id}`,
      headers,
      payload: { status: "contacted" },
    });
    expect(updated.json()).toMatchObject({ status: "contacted" });

    const list = await app.inject({ method: "GET", url: "/waitlist", headers });
    expect(
      list.json().filter((item: { id: string }) => item.id === entry.id),
    ).toHaveLength(1);

    const removed = await app.inject({
      method: "DELETE",
      url: `/waitlist/${entry.id}`,
      headers,
    });
    expect(removed.statusCode).toBe(204);
    const missing = await app.inject({
      method: "PATCH",
      url: `/waitlist/${entry.id}`,
      headers,
      payload: { status: "served" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("exige a permissão do módulo para consultar e gerenciar", async () => {
    const { app, repository, patient, service } = await setup();
    const asUser = async (permissions: string[]) => {
      const user = await repository.createAdminUser(
        clinicId,
        actor,
        {
          fullName: `Equipe ${permissions.length}`,
          email: `equipe${permissions.length}@example.com`,
          role: "user",
          password: "SenhaForte123",
          permissions: permissions as never,
        },
        "hash-de-teste",
      );
      return {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      };
    };
    const none = await asUser([]);
    expect(
      (await app.inject({ method: "GET", url: "/waitlist", headers: none }))
        .statusCode,
    ).toBe(403);
    const viewer = await asUser(["waitlist.view"]);
    expect(
      (await app.inject({ method: "GET", url: "/waitlist", headers: viewer }))
        .statusCode,
    ).toBe(200);
    // Só com a lista de espera, ainda escolhe serviço, produto e cliente.
    const options = await app.inject({
      method: "GET",
      url: "/waitlist/options",
      headers: viewer,
    });
    expect(options.statusCode).toBe(200);
    expect(options.json().services).toContainEqual({
      id: service.id,
      name: service.name,
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/patients/options",
          headers: viewer,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/waitlist",
          headers: viewer,
          payload: {
            patientId: patient.id,
            kind: "service",
            serviceId: service.id,
          },
        })
      ).statusCode,
    ).toBe(403);
  });
});
