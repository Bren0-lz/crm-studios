import type { Appointment, DashboardViewSummary } from "@crm/contracts";
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
  vi.useFakeTimers({ toFake: ["Date"] });
  // 15:00 em São Paulo.
  vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  const [professional] = await repository.listProfessionals(clinicId),
    [room] = await repository.listRooms(clinicId),
    [service] = await repository.listServices(clinicId),
    [patient] = await repository.listPatients(clinicId);
  async function appointmentAt(
    startsAt: string,
    status?: Appointment["status"],
  ) {
    const created = await repository.createAppointment(clinicId, {
      patientId: patient!.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt,
      visitType: "regular",
      notes: "",
    });
    if (status)
      await repository.updateAppointmentStatus(clinicId, created.id, status);
    return created.id;
  }
  return { app, repository, headers, appointmentAt };
}

describe("appointments pending finalization", () => {
  it("lists past scheduled/confirmed appointments of any date and counts them on the dashboard", async () => {
    const { app, headers, appointmentAt } = await setup();
    const lastMonth = await appointmentAt("2039-05-02T12:00:00Z");
    const earlierToday = await appointmentAt(
      "2039-06-10T15:00:00Z",
      "confirmed",
    );
    const running = await appointmentAt("2039-06-10T17:55:00Z");
    const tomorrow = await appointmentAt("2039-06-11T12:00:00Z");
    const completed = await appointmentAt("2039-06-09T12:00:00Z", "completed");
    const noShow = await appointmentAt("2039-06-08T12:00:00Z", "no_show");
    const cancelled = await appointmentAt("2039-06-07T12:00:00Z", "cancelled");

    const response = await app.inject({
      method: "GET",
      url: "/appointments/pending-finalization",
      headers,
    });
    expect(response.statusCode).toBe(200);
    const ids = response.json<Appointment[]>().map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([lastMonth, earlierToday]));
    for (const id of [running, tomorrow, completed, noShow, cancelled])
      expect(ids).not.toContain(id);
    expect(ids.indexOf(lastMonth)).toBeLessThan(ids.indexOf(earlierToday));

    const dashboard = await app.inject({
      method: "GET",
      url: "/dashboard?date=2039-06-10",
      headers,
    });
    expect(dashboard.json<DashboardViewSummary>().pendingFinalization).toBe(
      ids.length,
    );

    // Marcar como realizado (rota existente) tira o atendimento da lista.
    const done = await app.inject({
      method: "PATCH",
      url: `/appointments/${lastMonth}/status`,
      headers,
      payload: { status: "completed" },
    });
    expect(done.statusCode).toBe(200);
    const after = await app.inject({
      method: "GET",
      url: "/appointments/pending-finalization",
      headers,
    });
    expect(after.json<Appointment[]>().map((item) => item.id)).not.toContain(
      lastMonth,
    );
  });

  it("requires access to the agenda", async () => {
    const { app, headers } = await setup();
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Usuária do financeiro",
        email: "so.financeiro@teste.local",
        role: "user",
        password: "SenhaForte123",
        modules: ["finance"],
        editModules: ["finance"],
      },
    });
    expect(created.statusCode).toBe(201);
    const token = app.jwt.sign({
      sub: created.json<{ id: string }>().id,
      clinicId,
      role: "user",
    });
    const response = await app.inject({
      method: "GET",
      url: "/appointments/pending-finalization",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
    const dashboard = await app.inject({
      method: "GET",
      url: "/dashboard?date=2039-06-10",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(dashboard.json<DashboardViewSummary>()).not.toHaveProperty(
      "pendingFinalization",
    );
  });
});
