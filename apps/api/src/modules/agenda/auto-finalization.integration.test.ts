import type { Appointment, AutoFinalizationSettings } from "@crm/contracts";
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
    return created;
  }
  const saveSettings = (body: { enabled: boolean; delayMinutes: number }) =>
    app.inject({
      method: "PUT",
      url: "/admin/auto-finalization",
      headers,
      payload: body,
    });
  const completed = (from: string, to: string) =>
    app.inject({
      method: "GET",
      url: `/appointments/completed?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers,
    });
  return {
    app,
    repository,
    headers,
    appointmentAt,
    saveSettings,
    completed,
  };
}

describe("appointment auto finalization", () => {
  it("starts disabled and keeps past appointments pending", async () => {
    const { app, headers, appointmentAt } = await setup();
    const past = await appointmentAt("2039-06-09T12:00:00Z");
    const settings = await app.inject({
      method: "GET",
      url: "/clinic/auto-finalization",
      headers,
    });
    expect(settings.json<AutoFinalizationSettings>()).toEqual({
      enabled: false,
      delayMinutes: 60,
    });
    const pending = await app.inject({
      method: "GET",
      url: "/appointments/pending-finalization",
      headers,
    });
    expect(pending.json<Appointment[]>().map((item) => item.id)).toContain(
      past.id,
    );
  });

  it("finalizes only appointments whose end plus the delay already passed", async () => {
    const { app, repository, headers, appointmentAt, saveSettings } =
      await setup();
    // Termina 16:00Z (1h50 atrás) e 17:00Z (1h atrás): com 90 min, só o primeiro.
    const old = await appointmentAt("2039-06-10T15:00:00Z", "confirmed");
    const recent = await appointmentAt("2039-06-10T16:00:00Z");
    const noShow = await appointmentAt("2039-06-09T12:00:00Z", "no_show");

    const saved = await saveSettings({ enabled: true, delayMinutes: 90 });
    expect(saved.statusCode).toBe(200);
    expect(saved.json<AutoFinalizationSettings>()).toMatchObject({
      enabled: true,
      delayMinutes: 90,
    });

    const [oldNow, recentNow, noShowNow] = await Promise.all(
      [old, recent, noShow].map((item) =>
        repository.findAppointment(clinicId, item.id),
      ),
    );
    expect(oldNow).toMatchObject({
      status: "completed",
      autoCompletedAt: "2039-06-10T18:00:00.000Z",
    });
    expect(recentNow?.status).toBe("scheduled");
    expect(noShowNow?.status).toBe("no_show");

    // Passada a espera do segundo, a lista de pendentes já vem sem ele.
    vi.setSystemTime(new Date("2039-06-10T18:31:00Z"));
    const pending = await app.inject({
      method: "GET",
      url: "/appointments/pending-finalization",
      headers,
    });
    expect(pending.json<Appointment[]>().map((item) => item.id)).not.toContain(
      recent.id,
    );
    expect(
      (await repository.findAppointment(clinicId, recent.id))?.autoCompletedAt,
    ).toBe("2039-06-10T18:31:00.000Z");
  });

  it("lists completed appointments in the period, marking the automatic ones", async () => {
    const { appointmentAt, saveSettings, completed, app, headers } =
      await setup();
    const manual = await appointmentAt("2039-06-08T12:00:00Z", "completed");
    const automatic = await appointmentAt("2039-06-09T12:00:00Z");
    const outside = await appointmentAt("2039-06-01T12:00:00Z", "completed");
    await appointmentAt("2039-06-09T15:00:00Z", "cancelled");
    await saveSettings({ enabled: true, delayMinutes: 0 });

    const response = await completed(
      "2039-06-08T00:00:00-03:00",
      "2039-06-11T00:00:00-03:00",
    );
    expect(response.statusCode).toBe(200);
    const all = response.json<Appointment[]>();
    expect(all.every((item) => item.status === "completed")).toBe(true);
    // Ignora os atendimentos de demonstração do repositório em memória.
    const items = all.filter((item) =>
      [manual.id, automatic.id, outside.id].includes(item.id),
    );
    expect(items.map((item) => item.id)).toEqual([manual.id, automatic.id]);
    expect(items[0]!.autoCompletedAt).toBeUndefined();
    expect(items[1]!.autoCompletedAt).toBeDefined();

    // Desfecho alterado pela equipe deixa de contar como automático.
    await app.inject({
      method: "PATCH",
      url: `/appointments/${automatic.id}/status`,
      headers,
      payload: { status: "no_show" },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${automatic.id}/status`,
      headers,
      payload: { status: "completed" },
    });
    const again = await completed(
      "2039-06-08T00:00:00-03:00",
      "2039-06-11T00:00:00-03:00",
    );
    expect(
      again.json<Appointment[]>().find((item) => item.id === automatic.id)
        ?.autoCompletedAt,
    ).toBeUndefined();
  });

  it("validates the period and the settings", async () => {
    const { completed, saveSettings } = await setup();
    expect(
      (await completed("2039-06-10T00:00:00Z", "2039-06-01T00:00:00Z"))
        .statusCode,
    ).toBe(400);
    expect(
      (await saveSettings({ enabled: true, delayMinutes: -5 })).statusCode,
    ).toBe(400);
    expect(
      (await saveSettings({ enabled: true, delayMinutes: 20000 })).statusCode,
    ).toBe(400);
  });

  it("lets any user read the settings but only the admin change them", async () => {
    const { app, repository } = await setup();
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Recepção",
        email: "recepcao-auto@example.com",
        password: "Password123",
        role: "user",
        permissions: ["agenda.view"],
      },
      "unused-hash",
    );
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/clinic/auto-finalization",
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/admin/auto-finalization",
          headers,
          payload: { enabled: true, delayMinutes: 30 },
        })
      ).statusCode,
    ).toBe(403);
  });

  it("runs on regular requests once enabled", async () => {
    const { app, headers, repository, appointmentAt, saveSettings } =
      await setup();
    await saveSettings({ enabled: true, delayMinutes: 30 });
    const past = await appointmentAt("2039-06-09T12:00:00Z");
    // Fora do intervalo mínimo entre varreduras disparadas pelas requisições.
    vi.setSystemTime(new Date("2039-06-10T18:02:00Z"));
    await app.inject({ method: "GET", url: "/me", headers });
    expect((await repository.findAppointment(clinicId, past.id))?.status).toBe(
      "completed",
    );
  });
});
