import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("service professionals and rooms", () => {
  it("stores who attends a service and keeps it when editing other fields", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [professionals, rooms] = await Promise.all([
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
    ]);
    const professionalId = professionals.json()[0].id as string;
    const roomId = rooms.json()[0].id as string;
    const created = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: {
        name: "Pilates aparelho",
        durationMinutes: 50,
        color: "#547A6B",
        professionalIds: [professionalId],
        roomIds: [roomId],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      professionalIds: [professionalId],
      roomIds: [roomId],
    });
    const listed = await app.inject({
      method: "GET",
      url: "/services",
      headers,
    });
    expect(
      listed
        .json()
        .find((item: { id: string }) => item.id === created.json().id),
    ).toMatchObject({ professionalIds: [professionalId] });
    const plain = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: {
        name: "Avaliação",
        durationMinutes: 30,
        color: "#547A6B",
      },
    });
    expect(plain.json()).toMatchObject({ professionalIds: [], roomIds: [] });
    await app.close();
  });

  it("refuses an appointment whose service is not attended by that professional or room (QM3)", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [professionals, rooms] = await Promise.all([
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
    ]);
    const [ana, paulo] = professionals.json<{ id: string }[]>();
    const [movement, studio] = rooms.json<{ id: string }[]>();
    const service = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: {
        name: "Depilação",
        durationMinutes: 30,
        color: "#db8290",
        professionalIds: [ana!.id],
        roomIds: [movement!.id],
      },
    });
    const serviceId = service.json<{ id: string }>().id;
    const base = {
      patientId: "99999999-9999-4999-8999-999999999999",
      serviceId,
      visitType: "regular",
    };
    const wrongRoom = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        ...base,
        professionalId: ana!.id,
        roomId: studio!.id,
        startsAt: "2031-05-12T13:00:00.000Z",
      },
    });
    expect(wrongRoom.statusCode).toBe(409);
    expect(wrongRoom.json()).toMatchObject({ code: "SERVICE_NOT_AVAILABLE" });
    const wrongProfessional = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: {
        ...base,
        professionalId: paulo!.id,
        roomId: movement!.id,
        startsAt: "2031-05-12T13:00:00.000Z",
        occurrences: 2,
      },
    });
    expect(wrongProfessional.statusCode).toBe(409);
    expect(wrongProfessional.json()).toMatchObject({
      code: "SERVICE_NOT_AVAILABLE",
    });
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Carla Experimental",
        phone: "11955554444",
        source: "Instagram",
        interest: "Depilação",
      },
    });
    const leadAppointment = await app.inject({
      method: "POST",
      url: `/leads/${lead.json<{ id: string }>().id}/appointments`,
      headers,
      payload: {
        serviceId,
        professionalId: ana!.id,
        roomId: studio!.id,
        startsAt: "2031-05-12T13:00:00.000Z",
        visitType: "trial",
      },
    });
    expect(leadAppointment.statusCode).toBe(409);
    const allowed = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        ...base,
        professionalId: ana!.id,
        roomId: movement!.id,
        startsAt: "2031-05-12T13:00:00.000Z",
      },
    });
    expect(allowed.statusCode).toBe(201);
    await app.close();
  });

  it("refuses rescheduling or a successor to a professional or room that does not attend the service (QM3)", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [professionals, rooms] = await Promise.all([
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
    ]);
    const [ana, paulo] = professionals.json<{ id: string }[]>();
    const [movement, studio] = rooms.json<{ id: string }[]>();
    const service = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: {
        name: "Depilação",
        durationMinutes: 30,
        color: "#db8290",
        professionalIds: [ana!.id],
        roomIds: [movement!.id],
      },
    });
    const created = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        patientId: "99999999-9999-4999-8999-999999999999",
        serviceId: service.json<{ id: string }>().id,
        professionalId: ana!.id,
        roomId: movement!.id,
        startsAt: "2031-05-12T13:00:00.000Z",
        visitType: "regular",
      },
    });
    expect(created.statusCode).toBe(201);
    const appointmentId = created.json<{ id: string }>().id;
    const wrongRoom = await app.inject({
      method: "PUT",
      url: `/appointments/${appointmentId}/schedule`,
      headers,
      payload: {
        professionalId: ana!.id,
        roomId: studio!.id,
        startsAt: "2031-05-13T13:00:00.000Z",
      },
    });
    expect(wrongRoom.statusCode).toBe(409);
    expect(wrongRoom.json()).toMatchObject({ code: "SERVICE_NOT_AVAILABLE" });
    const moved = await app.inject({
      method: "PUT",
      url: `/appointments/${appointmentId}/schedule`,
      headers,
      payload: {
        professionalId: ana!.id,
        roomId: movement!.id,
        startsAt: "2031-05-13T13:00:00.000Z",
      },
    });
    expect(moved.statusCode).toBe(200);
    const absence = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers,
      payload: { status: "excused_absence", absenceReason: "Viagem" },
    });
    expect(absence.statusCode).toBe(200);
    const wrongProfessional = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/successor`,
      headers,
      payload: {
        professionalId: paulo!.id,
        roomId: movement!.id,
        startsAt: "2031-05-14T13:00:00.000Z",
      },
    });
    expect(wrongProfessional.statusCode).toBe(409);
    expect(wrongProfessional.json()).toMatchObject({
      code: "SERVICE_NOT_AVAILABLE",
    });
    const successor = await app.inject({
      method: "POST",
      url: `/appointments/${appointmentId}/successor`,
      headers,
      payload: {
        professionalId: ana!.id,
        roomId: movement!.id,
        startsAt: "2031-05-14T13:00:00.000Z",
      },
    });
    expect(successor.statusCode).toBe(201);
    await app.close();
  });
});
