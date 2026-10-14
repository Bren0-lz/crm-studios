import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});
async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  return { app, repository, headers };
}
describe("client management", () => {
  it("persists optional profile fields, preserves them on legacy updates and exports them", async () => {
    const { app, headers } = await setup();
    const create = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: {
        fullName: "Cliente completo",
        phone: "11988887777",
        city: "São Paulo",
        guardianName: "Responsável",
        gender: "female",
        clientType: "fixed",
        imageConsent: true,
        interests: ["Postura"],
      },
    });
    expect(create.statusCode).toBe(201);
    const patient = create.json();
    const edit = await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: { fullName: "Cliente atualizado", phone: "11988887777" },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json()).toMatchObject({
      city: "São Paulo",
      guardianName: "Responsável",
      imageConsent: true,
    });
    const exported = await app.inject({
      method: "GET",
      url: "/patients/export?columns=fullName,city,interests,imageConsent",
      headers,
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.body).toContain("São Paulo");
    expect(exported.body).toContain("Postura");
    expect(exported.body).toContain("sim");
    const foreign = await app.inject({
      method: "GET",
      url: "/patients/00000000-0000-4000-8000-000000000001",
      headers,
    });
    expect(foreign.statusCode).toBe(404);
  });
  it("merges two clients only after resolving conflicting fields and preserves appointment history", async () => {
    const { app, repository, headers } = await setup();
    const source = await repository.createPatient(clinicId, {
      fullName: "Cadastro duplicado",
      phone: "11988887777",
      tags: ["origem"],
    });
    const target = await repository.createPatient(clinicId, {
      fullName: "Cadastro principal",
      phone: "11999998888",
      tags: ["destino"],
    });
    const [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: source.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2039-02-10T12:00:00.000Z",
      visitType: "regular",
      notes: "",
    });
    const preview = await app.inject({
      method: "POST",
      url: "/patients/merge/preview",
      headers,
      payload: { sourceId: source.id, targetId: target.id },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "fullName" })]),
    );
    const invalid = await app.inject({
      method: "POST",
      url: "/patients/merge",
      headers,
      payload: { sourceId: source.id, targetId: target.id, fieldSources: {} },
    });
    expect(invalid.statusCode).toBe(400);
    expect(
      (await repository.listPatients(clinicId)).some(
        (item) => item.id === source.id,
      ),
    ).toBe(true);
    const fieldSources = Object.fromEntries(
      preview
        .json()
        .fields.map((field: { key: string }) => [field.key, "target"]),
    );
    const merged = await app.inject({
      method: "POST",
      url: "/patients/merge",
      headers,
      payload: { sourceId: source.id, targetId: target.id, fieldSources },
    });
    expect(merged.statusCode).toBe(200);
    expect(merged.json().tags).toEqual(["destino", "origem"]);
    expect(
      (
        await repository.listAppointments(
          clinicId,
          "2039-02-10T00:00:00.000Z",
          "2039-02-11T00:00:00.000Z",
        )
      ).find((item) => item.id === appointment.id)?.patientId,
    ).toBe(target.id);
    expect(
      (await repository.listPatients(clinicId)).some(
        (item) => item.id === source.id,
      ),
    ).toBe(false);
    await expect(
      repository.previewPatientMerge(
        "99999999-9999-4999-8999-999999999999",
        source.id,
        target.id,
      ),
    ).rejects.toMatchObject({ code: "PATIENT_NOT_FOUND" });
  });
  it("protects new clients and scheduled appointments in bulk inactivation and rechecks the preview", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-01-10T12:00:00Z"));
    const { app, repository } = await setup();
    const old = await repository.createPatient(clinicId, {
      fullName: "Cliente antigo",
      phone: "11988887777",
      tags: [],
    });
    const protectedPatient = await repository.createPatient(clinicId, {
      fullName: "Cliente agendado",
      phone: "11999998888",
      tags: [],
    });
    vi.setSystemTime(new Date("2039-10-10T12:00:00Z"));
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    await repository.createAppointment(clinicId, {
      patientId: protectedPatient.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2039-11-10T12:00:00.000Z",
      visitType: "regular",
      notes: "",
    });
    const preview = await app.inject({
      method: "POST",
      url: "/patients/inactivation/preview",
      headers,
      payload: { months: 3 },
    });
    expect(preview.statusCode).toBe(200);
    expect(
      preview.json().map((patient: { id: string }) => patient.id),
    ).toContain(old.id);
    expect(
      preview.json().map((patient: { id: string }) => patient.id),
    ).not.toContain(protectedPatient.id);
    const result = await app.inject({
      method: "POST",
      url: "/patients/inactivation",
      headers,
      payload: { months: 3, patientIds: [old.id, protectedPatient.id] },
    });
    expect(result.json()).toEqual({ changed: 1, skipped: 1 });
    expect(
      (await repository.listPatients(clinicId)).find(
        (patient) => patient.id === protectedPatient.id,
      )?.status,
    ).toBe("active");
  });
  it("isolates catalogs and denies their management to read-only users", async () => {
    const { app, repository, headers } = await setup();
    const create = await app.inject({
      method: "POST",
      url: "/clinic-catalogs/interest",
      headers,
      payload: { name: "Reabilitação" },
    });
    expect(create.statusCode).toBe(201);
    expect(
      await repository.listClinicCatalog(
        "99999999-9999-4999-8999-999999999999",
        "interest",
      ),
    ).toEqual([]);
    const duplicate = await app.inject({
      method: "POST",
      url: "/clinic-catalogs/interest",
      headers,
      payload: { name: "reabilitacao" },
    });
    expect(duplicate.statusCode).toBe(409);
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Leitura clientes",
        email: "read@test.local",
        password: "Password123",
        role: "user",
        permissions: ["patients.view"],
      },
      "unused-hash",
    );
    const readHeaders = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/clinic-catalogs/interest",
          headers: readHeaders,
          payload: { name: "Outro" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/patients/merge/preview",
          headers: readHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
});
