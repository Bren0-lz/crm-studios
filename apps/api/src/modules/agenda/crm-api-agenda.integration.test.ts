import type { Appointment } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  type UserRole,
  authenticatedApp,
  roleSub,
  seedRoleUsers,
  tokenRole,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("CRM API", () => {
  it("versions and finalizes a complete clinical record", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const appointments = (
      await app.inject({
        method: "GET",
        url: `/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        headers,
      })
    ).json();

    const draft = await app.inject({
      method: "POST",
      url: "/clinical-records",
      headers,
      payload: {
        appointmentId: appointments[0].id,
        subjective: "Cliente relata redução da dor.",
        objective: "Amplitude de movimento em evolução.",
        assessment: "Resposta positiva ao tratamento.",
        plan: "Manter exercícios e progressão de carga.",
        painScale: 3,
      },
    });
    expect(draft.statusCode).toBe(201);
    const draftBody = draft.json<{
      id: string;
      appointmentId: string;
      objective: string;
      assessment: string;
      plan: string;
      painScale?: number;
    }>();
    expect(draftBody).toMatchObject({ status: "draft", version: 1 });
    const professionals = (
      await app.inject({ method: "GET", url: "/professionals", headers })
    ).json<Array<{ id: string; crefito: string }>>();
    const professional = professionals.find(
      (item) => item.id === appointments[0].professionalId,
    );
    expect(professional?.crefito).toBeTruthy();
    expect(draft.json()).toMatchObject({
      professionalCrefito: professional!.crefito,
    });
    const listed = (
      await app.inject({ method: "GET", url: "/clinical-records", headers })
    ).json<Array<{ id: string; professionalCrefito: string }>>();
    expect(
      listed.find((item) => item.id === draftBody.id)?.professionalCrefito,
    ).toBe(professional!.crefito);

    const finalized = await app.inject({
      method: "POST",
      url: `/clinical-records/${draftBody.id}/finalize`,
      headers,
    });
    expect(finalized.json()).toMatchObject({ status: "finalized", version: 2 });

    const editAfterFinalize = await app.inject({
      method: "POST",
      url: "/clinical-records",
      headers,
      payload: {
        appointmentId: draftBody.appointmentId,
        subjective: "Tentativa de alteração",
        objective: draftBody.objective,
        assessment: draftBody.assessment,
        plan: draftBody.plan,
        painScale: draftBody.painScale,
      },
    });
    expect(editAfterFinalize.statusCode).toBe(409);

    const revisions = await app.inject({
      method: "GET",
      url: `/clinical-records/${draftBody.id}/revisions`,
      headers,
    });
    expect(revisions.json()).toHaveLength(2);
    await app.close();
  });

  it("respects opt-out and generates reminders idempotently", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const appointments = await app.inject({
      method: "GET",
      url: `/appointments?from=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`,
      headers,
    });
    const appointment = appointments.json()[0];
    const referenceDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date(appointment.startsAt));
    await app.inject({
      method: "PUT",
      url: "/communications/preferences",
      headers,
      payload: {
        patientId: appointment.patientId,
        channel: "whatsapp",
        allowed: false,
      },
    });
    const blocked = await app.inject({
      method: "POST",
      url: "/communications/messages",
      headers,
      payload: {
        patientId: appointment.patientId,
        channel: "whatsapp",
        body: "Mensagem administrativa",
      },
    });
    expect(blocked.statusCode).toBe(409);
    const skipped = await app.inject({
      method: "POST",
      url: "/communications/reminders/generate",
      headers,
      payload: { referenceDate },
    });
    expect(skipped.json().skippedByPreference).toBeGreaterThan(0);
    await app.inject({
      method: "PUT",
      url: "/communications/preferences",
      headers,
      payload: {
        patientId: appointment.patientId,
        channel: "whatsapp",
        allowed: true,
      },
    });
    const first = await app.inject({
      method: "POST",
      url: "/communications/reminders/generate",
      headers,
      payload: { referenceDate },
    });
    expect(first.json().queued).toBeGreaterThan(0);
    const second = await app.inject({
      method: "POST",
      url: "/communications/reminders/generate",
      headers,
      payload: { referenceDate },
    });
    expect(second.json().queued).toBe(0);
    expect(second.json().alreadyQueued).toBeGreaterThan(0);
    const center = await app.inject({
      method: "GET",
      url: "/communications",
      headers,
    });
    expect(center.json()).toMatchObject({ deliveryMode: "outbox_only" });
    expect(center.json().messages.length).toBeGreaterThan(0);
    await app.close();
  });

  it("manages holidays as owner and refuses appointments, reschedules and series on them", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const clinicId = "11111111-1111-4111-8111-111111111111";
    await seedRoleUsers(app);
    const receptionHeaders = {
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "reception"), clinicId, role: "user" })}`,
    };
    const day = (offset: number) =>
      new Date(Date.UTC(2031, 3, 21 + offset)).toISOString().slice(0, 10);
    const holidayDate = day(0);

    expect(
      (await app.inject({ method: "GET", url: "/holidays", headers })).json(),
    ).toEqual([]);
    const forbidden = await app.inject({
      method: "POST",
      url: "/holidays",
      headers: receptionHeaders,
      payload: { date: holidayDate, name: "Tiradentes" },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ code: "ADMIN_ACCESS_REQUIRED" });
    const invalid = await app.inject({
      method: "POST",
      url: "/holidays",
      headers,
      payload: { date: "21/04/2031", name: "Tiradentes" },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/holidays",
      headers,
      payload: { date: holidayDate, name: "  Tiradentes " },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      clinicId,
      date: holidayDate,
      name: "Tiradentes",
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/holidays",
      headers,
      payload: { date: holidayDate, name: "Outro" },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ code: "HOLIDAY_DUPLICATE" });
    const earlier = await app.inject({
      method: "POST",
      url: "/holidays",
      headers,
      payload: { date: day(-20), name: "Aniversário da clínica" },
    });
    expect(earlier.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: "/holidays",
      headers: receptionHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().map((item: { date: string }) => item.date)).toEqual([
      day(-20),
      holidayDate,
    ]);
    const ranged = await app.inject({
      method: "GET",
      url: `/holidays?from=${day(-1)}&to=${day(1)}`,
      headers,
    });
    expect(ranged.json()).toHaveLength(1);
    expect(ranged.json()[0]).toMatchObject({ name: "Tiradentes" });

    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const payload = {
      patientId: patients.json()[0].id,
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
    };
    const onHoliday = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...payload, startsAt: `${holidayDate}T15:00:00.000Z` },
    });
    expect(onHoliday.statusCode).toBe(409);
    expect(onHoliday.json()).toMatchObject({ code: "HOLIDAY" });
    expect(onHoliday.json().message).toContain("Tiradentes");
    // 22h30 do feriado em São Paulo já é o dia seguinte em UTC.
    const lateOnHoliday = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...payload, startsAt: `${day(1)}T01:30:00.000Z` },
    });
    expect(lateOnHoliday.statusCode).toBe(409);
    expect(lateOnHoliday.json()).toMatchObject({ code: "HOLIDAY" });
    // 23h da véspera em São Paulo já é o feriado em UTC, mas não na clínica.
    const eve = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...payload, startsAt: `${holidayDate}T02:00:00.000Z` },
    });
    expect(eve.statusCode).toBe(201);

    const moved = await app.inject({
      method: "PUT",
      url: `/appointments/${eve.json().id}/schedule`,
      headers,
      payload: {
        professionalId: payload.professionalId,
        roomId: payload.roomId,
        startsAt: `${holidayDate}T15:00:00.000Z`,
      },
    });
    expect(moved.statusCode).toBe(409);
    expect(moved.json()).toMatchObject({ code: "HOLIDAY" });
    expect(moved.json().message).toContain("Tiradentes");

    const series = {
      ...payload,
      startsAt: `${day(-7)}T15:00:00.000Z`,
      occurrences: 3,
      intervalWeeks: 1,
    };
    const recurring = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: series,
    });
    expect(recurring.statusCode).toBe(409);
    expect(recurring.json()).toMatchObject({ code: "HOLIDAY" });
    expect(recurring.json().message).toContain("Tiradentes");
    const agenda = await app.inject({
      method: "GET",
      url: `/appointments?from=${day(-8)}T00:00:00.000Z&to=${day(15)}T00:00:00.000Z`,
      headers,
    });
    expect(agenda.json().map((item: Appointment) => item.id)).toEqual([
      eve.json().id,
    ]);

    const receptionDelete = await app.inject({
      method: "DELETE",
      url: `/holidays/${created.json().id}`,
      headers: receptionHeaders,
    });
    expect(receptionDelete.statusCode).toBe(403);
    expect(receptionDelete.json()).toMatchObject({
      code: "ADMIN_ACCESS_REQUIRED",
    });
    const removed = await app.inject({
      method: "DELETE",
      url: `/holidays/${created.json().id}`,
      headers,
    });
    expect(removed.statusCode).toBe(204);
    const removedAgain = await app.inject({
      method: "DELETE",
      url: `/holidays/${created.json().id}`,
      headers,
    });
    expect(removedAgain.statusCode).toBe(404);
    expect(removedAgain.json()).toMatchObject({ code: "HOLIDAY_NOT_FOUND" });
    const afterRemoval = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: series,
    });
    expect(afterRemoval.statusCode).toBe(201);
    expect(afterRemoval.json()).toHaveLength(3);
    await app.close();
  });

  it("records satisfaction surveys for completed appointments once and summarizes the NPS", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const clinicId = "11111111-1111-4111-8111-111111111111";
    const sub = "22222222-2222-4222-8222-222222222222";
    await seedRoleUsers(app);
    const roleHeaders = (role: UserRole) => ({
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
    });
    const helena = "99999999-9999-4999-8999-999999999999";
    const lucas = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const helenaAppointment = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const post = (payload: object, requestHeaders = headers) =>
      app.inject({
        method: "POST",
        url: "/satisfaction",
        headers: requestHeaders,
        payload,
      });

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/satisfaction",
      payload: { patientId: helena, score: 10 },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const notCompleted = await post({
      patientId: helena,
      appointmentId: helenaAppointment,
      score: 10,
    });
    expect(notCompleted.statusCode).toBe(400);
    expect(notCompleted.json()).toMatchObject({
      code: "SATISFACTION_APPOINTMENT_NOT_COMPLETED",
    });

    const completed = await app.inject({
      method: "PATCH",
      url: `/appointments/${helenaAppointment}/status`,
      headers,
      payload: { status: "completed" },
    });
    expect(completed.statusCode).toBe(200);

    const otherPatient = await post({
      patientId: lucas,
      appointmentId: helenaAppointment,
      score: 10,
    });
    expect(otherPatient.statusCode).toBe(400);
    expect(otherPatient.json()).toMatchObject({
      code: "SATISFACTION_APPOINTMENT_MISMATCH",
    });

    const missingAppointment = await post({
      patientId: helena,
      appointmentId: "12121212-1212-4121-8121-121212121212",
      score: 10,
    });
    expect(missingAppointment.statusCode).toBe(404);
    expect(missingAppointment.json()).toMatchObject({
      code: "APPOINTMENT_NOT_FOUND",
    });

    const missingPatient = await post({
      patientId: "12121212-1212-4121-8121-121212121212",
      score: 10,
    });
    expect(missingPatient.statusCode).toBe(404);
    expect(missingPatient.json()).toMatchObject({ code: "PATIENT_NOT_FOUND" });

    for (const payload of [
      { patientId: helena, score: 11 },
      { patientId: helena, score: -1 },
      { patientId: helena, score: 7.5 },
      { patientId: helena },
      { patientId: helena, score: 8, comment: "x".repeat(1001) },
      { patientId: "não-é-uuid", score: 8 },
    ]) {
      const invalid = await post(payload);
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    }

    const created = await post({
      patientId: helena,
      appointmentId: helenaAppointment,
      score: 10,
      comment: "  Atendimento excelente.  ",
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({
      id: expect.any(String),
      clinicId,
      patientId: helena,
      patientName: "Helena Almeida",
      appointmentId: helenaAppointment,
      score: 10,
      comment: "Atendimento excelente.",
      actorUserId: sub,
      createdAt: expect.any(String),
    });

    const duplicate = await post(
      { patientId: helena, appointmentId: helenaAppointment, score: 3 },
      roleHeaders("reception"),
    );
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ code: "SATISFACTION_DUPLICATE" });

    const byRole = [
      ["reception", 8],
      ["physiotherapist", 5],
      ["finance", 0],
    ] as const;
    for (const [role, score] of byRole) {
      const response = await post(
        { patientId: lucas, score },
        roleHeaders(role),
      );
      expect(response.statusCode).toBe(201);
      expect(response.json()).not.toHaveProperty("appointmentId");
      expect(response.json()).not.toHaveProperty("comment");
    }

    for (const role of [
      "owner",
      "reception",
      "physiotherapist",
      "finance",
    ] as const) {
      const report = await app.inject({
        method: "GET",
        url: "/satisfaction",
        headers: roleHeaders(role),
      });
      expect(report.statusCode).toBe(200);
      expect(report.json().summary).toEqual({
        total: 4,
        promoters: 1,
        passives: 1,
        detractors: 2,
        nps: -25,
      });
    }
    const report = await app.inject({
      method: "GET",
      url: "/satisfaction",
      headers,
    });
    expect(
      report
        .json()
        .surveys.map((item: { score: number; patientName: string }) => [
          item.patientName,
          item.score,
        ]),
    ).toEqual([
      ["Lucas Ribeiro", 0],
      ["Lucas Ribeiro", 5],
      ["Lucas Ribeiro", 8],
      ["Helena Almeida", 10],
    ]);
    const unauthenticatedList = await app.inject({
      method: "GET",
      url: "/satisfaction",
    });
    expect(unauthenticatedList.statusCode).toBe(401);
    await app.close();
  });
});
