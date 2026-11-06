import type { AdminAuditEvent, Appointment } from "@crm/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import { addLegacyTabService } from "../../test-support/legacy-tab-service.js";
import "../../test-support/legacy-setup.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const patientId = "99999999-9999-4999-8999-999999999999";
const apps: { close: () => Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

/** Ana e Paulo, duas salas, um serviço livre e outro só para Ana na primeira sala. */
async function scenario() {
  const { app, token } = await authenticatedApp();
  apps.push(app);
  const headers = { authorization: `Bearer ${token}` };
  const [professionals, rooms] = await Promise.all([
    app.inject({ method: "GET", url: "/professionals", headers }),
    app.inject({ method: "GET", url: "/rooms", headers }),
  ]);
  const [ana, paulo] = professionals.json<{ id: string }[]>();
  const [movement, studio] = rooms.json<{ id: string; name: string }[]>();
  const createService = async (payload: Record<string, unknown>) =>
    (
      await app.inject({
        method: "POST",
        url: "/services",
        headers,
        payload,
      })
    ).json<{ id: string; name: string }>();
  const free = await createService({ name: "Avaliação", durationMinutes: 30 });
  const long = await createService({
    name: "Pilates longo",
    durationMinutes: 90,
  });
  const restricted = await createService({
    name: "Depilação",
    durationMinutes: 45,
    professionalIds: [ana!.id],
    roomIds: [movement!.id],
  });
  const schedule = async (
    professionalId: string,
    roomId: string,
    startsAt: string,
    notes = "",
  ) => {
    const response = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        patientId,
        serviceId: free.id,
        professionalId,
        roomId,
        startsAt,
        notes,
        visitType: "regular",
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Appointment>();
  };
  const edit = (id: string, payload: Record<string, unknown>) =>
    app.inject({
      method: "PATCH",
      url: `/appointments/${id}`,
      headers,
      payload,
    });
  return {
    app,
    headers,
    ana: ana!,
    paulo: paulo!,
    movement: movement!,
    studio: studio!,
    free,
    long,
    restricted,
    schedule,
    edit,
  };
}

describe("PATCH /appointments/:id (QM6)", () => {
  it("changes service, room and note, keeping date, time and professional", async () => {
    const { app, headers, ana, movement, studio, restricted, schedule, edit } =
      await scenario();
    const appointment = await schedule(
      ana.id,
      studio.id,
      "2031-05-12T13:00:00.000Z",
      "Trazer exames",
    );
    const response = await edit(appointment.id, {
      serviceId: restricted.id,
      roomId: movement.id,
      notes: "  Chegar 10 min antes  ",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<Appointment>()).toMatchObject({
      id: appointment.id,
      serviceId: restricted.id,
      serviceName: "Depilação",
      roomId: movement.id,
      roomName: movement.name,
      notes: "Chegar 10 min antes",
      professionalId: ana.id,
      startsAt: "2031-05-12T13:00:00.000Z",
      // Duração do novo serviço: 45 min.
      endsAt: "2031-05-12T13:45:00.000Z",
      status: "scheduled",
    });
    const cleared = await edit(appointment.id, {
      serviceId: restricted.id,
      roomId: movement.id,
      notes: "",
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json<Appointment>().notes).toBeUndefined();
    const listed = await app.inject({
      method: "GET",
      url: "/appointments?from=2031-05-12T00:00:00.000Z&to=2031-05-13T00:00:00.000Z",
      headers,
    });
    expect(
      listed.json<Appointment[]>().find((item) => item.id === appointment.id),
    ).toMatchObject({ serviceId: restricted.id, roomId: movement.id });
    const history = await app.inject({
      url: "/history/audit-events?module=agenda&action=appointment.updated",
      headers,
    });
    const events = history.json<{ items: AdminAuditEvent[] }>().items;
    expect(events).toHaveLength(2);
    expect(events.every((item) => item.entityId === appointment.id)).toBe(true);
    expect(events.map((item) => item.metadata)).toContainEqual(
      expect.objectContaining({
        previous: expect.objectContaining({ notes: "Chegar 10 min antes" }),
        current: expect.objectContaining({ notes: "" }),
      }),
    );
  });

  it("refuses a service or room that does not match the professional and room links (QM3)", async () => {
    const { ana, paulo, movement, studio, restricted, schedule, edit } =
      await scenario();
    const ofPaulo = await schedule(
      paulo.id,
      movement.id,
      "2031-05-12T13:00:00.000Z",
    );
    const wrongProfessional = await edit(ofPaulo.id, {
      serviceId: restricted.id,
      roomId: movement.id,
    });
    expect(wrongProfessional.statusCode).toBe(409);
    expect(wrongProfessional.json()).toMatchObject({
      code: "SERVICE_NOT_AVAILABLE",
    });
    const ofAna = await schedule(
      ana.id,
      movement.id,
      "2031-05-13T13:00:00.000Z",
    );
    const wrongRoom = await edit(ofAna.id, {
      serviceId: restricted.id,
      roomId: studio.id,
    });
    expect(wrongRoom.statusCode).toBe(409);
    expect(wrongRoom.json()).toMatchObject({ code: "SERVICE_NOT_AVAILABLE" });
  });

  it("refuses a room or a longer service that collides with another appointment", async () => {
    const { ana, paulo, movement, studio, free, long, schedule, edit } =
      await scenario();
    const appointment = await schedule(
      ana.id,
      movement.id,
      "2031-05-12T13:00:00.000Z",
    );
    await schedule(paulo.id, studio.id, "2031-05-12T13:00:00.000Z");
    const busyRoom = await edit(appointment.id, {
      serviceId: free.id,
      roomId: studio.id,
    });
    expect(busyRoom.statusCode).toBe(409);
    expect(busyRoom.json()).toMatchObject({ code: "APPOINTMENT_CONFLICT" });
    // Ana tem outro atendimento às 14h: o serviço de 90 min invadiria o horário.
    await schedule(ana.id, movement.id, "2031-05-12T14:00:00.000Z");
    const overlapping = await edit(appointment.id, {
      serviceId: long.id,
      roomId: movement.id,
    });
    expect(overlapping.statusCode).toBe(409);
    expect(overlapping.json()).toMatchObject({ code: "APPOINTMENT_CONFLICT" });
  });

  it("only edits scheduled or confirmed appointments", async () => {
    const { app, headers, ana, movement, free, schedule, edit } =
      await scenario();
    const appointment = await schedule(
      ana.id,
      movement.id,
      "2031-05-12T13:00:00.000Z",
    );
    const confirmed = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointment.id}/status`,
      headers,
      payload: { status: "confirmed" },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(
      (await edit(appointment.id, { serviceId: free.id, roomId: movement.id }))
        .statusCode,
    ).toBe(200);
    const cancelled = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointment.id}/status`,
      headers,
      payload: { status: "cancelled", absenceReason: "Cliente desmarcou" },
    });
    expect(cancelled.statusCode).toBe(200);
    const refused = await edit(appointment.id, {
      serviceId: free.id,
      roomId: movement.id,
      notes: "Nova observação",
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({
      code: "APPOINTMENT_UPDATE_FORBIDDEN",
      message:
        "Somente atendimentos agendados ou confirmados podem ser editados.",
    });
    const missing = await edit("00000000-0000-4000-8000-000000000000", {
      serviceId: free.id,
      roomId: movement.id,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "APPOINTMENT_NOT_FOUND" });
  });

  it("keeps the service of an appointment sold on a tab, but lets the room and note change", async () => {
    const repository = new MemoryClinicRepository();
    const [patients, professionals, rooms, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const tab = await repository.openPatientTab(clinicId, ownerId, {
      patientId: patients[0]!.id,
    });
    const updatedTab = await addLegacyTabService(
      repository,
      undefined,
      clinicId,
      tab.id,
      {
        professionalId: professionals[0]!.id,
        roomId: rooms[0]!.id,
        serviceId: services[0]!.id,
        startsAt: "2031-05-12T13:00:00.000Z",
        visitType: "regular",
      },
      15000,
    );
    const appointmentId = updatedTab.services![0]!.appointmentId;
    await expect(
      repository.updateAppointment(clinicId, ownerId, appointmentId, {
        serviceId: services[1]!.id,
        roomId: rooms[0]!.id,
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_SERVICE_LOCKED" });
    const sameService = await repository.updateAppointment(
      clinicId,
      ownerId,
      appointmentId,
      { serviceId: services[0]!.id, roomId: rooms[1]!.id, notes: "Sala 2" },
    );
    expect(sameService).toMatchObject({
      roomId: rooms[1]!.id,
      notes: "Sala 2",
    });
  });

  it("requires the reschedule permission", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    apps.push(app);
    const [patients, professionals, rooms, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patients[0]!.id,
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      startsAt: "2031-05-12T13:00:00.000Z",
      visitType: "regular",
    });
    const user = await repository.createAdminUser(
      clinicId,
      ownerId,
      {
        fullName: "Recepção",
        email: "recepcao-qm6@example.com",
        password: "Password123",
        role: "user",
        permissions: ["agenda.create"],
      },
      "unused-hash",
    );
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    const response = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointment.id}`,
      headers,
      payload: { serviceId: services[0]!.id, roomId: rooms[0]!.id },
    });
    expect(response.statusCode).toBe(403);
  });
});
