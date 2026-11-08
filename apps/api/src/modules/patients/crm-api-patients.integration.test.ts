import { withAppointmentPlan } from "../../test-support/appointment-plan.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  type Appointment,
  type Lead,
  documentTemplateVariables,
  groupClassName,
  INCOMPLETE_REGISTRATION_TAG,
  MISSING_EMAIL_TAG,
  withoutAutomaticPatientTags,
} from "@crm/contracts";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { config } from "../../config.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import {
  type TestApp,
  type UserRole,
  authenticatedApp,
  configureTags,
  configuredPlan,
  roleSub,
  seedRoleUsers,
  tokenRole,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";
import {
  atInstant,
  patchStatusAt,
  reissuedHeaders,
} from "../../test-support/clock.js";
import { localParts, zonedTimeToUtc } from "../groups/group-schedule.js";
import { testPatientContact } from "../../test-support/patient-contact.js";

describe("CRM API", () => {
  it("allows the web app to send every write method through CORS", async () => {
    const app = await buildApp({
      repository: new MemoryClinicRepository(),
      logger: false,
    });
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const preflight = await app.inject({
        method: "OPTIONS",
        url: "/patients/99999999-9999-4999-8999-999999999999",
        headers: {
          origin: config.WEB_ORIGIN,
          "access-control-request-method": method,
          "access-control-request-headers": "authorization,content-type",
        },
      });
      expect(preflight.headers["access-control-allow-origin"]).toBe(
        config.WEB_ORIGIN,
      );
      expect(
        String(preflight.headers["access-control-allow-methods"]),
      ).toContain(method);
    }
    await app.close();
  });

  it("creates and searches a patient", async () => {
    const { app, token } = await authenticatedApp();
    await configureTags(app, { authorization: `Bearer ${token}` }, [
      "Avaliação",
    ]);
    const created = await app.inject({
      method: "POST",
      url: "/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fullName: "Joana de Souza",
        phone: "11999990000",
        whatsapp: "11999990000",
        emergencyContactName: "Joana de Souza",
        emergencyContactPhone: "11999990000",
        cpf: "12345678909",
        tags: ["Avaliação"],
      },
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: "/patients?search=Joana",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listed.json()).toHaveLength(1);
    expect(listed.json()[0].fullName).toBe("Joana de Souza");
    expect(listed.json()[0].phone).toBe("11999990000");

    for (const search of ["joana", "12345678909", "123.456.789-09"]) {
      const options = await app.inject({
        method: "GET",
        url: `/patients/options?search=${encodeURIComponent(search)}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(options.statusCode).toBe(200);
      expect(options.json()).toEqual([
        {
          id: created.json().id,
          fullName: "Joana de Souza",
          tags: ["Avaliação"],
        },
      ]);
    }
    const empty = await app.inject({
      method: "GET",
      url: "/patients/options?search=Inexistente",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(empty.json()).toEqual([]);
    const invalidSearch = await app.inject({
      method: "GET",
      url: `/patients/options?search=${"a".repeat(161)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(invalidSearch.statusCode).toBe(400);

    const byFormattedPhone = await app.inject({
      method: "GET",
      url: `/patients?search=${encodeURIComponent("(11) 99999-0000")}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      byFormattedPhone
        .json()
        .map((item: { fullName: string }) => item.fullName),
    ).toContain("Joana de Souza");
    await app.close();
  });

  it("edits a patient without changing their record number or duplicating a CPF", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    await configureTags(app, headers, ["Retorno"]);
    const patient = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          fullName: "Joana de Souza",
          phone: "11999990000",
          whatsapp: "11999990000",
          emergencyContactName: "Joana de Souza",
          emergencyContactPhone: "11999990000",
          cpf: "12345678909",
          tags: [],
        },
      })
    ).json();
    // QM15: prontuário sequencial da clínica, sem trecho de UUID.
    expect(patient.recordNumber).toBe("PAC-00124");
    const next = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: {
        cpf: nextTestCpf(),
        fullName: "Rita Sequência",
        phone: "11999990001",
        whatsapp: "11999990001",
        emergencyContactName: "Rita Sequência",
        emergencyContactPhone: "11999990001",
        tags: [],
      },
    });
    expect(next.json().recordNumber).toBe("PAC-00125");
    const [professional, room, service] = await Promise.all([
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const startsAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    startsAt.setUTCHours(18, 0, 0, 0);
    const appointment = (
      await app.inject({
        method: "POST",
        url: "/appointments",
        headers,
        payload: await withAppointmentPlan(
          app,
          {
            patientId: patient.id,
            professionalId: professional.json()[0].id,
            roomId: room.json()[0].id,
            serviceId: service.json()[0].id,
            startsAt: startsAt.toISOString(),
          },
          headers,
        ),
      })
    ).json();
    const updated = await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: {
        fullName: "Joana Pereira",
        phone: "11988887777",
        whatsapp: "11988887777",
        emergencyContactName: "Joana Pereira",
        emergencyContactPhone: "11988887777",
        cpf: patient.cpf,
        tags: ["Retorno"],
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: patient.id,
      recordNumber: patient.recordNumber,
      fullName: "Joana Pereira",
      tags: ["Retorno"],
    });
    const agenda = await app.inject({
      method: "GET",
      url: `/appointments?from=${encodeURIComponent(startsAt.toISOString())}&to=${encodeURIComponent(new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString())}`,
      headers,
    });
    expect(
      agenda.json().find((item: Appointment) => item.id === appointment.id)
        .patientName,
    ).toBe("Joana Pereira");
    const other = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Outra Pessoa",
          phone: "11911112222",
          whatsapp: "11911112222",
          emergencyContactName: "Outra Pessoa",
          emergencyContactPhone: "11911112222",
          tags: [],
        },
      })
    ).json();
    const duplicate = await app.inject({
      method: "PUT",
      url: `/patients/${other.id}`,
      headers,
      payload: {
        fullName: other.fullName,
        phone: other.phone,
        whatsapp: other.phone,
        emergencyContactName: other.fullName,
        emergencyContactPhone: other.phone,
        cpf: patient.cpf,
        tags: [],
      },
    });
    expect(duplicate.statusCode).toBe(409);
    await app.close();
  });

  it("prevents schedule conflicts", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = (
      await app.inject({ method: "GET", url: "/patients", headers })
    ).json();
    const professionals = (
      await app.inject({ method: "GET", url: "/professionals", headers })
    ).json();
    const rooms = (
      await app.inject({ method: "GET", url: "/rooms", headers })
    ).json();
    const services = (
      await app.inject({ method: "GET", url: "/services", headers })
    ).json();
    const startsAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const payload = {
      patientId: patients[0].id,
      professionalId: professionals[0].id,
      roomId: rooms[0].id,
      serviceId: services[0].id,
      startsAt,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/appointments",
          headers,
          payload: await withAppointmentPlan(app, payload, headers),
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/appointments",
          headers,
          payload: await withAppointmentPlan(app, payload, headers),
        })
      ).statusCode,
    ).toBe(409);
    await app.close();
  });

  it("reschedules one appointment, keeps history and rejects occupied or closed slots", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const base = new Date(Date.now() + 46 * 24 * 60 * 60 * 1000);
    base.setUTCHours(18, 0, 0, 0);
    const at = (hours: number) =>
      new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
    const payload = {
      patientId: patients.json()[0].id,
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
    };
    const first = (
      await app.inject({
        method: "POST",
        url: "/appointments",
        headers,
        payload: await withAppointmentPlan(
          app,
          {
            ...payload,
            startsAt: at(0),
          },
          headers,
        ),
      })
    ).json();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/appointments",
          headers,
          payload: await withAppointmentPlan(
            app,
            {
              ...payload,
              startsAt: at(2),
            },
            headers,
          ),
        })
      ).statusCode,
    ).toBe(201);
    const move = {
      professionalId: payload.professionalId,
      roomId: payload.roomId,
      startsAt: at(1),
    };
    const moved = await app.inject({
      method: "PUT",
      url: `/appointments/${first.id}/schedule`,
      headers,
      payload: move,
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().startsAt).toBe(at(1));
    const history = await app.inject({
      method: "GET",
      url: `/appointments/${first.id}/reschedules`,
      headers,
    });
    expect(history.json()).toHaveLength(1);
    expect(history.json()[0]).toMatchObject({
      previousStartsAt: at(0),
      startsAt: at(1),
      actorName: "Aryana Dutra",
    });
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/appointments/${first.id}/schedule`,
          headers,
          payload: move,
        })
      ).statusCode,
    ).toBe(200);
    const conflict = await app.inject({
      method: "PUT",
      url: `/appointments/${first.id}/schedule`,
      headers,
      payload: { ...move, startsAt: at(2) },
    });
    expect(conflict.statusCode).toBe(409);
    const afterConflict = await app.inject({
      method: "GET",
      url: `/appointments?from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(3))}`,
      headers,
    });
    expect(
      afterConflict.json().find((item: Appointment) => item.id === first.id)
        .startsAt,
    ).toBe(at(1));
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/appointments/${first.id}/reschedules`,
          headers,
        })
      ).json(),
    ).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/appointments/${first.id}/status`,
          headers,
          payload: { status: "cancelled" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/appointments/${first.id}/schedule`,
          headers,
          payload: move,
        })
      ).statusCode,
    ).toBe(409);
    await app.close();
  });

  it("keeps the visit type on create, series, listing and reschedule and counts it in the report", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const base = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    base.setUTCHours(13, 0, 0, 0);
    const at = (hours: number, weeks = 0) =>
      new Date(
        base.getTime() + (weeks * 7 * 24 + hours) * 60 * 60 * 1000,
      ).toISOString();
    const payload = {
      patientId: patients.json()[0].id,
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
    };
    const regular = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: await withAppointmentPlan(
        app,
        { ...payload, startsAt: at(0) },
        headers,
      ),
    });
    expect(regular.statusCode).toBe(201);
    expect(regular.json().visitType).toBe("regular");
    const evaluation = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: await withAppointmentPlan(
        app,
        {
          ...payload,
          startsAt: at(2),
          visitType: "evaluation",
        },
        headers,
      ),
    });
    expect(evaluation.statusCode).toBe(201);
    expect(evaluation.json().visitType).toBe("evaluation");
    const invalid = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: await withAppointmentPlan(
        app,
        {
          ...payload,
          startsAt: at(4),
          visitType: "vip",
        },
        headers,
      ),
    });
    expect(invalid.statusCode).toBe(400);
    const series = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: await withAppointmentPlan(
        app,
        {
          ...payload,
          startsAt: at(4),
          visitType: "trial",
          occurrences: 2,
          intervalWeeks: 1,
        },
        headers,
      ),
    });
    expect(series.statusCode).toBe(201);
    expect(series.json().map((item: Appointment) => item.visitType)).toEqual([
      "trial",
      "trial",
    ]);
    const moved = await app.inject({
      method: "PUT",
      url: `/appointments/${evaluation.json().id}/schedule`,
      headers,
      payload: {
        professionalId: payload.professionalId,
        roomId: payload.roomId,
        startsAt: at(6),
      },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().visitType).toBe("evaluation");
    const listed = await app.inject({
      method: "GET",
      url: `/appointments?from=${encodeURIComponent(at(-1))}&to=${encodeURIComponent(at(8, 1))}`,
      headers,
    });
    const byId = new Map(
      listed.json().map((item: Appointment) => [item.id, item.visitType]),
    );
    expect(byId.get(regular.json().id)).toBe("regular");
    expect(byId.get(evaluation.json().id)).toBe("evaluation");
    for (const item of series.json() as Appointment[])
      expect(byId.get(item.id)).toBe("trial");
    const day = (value: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value));
    const report = await app.inject({
      method: "GET",
      url: `/reports/management?from=${day(at(0))}&to=${day(at(4, 1))}`,
      headers,
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().appointments).toMatchObject({
      total: 4,
      byVisitType: { regular: 1, trial: 2, evaluation: 1 },
    });
    await app.close();
  });

  it("schedules a trial for a lead without converting it and applies the agenda rules", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const clinicId = "11111111-1111-4111-8111-111111111111";
    await seedRoleUsers(app);
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Carla Experimental",
        phone: "11955554444",
        source: "Instagram",
        interest: "Pilates",
      },
    });
    expect(lead.statusCode).toBe(201);
    const leadId = lead.json().id as string;
    const payload = {
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
      startsAt: "2031-05-12T13:00:00.000Z",
      visitType: "trial",
    };

    const denied = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "physiotherapist"), clinicId, role: "user" })}`,
      },
      payload,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
    for (const visitType of [undefined, "regular"]) {
      const invalid = await app.inject({
        method: "POST",
        url: `/leads/${leadId}/appointments`,
        headers,
        payload: { ...payload, visitType },
      });
      expect(invalid.statusCode).toBe(400);
    }
    const missing = await app.inject({
      method: "POST",
      url: "/leads/99999999-9999-4999-8999-000000000000/appointments",
      headers,
      payload,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "LEAD_NOT_FOUND" });

    const receptionHeaders = {
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "reception"), clinicId, role: "user" })}`,
    };
    const created = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers: receptionHeaders,
      payload,
    });
    expect(created.statusCode).toBe(201);
    const appointment = created.json() as Appointment;
    expect(appointment).toMatchObject({
      leadId,
      leadName: "Carla Experimental",
      patientName: "Carla Experimental",
      visitType: "trial",
      status: "scheduled",
    });
    expect(appointment).not.toHaveProperty("patientId");
    const leads = await app.inject({ method: "GET", url: "/leads", headers });
    const storedLead = (leads.json() as Lead[]).find(
      (item) => item.id === leadId,
    );
    expect(storedLead?.stage).toBe("new_contact");
    expect(storedLead).not.toHaveProperty("convertedPatientId");

    const agenda = await app.inject({
      method: "GET",
      url: "/appointments?from=2031-05-12T00:00:00.000Z&to=2031-05-13T00:00:00.000Z",
      headers,
    });
    expect(agenda.json()).toEqual([
      expect.objectContaining({
        id: appointment.id,
        leadId,
        leadName: "Carla Experimental",
      }),
    ]);

    const sameProfessional = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: await withAppointmentPlan(
        app,
        {
          patientId: patients.json()[0].id,
          professionalId: payload.professionalId,
          roomId: rooms.json()[1].id,
          serviceId: payload.serviceId,
          startsAt: payload.startsAt,
        },
        headers,
      ),
    });
    expect(sameProfessional.statusCode).toBe(409);
    expect(sameProfessional.json()).toMatchObject({
      code: "APPOINTMENT_CONFLICT",
    });
    const sameRoom = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, professionalId: professionals.json()[1].id },
    });
    expect(sameRoom.statusCode).toBe(409);
    expect(sameRoom.json()).toMatchObject({ code: "APPOINTMENT_CONFLICT" });

    const block = await app.inject({
      method: "POST",
      url: "/schedule-blocks",
      headers,
      payload: {
        professionalId: payload.professionalId,
        startsAt: "2031-05-13T12:00:00.000Z",
        endsAt: "2031-05-13T18:00:00.000Z",
        reason: "Reunião de equipe",
      },
    });
    expect(block.statusCode).toBe(201);
    const blocked = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-13T13:00:00.000Z" },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: "APPOINTMENT_CONFLICT" });

    const holiday = await app.inject({
      method: "POST",
      url: "/holidays",
      headers,
      payload: { date: "2031-05-14", name: "Feriado municipal" },
    });
    expect(holiday.statusCode).toBe(201);
    const onHoliday = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-14T13:00:00.000Z" },
    });
    expect(onHoliday.statusCode).toBe(409);
    expect(onHoliday.json()).toMatchObject({ code: "HOLIDAY" });

    const evaluation = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: {
        ...payload,
        startsAt: "2031-05-15T13:00:00.000Z",
        visitType: "evaluation",
      },
    });
    expect(evaluation.statusCode).toBe(409);
    expect(evaluation.json()).toMatchObject({ code: "PLAN_REQUIRED" });

    const converted = await app.inject({
      payload: { cpf: nextTestCpf(), ...testPatientContact },
      method: "POST",
      url: `/leads/${leadId}/convert`,
      headers,
    });
    expect(converted.statusCode).toBe(200);
    const afterConversion = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-16T13:00:00.000Z" },
    });
    expect(afterConversion.statusCode).toBe(409);
    expect(afterConversion.json()).toMatchObject({
      code: "LEAD_ALREADY_CONVERTED",
    });
    await app.close();
  });

  it("moves the lead appointments to the new client on conversion", async () => {
    const { app, token, repository } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Elisa Conversão",
        phone: "11933332222",
        source: "Instagram",
        interest: "Pilates",
      },
    });
    const leadId = lead.json().id as string;
    const serviceId = services.json()[0].id as string;
    const payload = {
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId,
    };
    const trial = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: {
        ...payload,
        startsAt: "2031-05-06T13:00:00.000Z",
        visitType: "trial",
      },
    });
    // Avaliação histórica de lead anterior à AP3: a conversão continua preservando-a.
    const evaluation = await repository.createLeadAppointment(
      "11111111-1111-4111-8111-111111111111",
      leadId,
      {
        ...payload,
        startsAt: "2031-05-20T13:00:00.000Z",
        visitType: "evaluation",
      },
    );
    expect(trial.statusCode).toBe(201);
    expect(evaluation).not.toBeNull();
    const ids = [trial.json().id as string, evaluation!.id];

    const conversion = await app.inject({
      payload: { cpf: nextTestCpf(), ...testPatientContact },
      method: "POST",
      url: `/leads/${leadId}/convert`,
      headers,
    });
    expect(conversion.statusCode).toBe(200);
    expect(conversion.json()).toMatchObject({ reusedExisting: false });
    const patientId = conversion.json().patient.id as string;

    const agenda = await app.inject({
      method: "GET",
      url: "/appointments?from=2031-05-01T00:00:00.000Z&to=2031-05-31T00:00:00.000Z",
      headers,
    });
    const moved = (agenda.json() as Appointment[]).filter((item) =>
      ids.includes(item.id),
    );
    expect(moved).toHaveLength(2);
    for (const item of moved) {
      expect(item).toMatchObject({ patientId, patientName: "Elisa Conversão" });
      expect(item).not.toHaveProperty("leadId");
      expect(item).not.toHaveProperty("leadName");
    }
    expect(moved.map((item) => item.visitType).sort()).toEqual([
      "evaluation",
      "trial",
    ]);

    // Linha do tempo do cliente passa a mostrar os atendimentos.
    const timeline = await app.inject({
      method: "GET",
      url: `/patients/${patientId}/timeline`,
      headers,
    });
    expect(timeline.statusCode).toBe(200);
    for (const id of ids) expect(JSON.stringify(timeline.json())).toContain(id);

    // A experimental convertida continua gratuita e não consome o plano.
    const plan = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, {
        services: [
          { serviceId: serviceId, totalSessions: 4, totalValueInCents: 40000 },
        ],
        patientId,
        serviceId,
        name: "Pacote pós-experimental",
        kind: "fixed_package",
        totalSessions: 4,
        validFrom: "2031-05-01",
        totalValueInCents: 40000,
        installments: 1,
        firstDueDate: "2031-05-01",
      }),
    });
    expect(plan.statusCode).toBe(201);
    // Desfecho e evolução só depois do início dos dois atendimentos.
    const afterStart = "2031-05-20T14:00:00.000Z";
    const completed = await patchStatusAt(app, headers, afterStart, ids[0]!, {
      status: "completed",
    });
    expect(completed.statusCode).toBe(200);
    const plans = await app.inject({ method: "GET", url: "/plans", headers });
    expect(
      (plans.json() as { id: string; remainingSessions: number }[]).find(
        (item) => item.id === plan.json().id,
      )?.remainingSessions,
    ).toBe(4);
    // A avaliação do cliente continua consumindo uma sessão, pelo caminho histórico.
    const evaluated = await patchStatusAt(app, headers, afterStart, ids[1]!, {
      status: "completed",
    });
    expect(evaluated.statusCode, evaluated.body).toBe(200);
    const afterEvaluation = await app.inject({
      method: "GET",
      url: "/plans",
      headers,
    });
    expect(
      (
        afterEvaluation.json() as { id: string; remainingSessions: number }[]
      ).find((item) => item.id === plan.json().id)?.remainingSessions,
    ).toBe(3);

    // Prontuário e NPS passam a ser aceitos.
    const record = await atInstant(afterStart, () =>
      app.inject({
        method: "POST",
        url: "/clinical-records",
        headers: reissuedHeaders(app, headers),
        payload: {
          appointmentId: ids[0],
          subjective: "Relato",
          objective: "Exame",
          assessment: "Avaliação",
          plan: "Plano",
        },
      }),
    );
    expect(record.statusCode).toBe(201);
    expect(record.json()).toMatchObject({ patientId });
    const survey = await app.inject({
      method: "POST",
      url: "/satisfaction",
      headers,
      payload: { patientId, appointmentId: ids[0], score: 9 },
    });
    expect(survey.statusCode).toBe(201);
    await app.close();
  });

  it("moves the lead appointments to the reused client on conversion", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const existing = patients.json()[0] as {
      id: string;
      fullName: string;
      phone: string;
    };
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Nome do lead diferente",
        phone: existing.phone,
        source: "Indicação",
        interest: "Fisioterapia",
      },
    });
    const leadId = lead.json().id as string;
    const appointment = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: {
        professionalId: professionals.json()[0].id,
        roomId: rooms.json()[0].id,
        serviceId: services.json()[0].id,
        startsAt: "2031-05-06T13:00:00.000Z",
        visitType: "trial",
      },
    });
    expect(appointment.statusCode).toBe(201);

    const conversion = await app.inject({
      payload: { cpf: nextTestCpf(), ...testPatientContact },
      method: "POST",
      url: `/leads/${leadId}/convert`,
      headers,
    });
    expect(conversion.json()).toMatchObject({
      reusedExisting: true,
      patient: { id: existing.id },
    });
    const agenda = await app.inject({
      method: "GET",
      url: "/appointments?from=2031-05-06T00:00:00.000Z&to=2031-05-07T00:00:00.000Z",
      headers,
    });
    const moved = (agenda.json() as Appointment[]).find(
      (item) => item.id === appointment.json().id,
    );
    expect(moved).toMatchObject({
      patientId: existing.id,
      patientName: existing.fullName,
      visitType: "trial",
    });
    expect(moved).not.toHaveProperty("leadId");
    expect(moved).not.toHaveProperty("leadName");
    const timeline = await app.inject({
      method: "GET",
      url: `/patients/${existing.id}/timeline`,
      headers,
    });
    expect(JSON.stringify(timeline.json())).toContain(appointment.json().id);
    await app.close();
  });

  it("creates installments and consumes a session exactly once", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const appointments = await app.inject({
      method: "GET",
      url: `/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      headers,
    });
    const appointment = appointments.json()[0];
    const service = services
      .json()
      .find((item: { id: string }) => item.id === appointment.serviceId);
    const patient = patients
      .json()
      .find((item: { id: string }) => item.id === appointment.patientId);
    const date = appointment.startsAt.slice(0, 10);
    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, {
        services: [
          { serviceId: service.id, totalSessions: 5, totalValueInCents: 10001 },
        ],
        patientId: patient.id,
        serviceId: service.id,
        name: "Pacote teste",
        kind: "fixed_package",
        totalSessions: 5,
        validFrom: date,
        totalValueInCents: 10001,
        installments: 3,
        firstDueDate: date,
      }),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ remainingSessions: 5 });

    const financial = await app.inject({
      method: "GET",
      url: "/finance/summary",
      headers,
    });
    expect(financial.json().receivables).toHaveLength(3);
    expect(
      financial
        .json()
        .receivables.reduce(
          (sum: number, item: { amountInCents: number }) =>
            sum + item.amountInCents,
          0,
        ),
    ).toBe(10001);

    // Realizado só vale a partir do início do atendimento: conclui com o relógio nele.
    const completed = await patchStatusAt(
      app,
      headers,
      appointment.startsAt,
      appointment.id,
      { status: "completed" },
    );
    expect(completed.statusCode).toBe(200);
    let plans = await app.inject({ method: "GET", url: "/plans", headers });
    expect(plans.json()[0].remainingSessions).toBe(4);

    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointment.id}/status`,
      headers,
      payload: { status: "confirmed" },
    });
    plans = await app.inject({ method: "GET", url: "/plans", headers });
    expect(plans.json()[0].remainingSessions).toBe(5);

    const receivableId = financial.json().receivables[0].id;
    const paid = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivableId}/pay`,
      headers,
    });
    expect(paid.json().status).toBe("paid");
    const reversed = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivableId}/reverse`,
      headers,
    });
    expect(reversed.json().status).toBe("open");
    await app.inject({
      method: "PATCH",
      url: `/plans/${created.json().id}/status`,
      headers,
      payload: { status: "cancelled" },
    });
    const afterCancellation = await app.inject({
      method: "GET",
      url: "/finance/summary",
      headers,
    });
    expect(
      afterCancellation
        .json()
        .receivables.every(
          (item: { status: string }) => item.status === "cancelled",
        ),
    ).toBe(true);
    await app.close();
  });

  it("moves and converts leads without duplicating patients", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const before = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const existing = before.json()[0];
    const created = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: existing.fullName,
        phone: existing.phone,
        source: "Indicação",
        interest: "Fisioterapia",
      },
    });
    expect(created.statusCode).toBe(201);
    const invalidLoss = await app.inject({
      method: "PATCH",
      url: `/leads/${created.json().id}/stage`,
      headers,
      payload: { stage: "lost" },
    });
    expect(invalidLoss.statusCode).toBe(400);
    const moved = await app.inject({
      method: "PATCH",
      url: `/leads/${created.json().id}/stage`,
      headers,
      payload: { stage: "contacted" },
    });
    expect(moved.json().stage).toBe("contacted");
    const conversion = await app.inject({
      payload: { cpf: nextTestCpf(), ...testPatientContact },
      method: "POST",
      url: `/leads/${created.json().id}/convert`,
      headers,
    });
    expect(conversion.json()).toMatchObject({
      reusedExisting: true,
      patient: { id: existing.id },
      lead: { stage: "won" },
    });
    const after = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    expect(after.json()).toHaveLength(before.json().length);
    await app.close();
  });

  it("sends WhatsApp messages to the dedicated number", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const patient = patients.json()[0];
    const updated = await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: {
        cpf: nextTestCpf(),
        fullName: patient.fullName,
        phone: patient.phone,
        whatsapp: "(11) 90000-1234",
        emergencyContactName: patient.emergencyContactName,
        emergencyContactPhone: patient.emergencyContactPhone,
        email: "contato@example.com",
        tags: patient.tags,
      },
    });
    expect(updated.json().whatsapp).toBe("11900001234");
    const sent = await app.inject({
      method: "POST",
      url: "/communications/messages",
      headers,
      payload: { patientId: patient.id, channel: "whatsapp", body: "Olá" },
    });
    expect(sent.json().recipient).toBe("11900001234");
    const byEmail = await app.inject({
      method: "POST",
      url: "/communications/messages",
      headers,
      payload: { patientId: patient.id, channel: "email", body: "Olá" },
    });
    expect(byEmail.json().recipient).toBe("contato@example.com");
    // CD1: o WhatsApp gravado não se apaga (o envio pelo telefone, para quem não tem
    // WhatsApp, fica em patient-contact-required.integration.test.ts).
    const withoutWhatsapp = await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: {
        cpf: nextTestCpf(),
        fullName: patient.fullName,
        phone: patient.phone,
        whatsapp: "",
        emergencyContactName: patient.emergencyContactName,
        emergencyContactPhone: patient.emergencyContactPhone,
        tags: patient.tags,
      },
    });
    expect(withoutWhatsapp.statusCode).toBe(400);
    expect(withoutWhatsapp.json()).toMatchObject({
      code: "PATIENT_WHATSAPP_REQUIRED",
    });
    await app.close();
  });

  it("versions templates without changing issued document snapshots", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const patient = patients.json()[0];
    const template = await app.inject({
      method: "POST",
      url: "/document-templates",
      headers,
      payload: {
        name: "Contrato de teste",
        kind: "contract",
        body: "Versão original para {{paciente_nome}} em {{data_emissao}}.",
      },
    });
    expect(template.statusCode).toBe(201);
    expect(template.json()).toMatchObject({ version: 1, active: true });
    const document = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        templateId: template.json().id,
        patientId: patient.id,
        title: "Contrato preservado",
      },
    });
    expect(document.statusCode).toBe(201);
    expect(document.json().snapshotBody).toContain("Versão original");
    expect(document.json().snapshotBody).toContain(patient.fullName);
    const nextVersion = await app.inject({
      method: "POST",
      url: `/document-templates/${template.json().id}/versions`,
      headers,
      payload: { body: "Nova versão do contrato para {{paciente_nome}}." },
    });
    expect(nextVersion.json()).toMatchObject({ version: 2, active: true });
    const documents = await app.inject({
      method: "GET",
      url: "/documents",
      headers,
    });
    expect(documents.json()[0].snapshotBody).toContain("Versão original");
    const issued = await app.inject({
      method: "PATCH",
      url: `/documents/${document.json().id}/status`,
      headers,
      payload: { status: "issued" },
    });
    expect(issued.json()).toMatchObject({ status: "issued" });
    const cancelled = await app.inject({
      method: "PATCH",
      url: `/documents/${document.json().id}/status`,
      headers,
      payload: { status: "cancelled" },
    });
    expect(cancelled.json()).toMatchObject({ status: "cancelled" });
    const invalidTransition = await app.inject({
      method: "PATCH",
      url: `/documents/${document.json().id}/status`,
      headers,
      payload: { status: "issued" },
    });
    expect(invalidTransition.statusCode).toBe(409);
    await app.close();
  });

  it("replaces every field offered by the template editor when issuing", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patient = (
      await app.inject({ method: "GET", url: "/patients", headers })
    ).json()[0];
    const template = await app.inject({
      method: "POST",
      url: "/document-templates",
      headers,
      payload: {
        name: "Todos os campos",
        kind: "other",
        body: documentTemplateVariables
          .map((variable) => `${variable.label}: {{${variable.key}}}`)
          .join("\n"),
      },
    });
    const document = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        templateId: template.json().id,
        patientId: patient.id,
        title: "Todos os campos",
      },
    });
    expect(document.statusCode).toBe(201);
    expect(document.json().snapshotBody).not.toContain("{{");
    expect(document.json().snapshotBody).toContain(
      `Nome do cliente: ${patient.fullName}`,
    );
    await app.close();
  });

  it("fills professional variables when issuing a document", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
    ]);
    const patient = patients.json()[0];
    const professional = professionals.json()[0];
    const template = await app.inject({
      method: "POST",
      url: "/document-templates",
      headers,
      payload: {
        name: "Declaração assinada",
        kind: "attendance_declaration",
        body: "Declaro que {{paciente_nome}} foi atendido por [{{profissional_nome}}] [{{profissional_crefito}}].",
      },
    });
    expect(template.statusCode).toBe(201);
    const withProfessional = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        templateId: template.json().id,
        patientId: patient.id,
        professionalId: professional.id,
        title: "Declaração com profissional",
      },
    });
    expect(withProfessional.statusCode).toBe(201);
    expect(withProfessional.json()).toMatchObject({
      professionalId: professional.id,
    });
    expect(withProfessional.json().snapshotBody).toContain(
      `[${professional.fullName}] [${professional.crefito}]`,
    );
    const withoutProfessional = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        templateId: template.json().id,
        patientId: patient.id,
        title: "Declaração sem profissional",
      },
    });
    expect(withoutProfessional.statusCode).toBe(201);
    expect(withoutProfessional.json().snapshotBody).toContain("[] []");
    expect(withoutProfessional.json().snapshotBody).not.toContain("{{");
    const unknownProfessional = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        templateId: template.json().id,
        patientId: patient.id,
        professionalId: "99999999-9999-4999-8999-999999999999",
        title: "Declaração inválida",
      },
    });
    expect(unknownProfessional.statusCode).toBe(404);
    expect(unknownProfessional.json()).toMatchObject({
      code: "PROFESSIONAL_NOT_FOUND",
    });
    await app.close();
  });

  it("creates recurring appointments atomically and enforces schedule blocks", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const start = new Date();
    start.setDate(start.getDate() + 30);
    start.setHours(15, 0, 0, 0);
    const input = {
      patientId: patients.json()[0].id,
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
      startsAt: start.toISOString(),
      occurrences: 3,
      intervalWeeks: 1,
    };
    const recurring = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: await withAppointmentPlan(app, input, headers),
    });
    expect(recurring.statusCode).toBe(201);
    expect(recurring.json()).toHaveLength(3);
    expect(
      new Set(recurring.json().map((item: Appointment) => item.seriesId)).size,
    ).toBe(1);

    const blockedStart = new Date(start);
    blockedStart.setHours(18, 0, 0, 0);
    const blockedEnd = new Date(blockedStart);
    blockedEnd.setHours(19, 0, 0, 0);
    const block = await app.inject({
      method: "POST",
      url: "/schedule-blocks",
      headers,
      payload: {
        professionalId: input.professionalId,
        startsAt: blockedStart.toISOString(),
        endsAt: blockedEnd.toISOString(),
        reason: "Reunião de equipe",
      },
    });
    expect(block.statusCode).toBe(201);
    const conflicting = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: await withAppointmentPlan(
        app,
        {
          ...input,
          startsAt: blockedStart.toISOString(),
        },
        headers,
      ),
    });
    expect(conflicting.statusCode).toBe(409);
    await app.inject({
      method: "POST",
      url: `/schedule-blocks/${block.json().id}/cancel`,
      headers,
    });
    const afterCancellation = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: await withAppointmentPlan(
        app,
        {
          ...input,
          startsAt: blockedStart.toISOString(),
        },
        headers,
      ),
    });
    expect(afterCancellation.statusCode).toBe(201);
    await app.close();
  });

  it("tracks lead contacts, owners, tags and overdue tasks", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const ownerId = "22222222-2222-4222-8222-222222222222";
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Contato Comercial",
        phone: "11999990000",
        source: "Instagram",
        interest: "Pilates",
        responsibleUserId: ownerId,
        tags: ["Prioridade", "Pilates"],
      },
    });
    expect(lead.statusCode).toBe(201);
    expect(lead.json()).toMatchObject({
      responsibleName: "Aryana Dutra",
      tags: ["Prioridade", "Pilates"],
    });
    const contact = await app.inject({
      method: "POST",
      url: `/leads/${lead.json().id}/contacts`,
      headers,
      payload: {
        channel: "whatsapp",
        direction: "outbound",
        notes: "Apresentação enviada e avaliação explicada.",
      },
    });
    expect(contact.statusCode).toBe(201);
    expect(contact.json()).toMatchObject({ actorName: "Aryana Dutra" });
    const task = await app.inject({
      method: "POST",
      url: `/leads/${lead.json().id}/tasks`,
      headers,
      payload: {
        title: "Retornar contato",
        dueAt: new Date(Date.now() - 60_000).toISOString(),
        assignedUserId: ownerId,
      },
    });
    expect(task.statusCode).toBe(201);
    let leads = await app.inject({ method: "GET", url: "/leads", headers });
    const withTask = leads
      .json()
      .find((item: Lead) => item.id === lead.json().id);
    expect(withTask).toMatchObject({ openTasks: 1, overdueTasks: 1 });
    const activity = await app.inject({
      method: "GET",
      url: `/leads/${lead.json().id}/activity`,
      headers,
    });
    expect(activity.json().contacts).toHaveLength(1);
    expect(activity.json().tasks).toHaveLength(1);
    await app.inject({
      method: "PATCH",
      url: `/lead-tasks/${task.json().id}/status`,
      headers,
      payload: { status: "completed" },
    });
    leads = await app.inject({ method: "GET", url: "/leads", headers });
    expect(
      leads.json().find((item: Lead) => item.id === lead.json().id),
    ).toMatchObject({ openTasks: 0, overdueTasks: 0 });
    await app.close();
  });

  it("reports client rankings and the age distribution of active clients", async () => {
    // Os dados demo são montados na data real; o período do teste fica longe deles.
    const { app } = await authenticatedApp();
    vi.useFakeTimers({ toFake: ["Date"] });
    // 12h de São Paulo de quarta, 17/05/2034.
    vi.setSystemTime(new Date("2034-05-17T15:00:00.000Z"));
    try {
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const headersAs = (role: UserRole = "owner") => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const headers = headersAs();
      type Report = {
        from: string;
        to: string;
        topBySessions: { patientId: string; completedSessions: number }[];
        activeClients: number;
        ageDistribution: { band: string; clients: number }[];
      };
      const clientsReport = async (
        query = "?from=2034-05-01&to=2034-05-31",
      ) => {
        const response = await app.inject({
          method: "GET",
          url: `/reports/clients${query}`,
          headers,
        });
        expect(response.statusCode).toBe(200);
        return response.json() as Report;
      };
      // Os dados demo (planos em aberto) também entram: compara-se a diferença.
      const before = await clientsReport();
      expect(before).toMatchObject({ from: "2034-05-01", to: "2034-05-31" });

      const [services, professionals, rooms] = await Promise.all([
        app.inject({ method: "GET", url: "/services", headers }),
        app.inject({ method: "GET", url: "/professionals", headers }),
        app.inject({ method: "GET", url: "/rooms", headers }),
      ]);
      const createPatient = async (
        fullName: string,
        phone: string,
        birthDate: string,
      ) => {
        const response = await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload: {
            cpf: nextTestCpf(),
            fullName,
            phone,
            whatsapp: phone,
            emergencyContactName: fullName,
            emergencyContactPhone: phone,
            birthDate,
            tags: [],
          },
        });
        expect(response.statusCode).toBe(201);
        return response.json().id as string;
      };
      const completedVisit = async (patientId: string, startsAt: string) => {
        const created = await app.inject({
          method: "POST",
          url: "/appointments",
          headers,
          payload: await withAppointmentPlan(
            app,
            {
              patientId,
              professionalId: professionals.json()[0].id,
              roomId: rooms.json()[0].id,
              serviceId: services.json()[0].id,
              startsAt,
            },
            headers,
          ),
        });
        expect(created.statusCode).toBe(201);
        const completed = await app.inject({
          method: "PATCH",
          url: `/appointments/${created.json().id}/status`,
          headers,
          payload: { status: "completed" },
        });
        expect(completed.statusCode).toBe(200);
      };
      const paidPlan = async (patientId: string) => {
        const plan = await app.inject({
          method: "POST",
          url: "/plans",
          headers,
          payload: await configuredPlan(app, {
            services: [
              {
                serviceId: services.json()[0].id,
                totalSessions: 4,
                totalValueInCents: 12_000,
              },
            ],
            patientId,
            serviceId: services.json()[0].id,
            kind: "fixed_package",
            name: "Plano do ranking",
            totalSessions: 4,
            validFrom: "2034-05-01",
            totalValueInCents: 12_000,
            installments: 1,
            firstDueDate: "2034-05-10",
          }),
        });
        expect(plan.statusCode).toBe(201);
        const receivable = (
          await app.inject({
            method: "GET",
            url: "/finance/workspace",
            headers,
          })
        )
          .json()
          .summary.receivables.find(
            (item: { planId?: string }) => item.planId === plan.json().id,
          );
        const paid = await app.inject({
          method: "POST",
          url: `/finance/receivables/${receivable.id}/pay`,
          headers,
          payload: { paymentMethod: "pix" },
        });
        expect(paid.statusCode).toBe(200);
        return receivable.id as string;
      };

      // 44 anos em 31/05/2034 (faz 45 só em 01/06); duas sessões; pago e estornado.
      const adult = await createPatient(
        "Ranking Adulto",
        "11955560001",
        "1989-06-01",
      );
      // Sem data de nascimento; uma sessão; pago.
      const noDate = await createPatient("Ranking Sem Data", "11955560002", "");
      await completedVisit(adult, "2034-05-15T13:00:00.000Z");
      await completedVisit(adult, "2034-05-16T13:00:00.000Z");
      await completedVisit(noDate, "2034-05-15T16:00:00.000Z");
      const reversedReceivable = await paidPlan(adult);
      await paidPlan(noDate);
      const reversed = await app.inject({
        method: "POST",
        url: `/finance/receivables/${reversedReceivable}/reverse`,
        headers,
      });
      expect(reversed.statusCode).toBe(200);

      const after = await clientsReport();
      const sessionsIndex = (patientId: string) =>
        after.topBySessions.findIndex((item) => item.patientId === patientId);
      expect(after.topBySessions[sessionsIndex(adult)]?.completedSessions).toBe(
        2,
      );
      expect(
        after.topBySessions[sessionsIndex(noDate)]?.completedSessions,
      ).toBe(1);
      expect(sessionsIndex(adult)).toBeLessThan(sessionsIndex(noDate));
      expect(before.topBySessions).toEqual([]);
      expect(after.topBySessions.map((item) => item.patientId)).toEqual([
        adult,
        noDate,
      ]);
      // Receita por cliente fica em Vendas (maiores compradores), não aqui.
      expect(after).not.toHaveProperty("topByRevenue");
      expect(after.activeClients - before.activeClients).toBe(2);
      const bandDelta = (band: string) =>
        after.ageDistribution.find((item) => item.band === band)!.clients -
        before.ageDistribution.find((item) => item.band === band)!.clients;
      expect(bandDelta("30-44")).toBe(1);
      expect(bandDelta("unknown")).toBe(1);
      expect(bandDelta("45-59")).toBe(0);

      // Fora do período: nada dos novos clientes nos rankings.
      const april = await clientsReport("?from=2034-04-01&to=2034-04-30");
      expect(april.topBySessions.some((item) => item.patientId === adult)).toBe(
        false,
      );

      // Parâmetros vazios: até hoje, seis meses.
      expect(await clientsReport("?from=&to=")).toMatchObject({
        from: "2033-12-01",
        to: "2034-05-17",
      });
      for (const query of ["?from=abc", "?from=2034-06-01&to=2034-05-01"]) {
        const invalid = await app.inject({
          method: "GET",
          url: `/reports/clients${query}`,
          headers,
        });
        expect(invalid.statusCode).toBe(400);
      }
      const finance = await app.inject({
        method: "GET",
        url: "/reports/clients",
        headers: headersAs("finance"),
      });
      expect(finance.statusCode).toBe(200);
      for (const role of ["reception", "physiotherapist"] as const) {
        const denied = await app.inject({
          method: "GET",
          url: "/reports/clients",
          headers: headersAs(role),
        });
        expect(denied.statusCode).toBe(403);
      }
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a protected longitudinal clinical record", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const patient = patients.json()[0];
    let workspace = await app.inject({
      method: "GET",
      url: `/clinical-workspace/${patient.id}`,
      headers,
    });
    expect(workspace.statusCode).toBe(200);
    const customTemplate = await app.inject({
      method: "POST",
      url: "/assessment-templates",
      headers,
      payload: {
        name: "Avaliação funcional lombar",
        specialty: "Fisioterapia ortopédica",
        fields: [
          {
            key: "chief_complaint",
            label: "Queixa principal",
            type: "text",
            required: true,
          },
          {
            key: "pain_scale",
            label: "Escala de dor",
            type: "scale",
            required: true,
            min: 0,
            max: 10,
            unit: "0–10",
          },
          {
            key: "range_of_motion",
            label: "Amplitude de movimento",
            type: "number",
            required: false,
            unit: "graus",
          },
        ],
      },
    });
    expect(customTemplate.statusCode).toBe(201);
    const template = customTemplate.json();

    const invalidAssessment = await app.inject({
      method: "POST",
      url: "/clinical-assessments",
      headers,
      payload: {
        patientId: patient.id,
        templateId: template.id,
        values: { chief_complaint: "Dor lombar", pain_scale: 12 },
      },
    });
    expect(invalidAssessment.statusCode).toBe(400);

    const assessment = await app.inject({
      method: "POST",
      url: "/clinical-assessments",
      headers,
      payload: {
        patientId: patient.id,
        templateId: template.id,
        values: {
          chief_complaint: "Dor lombar ao permanecer sentado.",
          pain_scale: 7,
          range_of_motion: 65,
        },
        notes: "Avaliação inicial.",
      },
    });
    expect(assessment.statusCode).toBe(201);
    expect(assessment.json()).toMatchObject({
      patientId: patient.id,
      templateName: template.name,
    });

    const goal = await app.inject({
      method: "POST",
      url: "/therapeutic-goals",
      headers,
      payload: {
        patientId: patient.id,
        title: "Reduzir escala de dor",
        baselineValue: 7,
        targetValue: 2,
        unit: "0–10",
      },
    });
    expect(goal.statusCode).toBe(201);
    const measurement = await app.inject({
      method: "POST",
      url: "/clinical-measurements",
      headers,
      payload: {
        patientId: patient.id,
        goalId: goal.json().id,
        name: "Escala de dor",
        value: 2,
        unit: "0–10",
        measuredAt: new Date().toISOString(),
      },
    });
    expect(measurement.statusCode).toBe(201);
    const achieved = await app.inject({
      method: "PATCH",
      url: `/therapeutic-goals/${goal.json().id}/status`,
      headers,
      payload: { status: "achieved" },
    });
    expect(achieved.json()).toMatchObject({ status: "achieved" });
    expect(achieved.json().achievedAt).toBeTypeOf("string");

    const closure = await app.inject({
      method: "POST",
      url: "/treatment-closures",
      headers,
      payload: {
        patientId: patient.id,
        kind: "discharge",
        summary: "Objetivos alcançados e quadro funcional estabilizado.",
        recommendations: "Manter exercícios domiciliares.",
        occurredAt: new Date().toISOString(),
      },
    });
    expect(closure.statusCode).toBe(201);

    const [professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: await withAppointmentPlan(
        app,
        {
          patientId: patient.id,
          professionalId: professionals.json()[0].id,
          roomId: rooms.json()[0].id,
          serviceId: services.json()[0].id,
          startsAt: new Date(
            Date.now() - 40 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
        headers,
      ),
    });
    expect(appointment.statusCode).toBe(201);
    const draft = await app.inject({
      method: "POST",
      url: "/clinical-records",
      headers,
      payload: {
        appointmentId: appointment.json().id,
        subjective: "Cliente relata melhora funcional progressiva.",
        objective: "Teste funcional com resposta satisfatória.",
        assessment: "Evolução compatível com os objetivos propostos.",
        plan: "Finalizar ciclo e manter programa domiciliar.",
        painScale: 2,
      },
    });
    const prematureAddendum = await app.inject({
      method: "POST",
      url: "/clinical-addenda",
      headers,
      payload: {
        clinicalRecordId: draft.json().id,
        reason: "Complemento necessário",
        content: "Informação clínica complementar registrada posteriormente.",
      },
    });
    expect(prematureAddendum.statusCode).toBe(409);
    await app.inject({
      method: "POST",
      url: `/clinical-records/${draft.json().id}/finalize`,
      headers,
    });
    const addendum = await app.inject({
      method: "POST",
      url: "/clinical-addenda",
      headers,
      payload: {
        clinicalRecordId: draft.json().id,
        reason: "Complemento necessário",
        content: "Informação clínica complementar registrada posteriormente.",
      },
    });
    expect(addendum.statusCode).toBe(201);

    const pdfContent = Buffer.from("%PDF-1.4\nclinical-test");
    const invalidAttachment = await app.inject({
      method: "POST",
      url: "/clinical-attachments",
      headers,
      payload: {
        patientId: patient.id,
        fileName: "imagem-falsa.pdf",
        mimeType: "application/pdf",
        sizeInBytes: 4,
        contentBase64: Buffer.from("fake").toString("base64"),
      },
    });
    expect(invalidAttachment.statusCode).toBe(400);
    const attachment = await app.inject({
      method: "POST",
      url: "/clinical-attachments",
      headers,
      payload: {
        patientId: patient.id,
        fileName: "laudo.pdf",
        mimeType: "application/pdf",
        sizeInBytes: pdfContent.length,
        contentBase64: pdfContent.toString("base64"),
        notes: "Laudo de apoio.",
      },
    });
    expect(attachment.statusCode).toBe(201);
    expect(attachment.json().sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(attachment.json().contentBase64).toBeUndefined();
    const downloaded = await app.inject({
      method: "GET",
      url: `/clinical-attachments/${attachment.json().id}/content`,
      headers,
    });
    expect(downloaded.json().contentBase64).toBe(pdfContent.toString("base64"));
    const exported = await app.inject({
      method: "GET",
      url: `/clinical-workspace/${patient.id}/export`,
      headers,
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-disposition"]).toContain("attachment");

    workspace = await app.inject({
      method: "GET",
      url: `/clinical-workspace/${patient.id}`,
      headers,
    });
    expect(workspace.json().assessments).toHaveLength(1);
    expect(workspace.json().measurements).toHaveLength(1);
    expect(workspace.json().closures).toHaveLength(1);
    expect(workspace.json().attachments).toHaveLength(1);
    expect(workspace.json().addenda).toHaveLength(1);
    expect(workspace.json().goals[0]).toMatchObject({ status: "achieved" });
    const accessEvents = await app.inject({
      method: "GET",
      url: `/clinical-workspace/${patient.id}/access-events`,
      headers,
    });
    expect(
      accessEvents.json().map((item: { action: string }) => item.action),
    ).toEqual(
      expect.arrayContaining([
        "read",
        "upload",
        "download",
        "export",
        "addendum",
      ]),
    );
    await app.close();
  });

  it("manages group capacity, waitlist and one-time replacement credits", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
    ]);
    const references = {
      // Só clientes ativos podem ser matriculados.
      patients: patients
        .json()
        .filter((item: { status: string }) => item.status === "active"),
      service: services.json()[0],
      professional: professionals.json()[0],
      room: rooms
        .json()
        .find((item: { capacity: number }) => item.capacity >= 4),
    };
    const createGroup = async (
      capacity: number,
      weeklySlots = [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
    ) =>
      app.inject({
        method: "POST",
        url: "/groups",
        headers,
        payload: {
          capacity,
          serviceId: references.service.id,
          professionalId: references.professional.id,
          roomId: references.room.id,
          weeklySlots,
        },
      });
    const group = await createGroup(1);
    expect(group.statusCode).toBe(201);
    expect(group.json().name).toBe(
      groupClassName(references.service.name, group.json().sequence),
    );
    const enroll = (patientId: string) =>
      app.inject({
        method: "POST",
        url: "/group-enrollments",
        headers,
        payload: { groupId: group.json().id, patientId },
      });
    const first = await enroll(references.patients[0].id);
    const waiting = await enroll(references.patients[1].id);
    expect(first.json().status).toBe("active");
    expect(waiting.json()).toMatchObject({
      status: "waitlisted",
      queuePosition: 1,
    });
    const updatedGroup = await app.inject({
      method: "PUT",
      url: `/groups/${group.json().id}`,
      headers,
      payload: {
        capacity: 2,
        weeklySlots: [
          { weekday: 2, startTime: "18:00", endTime: "19:00" },
          { weekday: 4, startTime: "18:00", endTime: "19:30" },
        ],
      },
    });
    expect(updatedGroup.statusCode).toBe(200);
    expect(updatedGroup.json()).toMatchObject({
      capacity: 2,
      activeEnrollments: 1,
      waitlistCount: 1,
    });
    const accepted = await app.inject({
      method: "POST",
      url: `/group-enrollments/${waiting.json().id}/confirm`,
      headers,
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe("active");
    expect(updatedGroup.json().weeklySlots).toHaveLength(2);
    const tooSmall = await app.inject({
      method: "PUT",
      url: `/groups/${group.json().id}`,
      headers,
      payload: { capacity: 1, weeklySlots: updatedGroup.json().weeklySlots },
    });
    expect(tooSmall.statusCode).toBe(409);
    await app.inject({
      method: "POST",
      url: `/group-enrollments/${first.json().id}/cancel`,
      headers,
    });
    const agendaRange = `from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 13 * 7 * 86_400_000).toISOString())}`;
    const agenda = await app.inject({
      method: "GET",
      url: `/group-sessions?${agendaRange}`,
      headers,
    });
    expect(agenda.statusCode).toBe(200);
    const sessions = agenda
      .json()
      .filter((item: { groupId: string }) => item.groupId === group.json().id);
    // Terças 18:00–19:00 e quintas 18:00–19:30 reservadas automaticamente por 12 semanas.
    expect(sessions.length).toBeGreaterThanOrEqual(22);
    for (const session of sessions) {
      const local = localParts(new Date(session.startsAt), "America/Sao_Paulo");
      const minutes =
        (new Date(session.endsAt).getTime() -
          new Date(session.startsAt).getTime()) /
        60_000;
      expect([local.weekday, local.time, minutes]).toEqual(
        local.weekday === 2 ? [2, "18:00", 60] : [4, "18:00", 90],
      );
    }
    expect(sessions[0]).toMatchObject({
      professionalName: references.professional.fullName,
      roomName: references.room.name,
    });
    const startsAt = new Date(sessions[0].startsAt);
    const attendance = await app.inject({
      method: "PUT",
      url: `/group-sessions/${sessions[0].id}/attendance/${references.patients[1].id}`,
      headers,
      payload: { status: "excused_absence", notes: "Atestado" },
    });
    expect(attendance.statusCode).toBe(200);
    const workspace = await app.inject({
      method: "GET",
      url: `/groups/workspace?from=${encodeURIComponent(startsAt.toISOString())}&to=${encodeURIComponent(new Date(startsAt.getTime() + 20 * 86_400_000).toISOString())}`,
      headers,
    });
    expect(
      workspace
        .json()
        .enrollments.find(
          (item: { id: string }) => item.id === waiting.json().id,
        ).status,
    ).toBe("active");
    const credit = workspace.json().replacementCredits[0];
    expect(credit.status).toBe("available");
    const sameSlot = await createGroup(4);
    expect(sameSlot.statusCode).toBe(409);
    expect(sameSlot.json().message).toContain(group.json().name);
    const targetGroup = await createGroup(4, [
      { weekday: 3, startTime: "10:00", endTime: "11:00" },
    ]);
    expect(targetGroup.json()).toMatchObject({
      sequence: group.json().sequence + 1,
      name: groupClassName(references.service.name, group.json().sequence + 1),
    });
    const targetSessions = await app.inject({
      method: "GET",
      url: `/group-sessions?${agendaRange}`,
      headers,
    });
    const targetSession = targetSessions
      .json()
      .find(
        (item: { groupId: string }) => item.groupId === targetGroup.json().id,
      );
    const booking = await app.inject({
      method: "POST",
      url: "/group-replacements/book",
      headers,
      payload: { creditId: credit.id, sessionId: targetSession.id },
    });
    expect(booking.json().credit.status).toBe("used");
    const duplicate = await app.inject({
      method: "POST",
      url: "/group-replacements/book",
      headers,
      payload: { creditId: credit.id, sessionId: targetSession.id },
    });
    expect(duplicate.statusCode).toBe(409);
    await app.close();
  });

  it("reserves group hours in the agenda and blocks conflicting appointments", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
    ]);
    const service = services.json()[0];
    const professional = professionals.json()[0];
    const room = rooms
      .json()
      .find((item: { capacity: number }) => item.capacity >= 4);
    const timezone = "America/Sao_Paulo";
    // Primeira sexta-feira a partir de `weeksAhead` semanas, no horário local informado.
    const friday = (weeksAhead: number, time: string) => {
      let date = localParts(
        new Date(Date.now() + weeksAhead * 7 * 86_400_000),
        timezone,
      ).date;
      while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 5) {
        const next = new Date(`${date}T12:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        date = next.toISOString().slice(0, 10);
      }
      return zonedTimeToUtc(date, time, timezone).toISOString();
    };
    const book = async (startsAt: string) =>
      app.inject({
        method: "POST",
        url: "/appointments",
        headers,
        payload: await withAppointmentPlan(
          app,
          {
            patientId: patients.json()[0].id,
            professionalId: professional.id,
            roomId: room.id,
            serviceId: service.id,
            startsAt,
          },
          headers,
        ),
      });
    const createGroup = (startTime: string, endTime: string) =>
      app.inject({
        method: "POST",
        url: "/groups",
        headers,
        payload: {
          capacity: 4,
          serviceId: service.id,
          professionalId: professional.id,
          roomId: room.id,
          weeklySlots: [{ weekday: 5, startTime, endTime }],
        },
      });

    const booked = await book(friday(20, "07:00"));
    expect(booked.statusCode).toBe(201);
    const blocked = await createGroup("07:00", "08:00");
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe("GROUP_SCHEDULE_CONFLICT");
    expect(blocked.json().message).toContain("Atendimento de");

    const group = await createGroup("06:00", "06:50");
    expect(group.statusCode).toBe(201);
    expect((await book(friday(2, "06:00"))).json().code).toBe(
      "APPOINTMENT_CONFLICT",
    );
    // Além das 12 semanas já reservadas, o horário fixo da turma continua ocupado.
    expect((await book(friday(30, "06:30"))).json().code).toBe(
      "APPOINTMENT_CONFLICT",
    );
    expect((await book(friday(30, "06:50"))).statusCode).toBe(201);
    await app.close();
  });

  it("lists contact suggestions and hides them after a contact or until the snooze date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00.000Z"));
    try {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const roleHeaders = (role: UserRole) => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const patient = (
        await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload: {
            cpf: nextTestCpf(),
            fullName: "Rita Relacionamento",
            phone: "11955554444",
            whatsapp: "11955554444",
            emergencyContactName: "Rita Relacionamento",
            emergencyContactPhone: "11955554444",
            birthDate: "1990-10-10",
            tags: [],
          },
        })
      ).json() as { id: string };
      const service = (
        await app.inject({ method: "GET", url: "/services", headers })
      ).json()[0] as { id: string };
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: await configuredPlan(app, {
          services: [
            {
              serviceId: service.id,
              totalSessions: 20,
              totalValueInCents: 30000,
            },
          ],
          patientId: patient.id,
          serviceId: service.id,
          name: "Pacote relacionamento",
          kind: "fixed_package",
          totalSessions: 20,
          validFrom: "2026-09-01",
          validUntil: "2027-03-01",
          totalValueInCents: 30000,
          installments: 1,
          firstDueDate: "2026-09-05",
        }),
      });
      expect(plan.statusCode).toBe(201);

      type Suggestion = {
        patientId: string;
        reason: string;
        referenceKey: string;
      };
      const suggestionsFor = async (requestHeaders: Record<string, string>) => {
        const response = await app.inject({
          method: "GET",
          url: "/relationship/suggestions",
          headers: requestHeaders,
        });
        expect(response.statusCode).toBe(200);
        return (response.json() as Suggestion[]).filter(
          (item) => item.patientId === patient.id,
        );
      };

      const ownerSuggestions = await suggestionsFor(headers);
      expect(ownerSuggestions.map((item) => item.reason).sort()).toEqual([
        "birthday",
        "overdue_payment",
      ]);
      const birthday = ownerSuggestions.find(
        (item) => item.reason === "birthday",
      )!;
      expect(birthday.referenceKey).toBe(`${patient.id}:2026`);
      const overdue = ownerSuggestions.find(
        (item) => item.reason === "overdue_payment",
      )!;

      const receptionSuggestions = await suggestionsFor(
        roleHeaders("reception"),
      );
      expect(receptionSuggestions.map((item) => item.reason)).toEqual([
        "birthday",
      ]);
      const financeSuggestions = await suggestionsFor(roleHeaders("finance"));
      expect(financeSuggestions.map((item) => item.reason)).toContain(
        "overdue_payment",
      );

      const physiotherapist = roleHeaders("physiotherapist");
      for (const request of [
        { method: "GET" as const, url: "/relationship/suggestions" },
        { method: "GET" as const, url: "/relationship/activities" },
        {
          method: "POST" as const,
          url: "/relationship/activities",
          payload: {
            patientId: patient.id,
            reason: "birthday",
            referenceKey: birthday.referenceKey,
            outcome: "contacted",
          },
        },
      ]) {
        const denied = await app.inject({
          ...request,
          headers: physiotherapist,
        });
        expect(denied.statusCode).toBe(403);
        expect(denied.json()).toMatchObject({
          code: "COMMERCIAL_ACCESS_DENIED",
        });
      }

      const contacted = await app.inject({
        method: "POST",
        url: "/relationship/activities",
        headers: roleHeaders("reception"),
        payload: {
          patientId: patient.id,
          reason: "birthday",
          referenceKey: birthday.referenceKey,
          outcome: "contacted",
          notes: "Mensagem de parabéns enviada",
        },
      });
      expect(contacted.statusCode).toBe(201);
      expect(contacted.json()).toMatchObject({
        clinicId,
        patientId: patient.id,
        reason: "birthday",
        outcome: "contacted",
        notes: "Mensagem de parabéns enviada",
        actorUserId: roleSub(app, "reception"),
      });
      expect(
        (await suggestionsFor(headers)).map((item) => item.reason),
      ).toEqual(["overdue_payment"]);

      const pastSnooze = await app.inject({
        method: "POST",
        url: "/relationship/activities",
        headers,
        payload: {
          patientId: patient.id,
          reason: "overdue_payment",
          referenceKey: overdue.referenceKey,
          outcome: "snoozed",
          snoozeUntil: "2026-10-10",
        },
      });
      expect(pastSnooze.statusCode).toBe(400);
      const unknownPatient = await app.inject({
        method: "POST",
        url: "/relationship/activities",
        headers,
        payload: {
          patientId: "fafafafa-fafa-4afa-8afa-fafafafafafa",
          reason: "birthday",
          referenceKey: "x",
          outcome: "contacted",
        },
      });
      expect(unknownPatient.statusCode).toBe(404);

      const snoozed = await app.inject({
        method: "POST",
        url: "/relationship/activities",
        headers,
        payload: {
          patientId: patient.id,
          reason: "overdue_payment",
          referenceKey: overdue.referenceKey,
          outcome: "snoozed",
          snoozeUntil: "2026-10-12",
        },
      });
      expect(snoozed.statusCode).toBe(201);
      expect(snoozed.json()).toMatchObject({ snoozeUntil: "2026-10-12" });
      expect(await suggestionsFor(headers)).toEqual([]);

      // O token de login expira com o avanço do relógio: assina um novo a cada data.
      vi.setSystemTime(new Date("2026-10-12T15:00:00.000Z"));
      expect(await suggestionsFor(roleHeaders("owner"))).toEqual([]);
      vi.setSystemTime(new Date("2026-10-13T15:00:00.000Z"));
      const ownerHeaders = roleHeaders("owner");
      expect(
        (await suggestionsFor(ownerHeaders)).map((item) => item.reason),
      ).toEqual(["overdue_payment"]);

      const activities = await app.inject({
        method: "GET",
        url: `/relationship/activities?patientId=${patient.id}`,
        headers: roleHeaders("finance"),
      });
      expect(activities.statusCode).toBe(200);
      expect(
        activities.json().map((item: { outcome: string }) => item.outcome),
      ).toEqual(["snoozed", "contacted"]);
      const otherPatient = await app.inject({
        method: "GET",
        url: "/relationship/activities?patientId=99999999-9999-4999-8999-999999999999",
        headers: ownerHeaders,
      });
      expect(otherPatient.json()).toEqual([]);
      const all = await app.inject({
        method: "GET",
        url: "/relationship/activities",
        headers: ownerHeaders,
      });
      expect(all.json()).toHaveLength(2);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("suggests contacting detractors from the last 30 days until the survey is handled", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00.000Z"));
    try {
      const app = await buildApp({
        repository: new MemoryClinicRepository(),
        logger: false,
      });
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const headers = (role: UserRole = "owner") => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const patient = (
        await app.inject({
          method: "POST",
          url: "/patients",
          headers: headers(),
          payload: {
            cpf: nextTestCpf(),
            fullName: "Nair Detratora",
            phone: "11944443333",
            whatsapp: "11944443333",
            emergencyContactName: "Nair Detratora",
            emergencyContactPhone: "11944443333",
            tags: [],
          },
        })
      ).json() as { id: string };
      const survey = async (score: number) => {
        const response = await app.inject({
          method: "POST",
          url: "/satisfaction",
          headers: headers("reception"),
          payload: { patientId: patient.id, score },
        });
        expect(response.statusCode).toBe(201);
        return response.json() as { id: string };
      };
      type Suggestion = {
        patientId: string;
        reason: string;
        referenceKey: string;
        dueDate?: string;
      };
      const detractorSuggestions = async (role: UserRole = "owner") => {
        const response = await app.inject({
          method: "GET",
          url: "/relationship/suggestions",
          headers: headers(role),
        });
        expect(response.statusCode).toBe(200);
        return (response.json() as Suggestion[]).filter(
          (item) =>
            item.patientId === patient.id && item.reason === "nps_detractor",
        );
      };

      await survey(8);
      expect(await detractorSuggestions()).toEqual([]);
      const first = await survey(3);
      expect(await detractorSuggestions("reception")).toMatchObject([
        { referenceKey: first.id, dueDate: "2026-10-10" },
      ]);

      const contacted = await app.inject({
        method: "POST",
        url: "/relationship/activities",
        headers: headers("reception"),
        payload: {
          patientId: patient.id,
          reason: "nps_detractor",
          referenceKey: first.id,
          outcome: "contacted",
        },
      });
      expect(contacted.statusCode).toBe(201);
      expect(await detractorSuggestions()).toEqual([]);

      const second = await survey(6);
      expect(await detractorSuggestions()).toMatchObject([
        { referenceKey: second.id },
      ]);
      vi.setSystemTime(new Date("2026-11-09T15:00:00.000Z"));
      expect(await detractorSuggestions()).toHaveLength(1);
      vi.setSystemTime(new Date("2026-11-10T15:00:00.000Z"));
      expect(await detractorSuggestions()).toEqual([]);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists the month's birthdays with the age turning and whether they were congratulated", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00.000Z"));
    try {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      await seedRoleUsers(app);
      const roleHeaders = (role: UserRole) => ({
        authorization: `Bearer ${app.jwt.sign({
          sub: roleSub(app, role),
          clinicId: "11111111-1111-4111-8111-111111111111",
          role: tokenRole(role),
        })}`,
      });
      const createPatient = async (fullName: string, birthDate?: string) =>
        (
          await app.inject({
            method: "POST",
            url: "/patients",
            headers,
            payload: {
              cpf: nextTestCpf(),
              fullName,
              phone: "11955554444",
              whatsapp: "11966665555",
              emergencyContactName: fullName,
              emergencyContactPhone: "11955554444",
              ...(birthDate ? { birthDate } : {}),
              tags: [],
            },
          })
        ).json() as { id: string };
      const rita = await createPatient("Rita Aniversário", "1990-10-10");
      const bruno = await createPatient("Bruno Aniversário", "1985-10-03");
      const leap = await createPatient("Lia Bissexta", "2000-02-29");
      const noBirthday = await createPatient("Sem Data Nascimento");
      const ours = [rita.id, bruno.id, leap.id, noBirthday.id];

      type Entry = {
        patientId: string;
        date: string;
        day: number;
        ageTurning: number;
        referenceKey: string;
        congratulated: boolean;
        patientName: string;
        whatsapp?: string;
      };
      const birthdays = async (
        query: string,
        requestHeaders: Record<string, string> = headers,
      ) => {
        const response = await app.inject({
          method: "GET",
          url: `/relationship/birthdays${query}`,
          headers: requestHeaders,
        });
        expect(response.statusCode).toBe(200);
        return response.json() as Entry[];
      };

      const october = await birthdays("?month=2026-10");
      const patients = (
        await app.inject({ method: "GET", url: "/patients", headers })
      ).json() as { id: string; status: string }[];
      for (const entry of october) {
        expect(entry.date.slice(0, 7)).toBe("2026-10");
        expect(
          patients.find((item) => item.id === entry.patientId)?.status,
        ).toBe("active");
      }
      const days = october.map((entry) => entry.day);
      expect(days).toEqual([...days].sort((a, b) => a - b));
      const ourOctober = october.filter((entry) =>
        ours.includes(entry.patientId),
      );
      expect(ourOctober).toEqual([
        expect.objectContaining({
          patientId: bruno.id,
          patientName: "Bruno Aniversário",
          whatsapp: "11966665555",
          date: "2026-10-03",
          day: 3,
          ageTurning: 41,
          referenceKey: `${bruno.id}:2026`,
          congratulated: false,
        }),
        expect.objectContaining({
          patientId: rita.id,
          date: "2026-10-10",
          day: 10,
          ageTurning: 36,
          referenceKey: `${rita.id}:2026`,
          congratulated: false,
        }),
      ]);
      expect(
        (await birthdays("", roleHeaders("reception"))).filter((entry) =>
          ours.includes(entry.patientId),
        ),
      ).toEqual(ourOctober);

      // Adiar ou registrar outro ano não conta como parabéns dado.
      for (const payload of [
        { referenceKey: `${rita.id}:2025`, outcome: "contacted" },
        {
          referenceKey: `${rita.id}:2026`,
          outcome: "snoozed",
          snoozeUntil: "2026-10-11",
        },
        { referenceKey: `${bruno.id}:2026`, outcome: "contacted" },
      ]) {
        const created = await app.inject({
          method: "POST",
          url: "/relationship/activities",
          headers,
          payload: {
            patientId: payload.referenceKey.split(":")[0],
            reason: "birthday",
            ...payload,
          },
        });
        expect(created.statusCode).toBe(201);
      }
      const afterContact = (
        await birthdays("?month=2026-10", roleHeaders("finance"))
      ).filter((entry) => ours.includes(entry.patientId));
      expect(
        afterContact.map((entry) => [entry.patientId, entry.congratulated]),
      ).toEqual([
        [bruno.id, true],
        [rita.id, false],
      ]);

      const february2027 = (await birthdays("?month=2027-02")).filter((entry) =>
        ours.includes(entry.patientId),
      );
      expect(february2027).toEqual([
        expect.objectContaining({
          patientId: leap.id,
          date: "2027-02-28",
          day: 28,
          ageTurning: 27,
          referenceKey: `${leap.id}:2027`,
        }),
      ]);
      const february2028 = (await birthdays("?month=2028-02")).filter((entry) =>
        ours.includes(entry.patientId),
      );
      expect(february2028).toEqual([
        expect.objectContaining({
          date: "2028-02-29",
          day: 29,
          ageTurning: 28,
        }),
      ]);

      for (const month of ["2026-13", "2026-1", "outubro"]) {
        const invalid = await app.inject({
          method: "GET",
          url: `/relationship/birthdays?month=${month}`,
          headers,
        });
        expect(invalid.statusCode).toBe(400);
      }
      const denied = await app.inject({
        method: "GET",
        url: "/relationship/birthdays?month=2026-10",
        headers: roleHeaders("physiotherapist"),
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the client timeline from the most recent event without clinical content", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      let clock = Date.parse("2026-09-01T12:00:00.000Z");
      vi.setSystemTime(clock);
      const tick = () => {
        clock += 60_000;
        vi.setSystemTime(clock);
      };
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const roleHeaders = (role: UserRole, clinic = clinicId) => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId: clinic, role: tokenRole(role) })}`,
      });
      const helena = "99999999-9999-4999-8999-999999999999";
      const helenaAppointment = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      const services = await app.inject({
        method: "GET",
        url: "/services",
        headers,
      });

      tick();
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/appointments/${helenaAppointment}/status`,
            headers,
            payload: { status: "completed" },
          })
        ).statusCode,
      ).toBe(200);
      const record = await app.inject({
        method: "POST",
        url: "/clinical-records",
        headers,
        payload: {
          appointmentId: helenaAppointment,
          subjective: "SEGREDO-CLINICO-SUBJETIVO",
        },
      });
      expect(record.statusCode).toBe(201);

      tick();
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: await configuredPlan(app, {
          services: [
            {
              serviceId: services.json()[0].id,
              totalSessions: 4,
              totalValueInCents: 32000,
            },
          ],
          patientId: helena,
          serviceId: services.json()[0].id,
          name: "Pacote linha do tempo",
          kind: "fixed_package",
          totalSessions: 4,
          validFrom: "2026-09-01",
          validUntil: "2026-09-30",
          totalValueInCents: 32000,
          installments: 1,
          firstDueDate: "2026-09-01",
        }),
      });
      expect(plan.statusCode).toBe(201);
      const summary = await app.inject({
        method: "GET",
        url: "/finance/summary",
        headers,
      });
      const receivable = summary
        .json()
        .receivables.find(
          (item: { planId?: string }) => item.planId === plan.json().id,
        );
      tick();
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/finance/receivables/${receivable.id}/pay`,
            headers,
            payload: { paymentMethod: "pix" },
          })
        ).statusCode,
      ).toBe(200);
      tick();
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/finance/receivables/${receivable.id}/reverse`,
            headers,
          })
        ).statusCode,
      ).toBe(200);
      tick();
      const renewed = await app.inject({
        method: "POST",
        url: `/plans/${plan.json().id}/renew`,
        headers,
        payload: {
          name: "Pacote linha do tempo",
          services: [
            {
              serviceId: plan.json().serviceId,
              totalSessions: 4,
              totalValueInCents: 34000,
            },
          ],
          totalSessions: 4,
          validFrom: "2026-10-01",
          validUntil: "2026-10-31",
          totalValueInCents: 34000,
          installments: 1,
          firstDueDate: "2026-10-01",
        },
      });
      expect(renewed.statusCode).toBe(201);
      tick();
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/plans/${renewed.json().id}/status`,
            headers,
            payload: { status: "cancelled" },
          })
        ).statusCode,
      ).toBe(200);
      tick();
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/relationship/activities",
            headers,
            payload: {
              patientId: helena,
              reason: "plan_expiring",
              referenceKey: plan.json().id,
              outcome: "contacted",
              notes: "Pediu retorno",
            },
          })
        ).statusCode,
      ).toBe(201);
      tick();
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/communications/messages",
            headers,
            payload: {
              patientId: helena,
              channel: "whatsapp",
              body: "Olá, Helena!",
            },
          })
        ).statusCode,
      ).toBe(201);
      tick();
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/satisfaction",
            headers,
            payload: {
              patientId: helena,
              appointmentId: helenaAppointment,
              score: 6,
              comment: "Esperou muito",
            },
          })
        ).statusCode,
      ).toBe(201);
      await app.inject({
        method: "POST",
        url: "/satisfaction",
        headers,
        payload: {
          patientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          score: 10,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: `/patients/${helena}/timeline`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const timeline = response.json() as Array<{
        id: string;
        kind: string;
        occurredAt: string;
        title: string;
        detail?: string;
        amountInCents?: number;
        status?: string;
        score?: number;
      }>;
      const times = timeline.map((item) => Date.parse(item.occurredAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(response.body).not.toContain("SEGREDO-CLINICO");
      expect(timeline.filter((item) => item.kind === "satisfaction")).toEqual([
        {
          id: expect.stringMatching(/^satisfaction:/),
          kind: "satisfaction",
          occurredAt: new Date(clock).toISOString(),
          title: "Pesquisa de satisfação: nota 6",
          detail: "Esperou muito",
          score: 6,
        },
      ]);
      expect(timeline).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: `appointment:${helenaAppointment}`,
            kind: "appointment",
            status: "completed",
          }),
          expect.objectContaining({
            id: `plan_created:${plan.json().id}`,
            title: "Plano contratado: Pacote linha do tempo",
            amountInCents: 32000,
          }),
          expect.objectContaining({
            id: `plan_renewed:${renewed.json().id}`,
            kind: "plan_renewed",
            amountInCents: 34000,
          }),
          expect.objectContaining({
            id: `plan_cancelled:${renewed.json().id}`,
            kind: "plan_cancelled",
          }),
          expect.objectContaining({
            kind: "payment",
            title: "Pagamento recebido",
            amountInCents: 32000,
          }),
          expect.objectContaining({
            kind: "payment_reversal",
            amountInCents: -32000,
          }),
          expect.objectContaining({
            kind: "contact",
            detail: "Contato feito · Pediu retorno",
            status: "contacted",
          }),
          expect.objectContaining({
            kind: "message",
            detail: "Olá, Helena!",
          }),
        ]),
      );
      const recent = timeline
        .filter((item) => item.kind !== "appointment")
        .slice(0, 8)
        .map((item) => item.kind);
      expect(recent).toEqual([
        "satisfaction",
        "message",
        "contact",
        "plan_cancelled",
        "plan_renewed",
        "payment_reversal",
        "payment",
        "plan_created",
      ]);

      for (const role of ["reception", "finance"] as const) {
        const allowed = await app.inject({
          method: "GET",
          url: `/patients/${helena}/timeline`,
          headers: roleHeaders(role),
        });
        expect(allowed.statusCode).toBe(200);
      }
      const physiotherapist = await app.inject({
        method: "GET",
        url: `/patients/${helena}/timeline`,
        headers: roleHeaders("physiotherapist"),
      });
      expect(physiotherapist.statusCode).toBe(403);
      expect(physiotherapist.json()).toMatchObject({
        code: "COMMERCIAL_ACCESS_DENIED",
      });
      const unauthenticated = await app.inject({
        method: "GET",
        url: `/patients/${helena}/timeline`,
      });
      expect(unauthenticated.statusCode).toBe(401);
      // Token de outra clínica: o usuário não existe lá, então a sessão é recusada (401).
      const otherClinic = await app.inject({
        method: "GET",
        url: `/patients/${helena}/timeline`,
        headers: roleHeaders("owner", "12121212-1212-4121-8121-121212121212"),
      });
      expect(otherClinic.statusCode).toBe(401);
      for (const [url, requestHeaders] of [
        ["/patients/12121212-1212-4121-8121-121212121212/timeline", headers],
        ["/patients/nao-e-uuid/timeline", headers],
      ] as const) {
        const missing = await app.inject({
          method: "GET",
          url,
          headers: requestHeaders,
        });
        expect(missing.statusCode).toBe(404);
        expect(missing.json()).toMatchObject({ code: "PATIENT_NOT_FOUND" });
      }
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("previews and imports patients from CSV and XLSX files", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const existing = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: {
        fullName: "Cliente Existente",
        phone: "21977776666",
        whatsapp: "21977776666",
        emergencyContactName: "Cliente Existente",
        emergencyContactPhone: "21977776666",
        cpf: "98765432100",
        tags: [],
      },
    });
    expect(existing.statusCode).toBe(201);
    const csv = [
      "Nome;Telefone;CPF;E-mail",
      "Ana Importada;(21) 98888-1111;52998224725;ana@example.com",
      "Bruno Importado;21988882222;123.456.789-09;",
      "X;;;",
      "Outra Existente;21 97777-6666;11144477735;",
      "Ana Repetida;21988881111;39053344705;",
    ].join("\n");
    const file = {
      fileName: "clientes.CSV",
      contentBase64: Buffer.from(csv, "utf8").toString("base64"),
    };

    const preview = await app.inject({
      method: "POST",
      url: "/patients/import/preview",
      headers,
      payload: file,
    });
    expect(preview.statusCode).toBe(200);
    const analysis = preview.json() as {
      rows: Array<{
        line: number;
        status: string;
        duplicateOf?: { kind: string };
      }>;
      errors: string[];
      totals: { valid: number; error: number; duplicate: number };
    };
    expect(analysis.errors).toEqual([]);
    expect(analysis.totals).toEqual({ valid: 2, error: 1, duplicate: 2 });
    expect(analysis.rows.map((row) => [row.line, row.status])).toEqual([
      [2, "valid"],
      [3, "valid"],
      [4, "error"],
      [5, "duplicate"],
      [6, "duplicate"],
    ]);
    expect(analysis.rows[3]?.duplicateOf).toMatchObject({ kind: "existing" });
    expect(analysis.rows[4]?.duplicateOf).toMatchObject({ kind: "row" });
    // A prévia não grava nada.
    const beforeImport = await app.inject({
      method: "GET",
      url: "/patients?search=Importad",
      headers,
    });
    expect(beforeImport.json()).toEqual([]);

    const imported = await app.inject({
      method: "POST",
      url: "/patients/import",
      headers,
      payload: file,
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toEqual({
      created: 2,
      skipped: 2,
      errors: 1,
      updated: 0,
    });
    const listed = await app.inject({
      method: "GET",
      url: "/patients?search=Importad",
      headers,
    });
    expect(
      (listed.json() as Array<{ fullName: string }>).map(
        (item) => item.fullName,
      ),
    ).toEqual(["Ana Importada", "Bruno Importado"]);

    const again = await app.inject({
      method: "POST",
      url: "/patients/import",
      headers,
      payload: file,
    });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({
      created: 0,
      skipped: 4,
      errors: 1,
      updated: 0,
    });
    const relisted = await app.inject({
      method: "GET",
      url: "/patients?search=Importad",
      headers,
    });
    expect(relisted.json()).toHaveLength(2);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Clientes");
    sheet.addRow(["Nome completo", "Celular", "Data de nascimento", "CPF"]);
    sheet.addRow([
      "Carla Planilha",
      "(31) 99999-0001",
      "05/06/1985",
      "01234567890",
    ]);
    sheet.addRow(["Ana Importada", "21988881111", null, "39053344705"]);
    const xlsx = {
      fileName: "clientes.xlsx",
      contentBase64: Buffer.from(await workbook.xlsx.writeBuffer()).toString(
        "base64",
      ),
    };
    const xlsxPreview = await app.inject({
      method: "POST",
      url: "/patients/import/preview",
      headers,
      payload: xlsx,
    });
    expect(xlsxPreview.statusCode).toBe(200);
    expect(xlsxPreview.json()).toMatchObject({
      totals: { valid: 1, error: 0, duplicate: 1 },
      rows: [
        {
          line: 2,
          status: "valid",
          fullName: "Carla Planilha",
          input: { birthDate: "1985-06-05" },
        },
        {
          line: 3,
          status: "duplicate",
          duplicateOf: { kind: "existing", field: "phone" },
        },
      ],
    });
    const xlsxImport = await app.inject({
      method: "POST",
      url: "/patients/import",
      headers,
      payload: xlsx,
    });
    expect(xlsxImport.json()).toEqual({
      created: 1,
      skipped: 1,
      errors: 0,
      updated: 0,
    });

    const onlyErrors = {
      fileName: "erros.csv",
      contentBase64: Buffer.from("Nome;Telefone\nX;\n", "utf8").toString(
        "base64",
      ),
    };
    const noneValid = await app.inject({
      method: "POST",
      url: "/patients/import",
      headers,
      payload: onlyErrors,
    });
    expect(noneValid.statusCode).toBe(200);
    expect(noneValid.json()).toEqual({
      created: 0,
      skipped: 0,
      errors: 1,
      updated: 0,
    });
    await app.close();
  });

  it("imports a spreadsheet with custom titles using the chosen column mapping", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const csv = [
      "Aluno;Documento;Prefixo;Cel.;Cidade natal;Código",
      "Dora Mapeada;529.982.247-25;21;98888-3333;Niterói;A1",
    ].join("\n");
    const file = {
      fileName: "minha-planilha.csv",
      contentBase64: Buffer.from(csv, "utf8").toString("base64"),
    };

    const automatic = await app.inject({
      method: "POST",
      url: "/patients/import/preview",
      headers,
      payload: file,
    });
    expect(automatic.statusCode).toBe(200);
    expect(automatic.json()).toMatchObject({
      errors: ["Escolha a coluna de nome e telefone da planilha."],
      rows: [],
      mapping: [null, null, null, null, null, null],
      columns: [
        { index: 0, title: "Aluno", samples: ["Dora Mapeada"] },
        { index: 1, title: "Documento" },
        { index: 2, title: "Prefixo" },
        { index: 3, title: "Cel." },
        { index: 4, title: "Cidade natal" },
        { index: 5, title: "Código" },
      ],
    });

    const mapping = ["fullName", "cpf", "phoneAreaCode", "phone", "city", null];
    const preview = await app.inject({
      method: "POST",
      url: "/patients/import/preview",
      headers,
      payload: { ...file, mapping },
    });
    expect(preview.json()).toMatchObject({
      errors: [],
      mapping,
      totals: { valid: 1, error: 0, duplicate: 0 },
    });

    const repeated = await app.inject({
      method: "POST",
      url: "/patients/import/preview",
      headers,
      payload: { ...file, mapping: ["fullName", "phone", null, "phone"] },
    });
    expect(repeated.statusCode).toBe(400);
    expect(JSON.stringify(repeated.json())).toContain(
      "O campo Telefone foi escolhido em mais de uma coluna.",
    );

    const imported = await app.inject({
      method: "POST",
      url: "/patients/import",
      headers,
      payload: { ...file, mapping },
    });
    expect(imported.json()).toEqual({
      created: 1,
      skipped: 0,
      errors: 0,
      updated: 0,
    });
    const listed = await app.inject({
      method: "GET",
      url: "/patients?search=Dora",
      headers,
    });
    expect(listed.json()).toMatchObject([
      {
        fullName: "Dora Mapeada",
        phone: "21988883333",
        cpf: "52998224725",
        city: "Niterói",
      },
    ]);
    await app.close();
  });

  it("rejects invalid patient import files and non-commercial profiles", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const csv = Buffer.from(
      "Nome;Telefone\nAna Importada;21988881111\n",
      "utf8",
    ).toString("base64");
    await seedRoleUsers(app);
    const physiotherapist = {
      authorization: `Bearer ${app.jwt.sign({
        sub: roleSub(app, "physiotherapist"),
        clinicId: "11111111-1111-4111-8111-111111111111",
        role: "user",
      })}`,
    };
    for (const url of ["/patients/import/preview", "/patients/import"]) {
      const wrongExtension = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { fileName: "clientes.pdf", contentBase64: csv },
      });
      expect(wrongExtension.statusCode).toBe(400);
      expect(wrongExtension.json()).toMatchObject({
        code: "PATIENT_IMPORT_UNSUPPORTED_FILE",
      });

      const noExtension = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { fileName: "clientes", contentBase64: csv },
      });
      expect(noExtension.statusCode).toBe(400);
      expect(noExtension.json()).toMatchObject({
        code: "PATIENT_IMPORT_UNSUPPORTED_FILE",
      });

      const tooLarge = await app.inject({
        method: "POST",
        url,
        headers,
        payload: {
          fileName: "grande.csv",
          contentBase64: Buffer.alloc(2 * 1024 * 1024 + 1, "a").toString(
            "base64",
          ),
        },
      });
      expect(tooLarge.statusCode).toBe(413);
      expect(tooLarge.json()).toMatchObject({
        code: "PATIENT_IMPORT_TOO_LARGE",
      });

      const brokenXlsx = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { fileName: "quebrada.xlsx", contentBase64: csv },
      });
      expect(brokenXlsx.statusCode).toBe(400);
      expect(brokenXlsx.json()).toMatchObject({
        code: "PATIENT_IMPORT_INVALID_FILE",
      });

      const missingBody = await app.inject({
        method: "POST",
        url,
        headers,
        payload: {},
      });
      expect(missingBody.statusCode).toBe(400);

      const denied = await app.inject({
        method: "POST",
        url,
        headers: physiotherapist,
        payload: { fileName: "clientes.csv", contentBase64: csv },
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });

      const unauthenticated = await app.inject({
        method: "POST",
        url,
        payload: { fileName: "clientes.csv", contentBase64: csv },
      });
      expect(unauthenticated.statusCode).toBe(401);
    }
    const missingColumn = await app.inject({
      method: "POST",
      url: "/patients/import",
      headers,
      payload: {
        fileName: "sem-telefone.csv",
        contentBase64: Buffer.from("Nome\nAna Importada\n", "utf8").toString(
          "base64",
        ),
      },
    });
    expect(missingColumn.statusCode).toBe(400);
    expect(missingColumn.json()).toMatchObject({
      code: "PATIENT_IMPORT_INVALID_FILE",
    });
    const list = await app.inject({
      method: "GET",
      url: "/patients?search=Importad",
      headers,
    });
    expect(list.json()).toEqual([]);
    await app.close();
  });

  describe("configured patient tags", () => {
    type Tag = {
      id: string;
      name: string;
      color: string;
      patientCount: number;
    };
    const listTags = async (app: TestApp, headers: Record<string, string>) => {
      const response = await app.inject({
        method: "GET",
        url: "/patient-tags",
        headers,
      });
      expect(response.statusCode).toBe(200);
      return response.json() as Tag[];
    };

    it("starts with the tags clients already have, with the default color and usage count", async () => {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const tags = await listTags(app, headers);
      const patients = (
        await app.inject({ method: "GET", url: "/patients", headers })
      ).json() as Array<{
        tags: string[];
      }>;
      // Etiquetas automáticas ("Falta CPF", "Pagamento atrasado") não são configuradas.
      const used = [
        ...new Set(
          patients.flatMap((patient) =>
            withoutAutomaticPatientTags(patient.tags),
          ),
        ),
      ];
      expect(tags.map((tag) => tag.name).sort()).toEqual([...used].sort());
      const names = tags.map((tag) => tag.name);
      expect(names).toEqual(
        [...names].sort((a, b) => a.localeCompare(b, "pt-BR")),
      );
      const postOp = tags.find((tag) => tag.name === "Pós-operatório")!;
      expect(postOp).toMatchObject({ color: "#64748b" });
      expect(postOp.patientCount).toBe(
        patients.filter((patient) => patient.tags.includes("Pós-operatório"))
          .length,
      );
      await app.close();
    });

    it("creates, renames, recolors and deletes tags, keeping clients and filters in sync", async () => {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const created = await app.inject({
        method: "POST",
        url: "/patient-tags",
        headers,
        payload: { name: " Gestante T062 ", color: "#AA3366" },
      });
      expect(created.statusCode).toBe(201);
      const tag = created.json() as Tag;
      expect(tag).toMatchObject({
        name: "Gestante T062",
        color: "#aa3366",
        patientCount: 0,
      });

      for (const name of ["gestante t062", "GESTÁNTE T062"]) {
        const duplicate = await app.inject({
          method: "POST",
          url: "/patient-tags",
          headers,
          payload: { name },
        });
        expect(duplicate.statusCode, name).toBe(409);
        expect(duplicate.json()).toMatchObject({
          code: "PATIENT_TAG_DUPLICATE",
        });
      }
      const badColor = await app.inject({
        method: "POST",
        url: "/patient-tags",
        headers,
        payload: { name: "Cor ruim", color: "vermelho" },
      });
      expect(badColor.statusCode).toBe(400);

      // Cliente só aceita etiquetas configuradas (grafia oficial, sem repetir).
      const unknown = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Gabi Gestante",
          phone: "11933330001",
          whatsapp: "11933330001",
          emergencyContactName: "Gabi Gestante",
          emergencyContactPhone: "11933330001",
          tags: ["Gestante T062", "Inventada", "Outra"],
        },
      });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json()).toMatchObject({
        code: "PATIENT_TAG_UNKNOWN",
        details: { unknownTags: ["Inventada", "Outra"] },
      });
      expect(unknown.json().message).toContain("Inventada, Outra");
      const patient = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Gabi Gestante",
          phone: "11933330001",
          whatsapp: "11933330001",
          emergencyContactName: "Gabi Gestante",
          emergencyContactPhone: "11933330001",
          tags: ["gestante t062", "GESTANTE T062"],
        },
      });
      expect(patient.statusCode).toBe(201);
      expect(patient.json().tags).toEqual(["Gestante T062"]);
      const patientId = patient.json().id as string;
      const editUnknown = await app.inject({
        method: "PUT",
        url: `/patients/${patientId}`,
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Gabi Gestante",
          phone: "11933330001",
          whatsapp: "11933330001",
          emergencyContactName: "Gabi Gestante",
          emergencyContactPhone: "11933330001",
          tags: ["Inventada"],
        },
      });
      expect(editUnknown.statusCode).toBe(400);
      expect(editUnknown.json()).toMatchObject({
        code: "PATIENT_TAG_UNKNOWN",
        details: { unknownTags: ["Inventada"] },
      });

      // Renomear troca o nome nos clientes; exportação e comunicado filtram pelo nome novo.
      const renamed = await app.inject({
        method: "PATCH",
        url: `/patient-tags/${tag.id}`,
        headers,
        payload: { name: "Gestantes T062" },
      });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json()).toMatchObject({
        id: tag.id,
        name: "Gestantes T062",
        color: "#aa3366",
        patientCount: 1,
      });
      const listed = (
        await app.inject({
          method: "GET",
          url: "/patients?search=Gabi",
          headers,
        })
      ).json();
      expect(listed[0].tags).toEqual(["Gestantes T062"]);
      const exported = await app.inject({
        method: "GET",
        url: `/patients/export?columns=fullName&tags=${encodeURIComponent("Gestantes T062")}`,
        headers,
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.body).toContain("Gabi Gestante");
      const broadcast = await app.inject({
        method: "POST",
        url: "/communications/broadcast/preview",
        headers,
        payload: {
          segment: { tags: ["Gestantes T062"] },
          channel: "whatsapp",
          body: "Oi, {{nome}}",
        },
      });
      expect(broadcast.statusCode).toBe(200);
      expect(broadcast.json()).toMatchObject({
        matched: 1,
        sampleBody: "Oi, Gabi",
      });

      const caseOnly = await app.inject({
        method: "PATCH",
        url: `/patient-tags/${tag.id}`,
        headers,
        payload: { name: "GESTANTES T062" },
      });
      expect(caseOnly.statusCode).toBe(200);
      const clash = await app.inject({
        method: "PATCH",
        url: `/patient-tags/${tag.id}`,
        headers,
        payload: { name: "pos-operatorio" },
      });
      expect(clash.statusCode).toBe(409);
      expect(clash.json()).toMatchObject({ code: "PATIENT_TAG_DUPLICATE" });
      const recolored = await app.inject({
        method: "PATCH",
        url: `/patient-tags/${tag.id}`,
        headers,
        payload: { color: "#112233" },
      });
      expect(recolored.json()).toMatchObject({
        name: "GESTANTES T062",
        color: "#112233",
      });
      const empty = await app.inject({
        method: "PATCH",
        url: `/patient-tags/${tag.id}`,
        headers,
        payload: {},
      });
      expect(empty.statusCode).toBe(400);

      // Excluir etiqueta em uso: 409 com a contagem; sem uso: 204.
      const inUse = await app.inject({
        method: "DELETE",
        url: `/patient-tags/${tag.id}`,
        headers,
      });
      expect(inUse.statusCode).toBe(409);
      expect(inUse.json()).toMatchObject({
        code: "PATIENT_TAG_IN_USE",
        details: { patientCount: 1 },
      });
      expect(inUse.json().message).toContain("1 cliente");
      const cleared = await app.inject({
        method: "PUT",
        url: `/patients/${patientId}`,
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Gabi Gestante",
          phone: "11933330001",
          whatsapp: "11933330001",
          emergencyContactName: "Gabi Gestante",
          emergencyContactPhone: "11933330001",
          tags: [],
        },
      });
      expect(cleared.statusCode).toBe(200);
      const deleted = await app.inject({
        method: "DELETE",
        url: `/patient-tags/${tag.id}`,
        headers,
      });
      expect(deleted.statusCode).toBe(204);
      expect(
        (await listTags(app, headers)).some((item) => item.id === tag.id),
      ).toBe(false);
      for (const [method, url] of [
        ["DELETE", `/patient-tags/${tag.id}`],
        ["DELETE", "/patient-tags/abc"],
        ["PATCH", `/patient-tags/${tag.id}`],
        ["PATCH", "/patient-tags/abc"],
      ] as const) {
        const missing = await app.inject(
          method === "PATCH"
            ? { method, url, headers, payload: { color: "#000000" } }
            : { method, url, headers },
        );
        expect(missing.statusCode, `${method} ${url}`).toBe(404);
        expect(missing.json()).toMatchObject({ code: "PATIENT_TAG_NOT_FOUND" });
      }

      const audit = (
        await app.inject({ method: "GET", url: "/admin/audit-events", headers })
      ).json() as Array<{
        action: string;
        entityId?: string;
        metadata: Record<string, unknown>;
      }>;
      const tagEvents = audit
        .filter((event) => event.entityId === tag.id)
        .map((event) => event.action);
      expect(tagEvents).toEqual([
        "patient_tag.deleted",
        "patient_tag.updated",
        "patient_tag.updated",
        "patient_tag.updated",
        "patient_tag.created",
      ]);
      expect(
        audit.find(
          (event) =>
            event.entityId === tag.id &&
            event.metadata.previousName === "Gestante T062",
        ),
      ).toMatchObject({
        metadata: { name: "Gestantes T062", patientsUpdated: 1 },
      });
      await app.close();
    });

    it("keeps the CRM conversion tag configured", async () => {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const lead = await app.inject({
        method: "POST",
        url: "/leads",
        headers,
        payload: {
          fullName: "Lia Convertida",
          phone: "11933330009",
          source: "Instagram",
          interest: "Pilates",
        },
      });
      expect(lead.statusCode).toBe(201);
      const converted = await app.inject({
        payload: { cpf: nextTestCpf(), ...testPatientContact },
        method: "POST",
        url: `/leads/${lead.json().id}/convert`,
        headers,
      });
      expect(converted.statusCode).toBe(200);
      const tags = await listTags(app, headers);
      expect(
        tags.find((tag) => tag.name === "Convertido do CRM"),
      ).toMatchObject({ patientCount: 1 });
      const patientId = converted.json().patient.id as string;
      const edited = await app.inject({
        method: "PUT",
        url: `/patients/${patientId}`,
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Lia Convertida",
          phone: "11933330009",
          whatsapp: "11933330009",
          emergencyContactName: "Lia Convertida",
          emergencyContactPhone: "11933330009",
          tags: ["Convertido do CRM"],
        },
      });
      expect(edited.statusCode).toBe(200);
      await app.close();
    });

    it("marks import rows with unknown tags as errors and uses the configured spelling", async () => {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const csv = [
        "Nome;Telefone;Etiquetas;CPF",
        "Iara Importada;21966660001;pos-operatorio, ESPORTIVO;52998224725",
        "Ivo Importado;21966660002;Pós-operatório, Desconhecida;98765432100",
      ].join("\n");
      const file = {
        fileName: "clientes.csv",
        contentBase64: Buffer.from(csv, "utf8").toString("base64"),
      };
      const preview = await app.inject({
        method: "POST",
        url: "/patients/import/preview",
        headers,
        payload: file,
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({
        totals: { valid: 1, error: 1, duplicate: 0 },
        rows: [
          {
            line: 2,
            status: "valid",
            input: { tags: ["Pós-operatório", "Esportivo"] },
          },
          {
            line: 3,
            status: "error",
            errors: ["Linha 3: etiqueta não configurada: Desconhecida."],
          },
        ],
      });
      const imported = await app.inject({
        method: "POST",
        url: "/patients/import",
        headers,
        payload: file,
      });
      expect(imported.json()).toEqual({
      created: 1,
      skipped: 0,
      errors: 1,
      updated: 0,
    });
      const listed = (
        await app.inject({
          method: "GET",
          url: "/patients?search=Importad",
          headers,
        })
      ).json();
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        fullName: "Iara Importada",
        // Sem WhatsApp, contato de emergência e e-mail: etiquetas automáticas da CD3 no fim.
        tags: [
          "Pós-operatório",
          "Esportivo",
          INCOMPLETE_REGISTRATION_TAG,
          MISSING_EMAIL_TAG,
        ],
      });
      await app.close();
    });
  });

  describe("patient export", () => {
    const tag = "exporta-t034";
    async function setup() {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      await configureTags(app, headers, [tag, "vip", "outra-t034"]);
      const create = async (payload: Record<string, unknown>) => {
        const response = await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload: {
            cpf: nextTestCpf(),
            whatsapp: payload.phone,
            emergencyContactName: payload.fullName,
            emergencyContactPhone: payload.phone,
            ...payload,
          },
        });
        expect(response.statusCode).toBe(201);
        return response.json() as {
          id: string;
          recordNumber: string;
          cpf: string;
        };
      };
      const ana = await create({
        fullName: 'Ana; "Exportada"',
        phone: "11911110001",
        email: "ana.exporta@example.com",
        birthDate: "1990-03-20",
        notes: "Linha 1\nLinha 2",
        tags: [tag, "vip"],
      });
      const bruno = await create({
        fullName: "Bruno Exportado",
        phone: "11911110002",
        birthDate: "1988-07-02",
        tags: [tag],
      });
      const carla = await create({
        fullName: "Carla Exportada",
        phone: "11911110003",
        tags: ["outra-t034"],
      });
      return { app, headers, ana, bruno, carla };
    }
    const bom = String.fromCharCode(0xfeff);
    const csvLines = (body: string) => {
      expect(body.startsWith(bom)).toBe(true);
      return body.slice(1).replace(/\r\n$/, "").split("\r\n");
    };
    const tokenHeaders = (
      app: Awaited<ReturnType<typeof setup>>["app"],
      role: UserRole,
    ) => ({
      authorization: `Bearer ${app.jwt.sign({
        sub: roleSub(app, role),
        clinicId: "11111111-1111-4111-8111-111111111111",
        role: tokenRole(role),
      })}`,
    });

    it("exports CSV with BOM, semicolons, escaping and chosen columns", async () => {
      const { app, headers, ana } = await setup();
      const all = await app.inject({
        method: "GET",
        url: `/patients/export?format=csv&tags=${tag}`,
        headers,
      });
      expect(all.statusCode).toBe(200);
      expect(all.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(all.headers["content-disposition"]).toMatch(
        /^attachment; filename="clientes-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      expect(csvLines(all.body)[0]).toBe(
        "Nome;Prontuário;CPF;DDD (Telefone);Telefone;DDD (WhatsApp);WhatsApp;E-mail;Nascimento;Etiquetas;Situação;Contato de emergência;DDD (Telefone de emergência);Telefone de emergência;Observações;Cadastrado em",
      );
      expect(all.body).toContain(
        `\r\n"Ana; ""Exportada""";${ana.recordNumber};${ana.cpf};11;91111-0001;11;91111-0001;ana.exporta@example.com;20/03/1990;${tag}, vip;ativo;"Ana; ""Exportada""";11;91111-0001;"Linha 1\nLinha 2";`,
      );

      const chosen = await app.inject({
        method: "GET",
        url: `/patients/export?columns=phone,fullName&tags=${tag}`,
        headers,
      });
      expect(chosen.statusCode).toBe(200);
      expect(csvLines(chosen.body)).toEqual([
        "Nome;DDD (Telefone);Telefone",
        '"Ana; ""Exportada""";11;91111-0001',
        "Bruno Exportado;11;91111-0002",
      ]);
      await app.close();
    });

    it("exports XLSX readable by ExcelJS", async () => {
      const { app, headers } = await setup();
      const response = await app.inject({
        method: "GET",
        url: `/patients/export?format=xlsx&columns=fullName,phone,tags,birthDate&tags=${tag}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(response.headers["content-disposition"]).toMatch(
        /clientes-.*\.xlsx"$/,
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.rawPayload as unknown as ArrayBuffer);
      const sheet = workbook.getWorksheet("Clientes")!;
      const values = (sheet.getSheetValues() as unknown[][])
        .slice(1)
        .map((row) => row.slice(1));
      expect(values).toEqual([
        ["Nome", "DDD (Telefone)", "Telefone", "Nascimento", "Etiquetas"],
        [
          'Ana; "Exportada"',
          "11",
          "91111-0001",
          new Date("1990-03-20T00:00:00Z"),
          `${tag}, vip`,
        ],
        [
          "Bruno Exportado",
          "11",
          "91111-0002",
          new Date("1988-07-02T00:00:00Z"),
          tag,
        ],
      ]);
      expect(sheet.autoFilter).toBe("A1:E3");
      expect(sheet.getCell("A1").font).toMatchObject({ bold: true });
      await app.close();
    });

    it("applies status, tags, birthday month, active plan and search filters", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date("2032-03-15T15:00:00.000Z"));
        const { app, headers, bruno } = await setup();
        const names = async (query: string) => {
          const response = await app.inject({
            method: "GET",
            url: `/patients/export?columns=fullName&${query}`,
            headers,
          });
          expect(response.statusCode).toBe(200);
          return csvLines(response.body).slice(1);
        };
        expect(await names(`tags=${tag},outra-t034`)).toEqual([
          '"Ana; ""Exportada"""',
          "Bruno Exportado",
          "Carla Exportada",
        ]);
        expect(await names(`tags=${tag}&birthdayMonth=true`)).toEqual([
          '"Ana; ""Exportada"""',
        ]);
        expect(await names(`tags=${tag}&birthdayMonth=false`)).toHaveLength(2);
        expect(await names("search=Bruno%20Exportado")).toEqual([
          "Bruno Exportado",
        ]);

        const services = await app.inject({
          method: "GET",
          url: "/services",
          headers,
        });
        const plan = await app.inject({
          method: "POST",
          url: "/plans",
          headers,
          payload: await configuredPlan(app, {
            services: [
              {
                serviceId: services.json()[0].id,
                totalSessions: 4,
                totalValueInCents: 40000,
              },
            ],
            patientId: bruno.id,
            serviceId: services.json()[0].id,
            name: "Pacote exportação",
            kind: "fixed_package",
            totalSessions: 4,
            validFrom: "2032-03-15",
            totalValueInCents: 40000,
            installments: 1,
            firstDueDate: "2032-03-15",
          }),
        });
        expect(plan.statusCode).toBe(201);
        expect(await names(`tags=${tag}&activePlan=true`)).toEqual([
          "Bruno Exportado",
        ]);
        expect(await names(`tags=${tag}&activePlan=false`)).toEqual([
          '"Ana; ""Exportada"""',
        ]);

        const patients = (
          await app.inject({ method: "GET", url: "/patients", headers })
        ).json() as Array<{ status: string }>;
        const inactiveCount = patients.filter(
          (item) => item.status === "inactive",
        ).length;
        expect(inactiveCount).toBeGreaterThan(0);
        const inactive = await app.inject({
          method: "GET",
          url: "/patients/export?columns=fullName,status&status=inactive",
          headers,
        });
        const inactiveRows = csvLines(inactive.body).slice(1);
        expect(inactiveRows).toHaveLength(inactiveCount);
        expect(inactiveRows.every((row) => row.endsWith(";inativo"))).toBe(
          true,
        );

        const empty = await app.inject({
          method: "GET",
          url: "/patients/export?format=&status=&tags=&birthdayMonth=&activePlan=&search=&columns=",
          headers,
        });
        expect(empty.statusCode).toBe(200);
        expect(empty.headers["content-type"]).toBe("text/csv; charset=utf-8");
        const emptyLines = csvLines(empty.body);
        expect(emptyLines[0]?.split(";")).toHaveLength(16);
        expect(emptyLines).toHaveLength(patients.length + 1);
        await app.close();
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects invalid format, column and filters", async () => {
      const { app, headers } = await setup();
      for (const query of [
        "format=pdf",
        "columns=fullName,senha",
        "status=archived",
        "activePlan=sim",
        "birthdayMonth=1",
      ]) {
        const response = await app.inject({
          method: "GET",
          url: `/patients/export?${query}`,
          headers,
        });
        expect(response.statusCode, query).toBe(400);
        expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
      }
      await app.close();
    });

    it("requires explicit export permission for common users", async () => {
      const { app } = await setup();
      await seedRoleUsers(app);
      for (const role of [
        "reception",
        "finance",
        "physiotherapist",
      ] as UserRole[]) {
        const response = await app.inject({
          method: "GET",
          url: "/patients/export",
          headers: tokenHeaders(app, role),
        });
        expect(response.statusCode, role).toBe(403);
        expect(response.json()).toMatchObject({
          code: "COMMERCIAL_ACCESS_DENIED",
        });
      }
      const anonymous = await app.inject({
        method: "GET",
        url: "/patients/export",
      });
      expect(anonymous.statusCode).toBe(401);
      const audit = await app.inject({
        method: "GET",
        url: "/admin/audit-events",
        headers: tokenHeaders(app, "owner"),
      });
      expect(
        (audit.json() as Array<{ action: string }>).some(
          (event) => event.action === "patients.exported",
        ),
      ).toBe(false);
      await app.close();
    });

    it("records each export in the administrative audit", async () => {
      const { app, headers } = await setup();
      const response = await app.inject({
        method: "GET",
        url: `/patients/export?format=xlsx&tags=${tag}&birthdayMonth=false&columns=fullName,phone`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const audit = await app.inject({
        method: "GET",
        url: "/admin/audit-events",
        headers,
      });
      expect(audit.statusCode).toBe(200);
      const [latest] = audit.json() as Array<Record<string, unknown>>;
      expect(latest).toMatchObject({
        action: "patients.exported",
        entityType: "patient",
        actorName: expect.any(String),
        metadata: {
          format: "xlsx",
          columns: ["fullName", "phone"],
          filters: { tags: [tag], birthdayMonth: false },
          count: 2,
        },
      });
      await app.close();
    });
  });

  describe("segmented broadcast", () => {
    const tag = "comunicado-t039";
    async function setup() {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      await configureTags(app, headers, [tag, "outra-t039"]);
      const create = async (payload: Record<string, unknown>) => {
        const response = await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload: {
            cpf: nextTestCpf(),
            whatsapp: payload.phone,
            emergencyContactName: payload.fullName,
            emergencyContactPhone: payload.phone,
            ...payload,
          },
        });
        expect(response.statusCode).toBe(201);
        return response.json() as { id: string; fullName: string };
      };
      const ana = await create({
        fullName: "Ana Comunicado Silva",
        phone: "11922220001",
        whatsapp: "11988880001",
        email: "ana.comunicado@example.com",
        birthDate: "1990-03-20",
        tags: [tag],
      });
      const bruno = await create({
        fullName: "Bruno Comunicado",
        phone: "11922220002",
        birthDate: "1988-07-02",
        tags: [tag],
      });
      const carla = await create({
        fullName: "Carla Comunicado",
        phone: "11922220003",
        email: "carla.comunicado@example.com",
        tags: [tag],
      });
      await create({
        fullName: "Dora Fora do Segmento",
        phone: "11922220004",
        email: "dora@example.com",
        tags: ["outra-t039"],
      });
      const optOut = await app.inject({
        method: "PUT",
        url: "/communications/preferences",
        headers,
        payload: { patientId: carla.id, channel: "email", allowed: false },
      });
      expect(optOut.statusCode).toBe(200);
      const manualCount = async () =>
        (
          (
            await app.inject({ method: "GET", url: "/communications", headers })
          ).json() as { messages: Array<{ kind: string }> }
        ).messages.filter((message) => message.kind === "manual").length;
      return { app, headers, ana, bruno, carla, manualCount };
    }

    it("previews the segment without writing, skipping opt-out and missing destination", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date("2032-03-15T15:00:00.000Z"));
        const { app, headers, ana, bruno, carla, manualCount } = await setup();
        const before = await manualCount();
        const preview = (payload: Record<string, unknown>) =>
          app.inject({
            method: "POST",
            url: "/communications/broadcast/preview",
            headers,
            payload,
          });
        const email = await preview({
          segment: { tags: [tag] },
          channel: "email",
          body: "Oi, {{nome}}! Temos novidades.",
        });
        expect(email.statusCode).toBe(200);
        expect(email.json()).toEqual({
          preview: true,
          channel: "email",
          matched: 3,
          queued: 1,
          skipped: [
            {
              patientId: bruno.id,
              patientName: bruno.fullName,
              reason: "no_destination",
            },
            {
              patientId: carla.id,
              patientName: carla.fullName,
              reason: "opt_out",
            },
          ],
          sampleBody: "Oi, Ana! Temos novidades.",
        });
        expect(await manualCount()).toBe(before);

        // O opt-out é por canal: no WhatsApp a Carla recebe.
        const whatsapp = await preview({
          segment: { tags: [tag] },
          channel: "whatsapp",
          body: "Oi, {{nome}}!",
        });
        expect(whatsapp.json()).toMatchObject({
          matched: 3,
          queued: 3,
          skipped: [],
        });

        const birthdays = await preview({
          segment: { tags: [tag], birthdayMonth: true },
          channel: "whatsapp",
          body: "Parabéns, {{nome}}!",
        });
        expect(birthdays.json()).toMatchObject({
          matched: 1,
          queued: 1,
          sampleBody: "Parabéns, Ana!",
        });

        const withoutPlan = await preview({
          segment: { tags: [tag], activePlan: false },
          channel: "whatsapp",
          body: "Oi",
        });
        expect(withoutPlan.json()).toMatchObject({ matched: 3 });
        const services = await app.inject({
          method: "GET",
          url: "/services",
          headers,
        });
        const plan = await app.inject({
          method: "POST",
          url: "/plans",
          headers,
          payload: await configuredPlan(app, {
            services: [
              {
                serviceId: services.json()[0].id,
                totalSessions: 4,
                totalValueInCents: 40000,
              },
            ],
            patientId: ana.id,
            serviceId: services.json()[0].id,
            name: "Pacote comunicado",
            kind: "fixed_package",
            totalSessions: 4,
            validFrom: "2032-03-15",
            totalValueInCents: 40000,
            installments: 1,
            firstDueDate: "2032-03-15",
          }),
        });
        expect(plan.statusCode).toBe(201);
        const withPlan = await preview({
          segment: { tags: [tag], activePlan: true },
          channel: "whatsapp",
          body: "Oi",
        });
        expect(withPlan.json()).toMatchObject({ matched: 1, queued: 1 });
        const noPlan = await preview({
          segment: { tags: [tag], activePlan: false },
          channel: "whatsapp",
          body: "Oi",
        });
        expect(noPlan.json()).toMatchObject({ matched: 2 });

        const inactive = await preview({
          segment: { tags: [tag], status: "inactive" },
          channel: "whatsapp",
          body: "Oi",
        });
        expect(inactive.json()).toMatchObject({
          matched: 0,
          queued: 0,
          skipped: [],
        });
        expect(inactive.json()).not.toHaveProperty("sampleBody");
        const emptyFilters = await preview({
          segment: { tags: [tag], status: "", activePlan: "" },
          channel: "whatsapp",
          body: "Oi",
        });
        expect(emptyFilters.statusCode).toBe(200);
        expect(emptyFilters.json()).toMatchObject({ matched: 3 });
        expect(await manualCount()).toBe(before);
        await app.close();
      } finally {
        vi.useRealTimers();
      }
    });

    it("queues manual messages in the outbox with the first name filled in", async () => {
      const { app, headers, ana, carla, manualCount } = await setup();
      const before = await manualCount();
      const response = await app.inject({
        method: "POST",
        url: "/communications/broadcast",
        headers,
        payload: {
          segment: { tags: [tag] },
          channel: "email",
          body: "Oi, {{nome}}! Temos novidades.",
        },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        preview: false,
        channel: "email",
        matched: 3,
        queued: 1,
      });
      expect(response.json().skipped).toHaveLength(2);
      expect(await manualCount()).toBe(before + 1);

      const whatsapp = await app.inject({
        method: "POST",
        url: "/communications/broadcast",
        headers,
        payload: {
          segment: { tags: [tag] },
          channel: "whatsapp",
          body: "Até breve, {{nome}}.",
        },
      });
      expect(whatsapp.statusCode).toBe(201);
      expect(whatsapp.json()).toMatchObject({ queued: 3, skipped: [] });
      const center = await app.inject({
        method: "GET",
        url: "/communications",
        headers,
      });
      const messages = (
        center.json() as {
          deliveryMode: string;
          messages: Array<Record<string, unknown>>;
        }
      ).messages.filter((message) => message.kind === "manual");
      expect(center.json().deliveryMode).toBe("outbox_only");
      expect(messages).toHaveLength(before + 4);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            patientId: ana.id,
            channel: "email",
            recipient: "ana.comunicado@example.com",
            body: "Oi, Ana! Temos novidades.",
            status: "queued",
            attempts: 0,
          }),
          expect.objectContaining({
            patientId: ana.id,
            channel: "whatsapp",
            recipient: "11988880001",
            body: "Até breve, Ana.",
          }),
          expect.objectContaining({
            patientId: carla.id,
            channel: "whatsapp",
            recipient: "11922220003",
            body: "Até breve, Carla.",
          }),
        ]),
      );
      expect(
        messages.some(
          (message) =>
            message.patientId === carla.id && message.channel === "email",
        ),
      ).toBe(false);
      await app.close();
    });

    it("skips messages that exceed the limit once the name is filled in", async () => {
      const { app, headers } = await setup();
      const created = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Maximiliano Comunicado",
          phone: "11922220005",
          whatsapp: "11922220005",
          emergencyContactName: "Maximiliano Comunicado",
          emergencyContactPhone: "11922220005",
          tags: [tag],
        },
      });
      expect(created.statusCode).toBe(201);
      // Modelo com 500 caracteres: "Ana", "Bruno" e "Carla" cabem; "Maximiliano" passa (503).
      const response = await app.inject({
        method: "POST",
        url: "/communications/broadcast/preview",
        headers,
        payload: {
          segment: { tags: [tag] },
          channel: "whatsapp",
          body: `{{nome}}${"x".repeat(492)}`,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        matched: 4,
        queued: 3,
        skipped: [
          {
            patientId: created.json().id,
            patientName: "Maximiliano Comunicado",
            reason: "message_too_long",
          },
        ],
      });
      await app.close();
    });

    it("validates the input and requires commercial access", async () => {
      const { app, headers } = await setup();
      for (const payload of [
        { channel: "sms", body: "Oi" },
        { channel: "email", body: "  " },
        { channel: "email", body: "x".repeat(501) },
        { segment: { status: "archived" }, channel: "email", body: "Oi" },
        { segment: { activePlan: "sim" }, channel: "email", body: "Oi" },
      ]) {
        for (const url of [
          "/communications/broadcast/preview",
          "/communications/broadcast",
        ]) {
          const response = await app.inject({
            method: "POST",
            url,
            headers,
            payload,
          });
          expect(response.statusCode, JSON.stringify(payload)).toBe(400);
          expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
        }
      }
      await seedRoleUsers(app);
      const physiotherapist = {
        authorization: `Bearer ${app.jwt.sign({
          sub: roleSub(app, "physiotherapist"),
          clinicId: "11111111-1111-4111-8111-111111111111",
          role: "user" as const,
        })}`,
      };
      const payload = {
        segment: { tags: [tag] },
        channel: "whatsapp",
        body: "Oi",
      };
      for (const url of [
        "/communications/broadcast/preview",
        "/communications/broadcast",
      ]) {
        const denied = await app.inject({
          method: "POST",
          url,
          headers: physiotherapist,
          payload,
        });
        expect(denied.statusCode).toBe(403);
        expect(denied.json()).toMatchObject({
          code: "COMMERCIAL_ACCESS_DENIED",
        });
        const anonymous = await app.inject({ method: "POST", url, payload });
        expect(anonymous.statusCode).toBe(401);
      }
      await app.close();
    });
  });

  describe("guided patient creation", () => {
    const PROFESSIONAL_ID = "33333333-3333-4333-8333-333333333333";
    const SERVICE_ID = "77777777-7777-4777-8777-777777777777";
    const OTHER_SERVICE_ID = "88888888-8888-4888-8888-888888888888";
    const planTerms = {
      services: [
        { serviceId: SERVICE_ID, totalSessions: 8, totalValueInCents: 40000 },
      ],
      name: "Pilates mensal",
      serviceId: SERVICE_ID,
      totalSessions: 8,
      validFrom: "2026-01-01",
      validUntil: "2099-12-31",
      totalValueInCents: 40000,
      installments: 2,
      firstDueDate: "2026-01-10",
    };
    // Plano avulso: uma sessão de um serviço (AP5).
    const singleTerms = {
      ...planTerms,
      services: [
        { serviceId: SERVICE_ID, totalSessions: 1, totalValueInCents: 40000 },
      ],
      name: "Sessão avulsa",
      totalSessions: 1,
    };
    async function setup() {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const rooms = (
        await app.inject({ method: "GET", url: "/rooms", headers })
      ).json() as {
        id: string;
        capacity: number;
      }[];
      const roomId = rooms.find((room) => room.capacity >= 4)!.id;
      const configuredTerms = await configuredPlan(app, planTerms);
      const guided = (payload: Record<string, unknown>, as = headers) =>
        app.inject({
          method: "POST",
          url: "/patients/guided",
          headers: as,
          payload: {
            ...payload,
            patient: {
              cpf: nextTestCpf(),
              ...testPatientContact,
              ...(payload.patient as object),
            },
            ...(payload.plan
              ? {
                  plan: {
                    planTemplateId: configuredTerms.planTemplateId,
                    services: configuredTerms.services,
                    ...(payload.plan as object),
                  },
                }
              : {}),
          },
        });
      const findPatients = async (search: string) =>
        (
          await app.inject({
            method: "GET",
            url: `/patients?search=${encodeURIComponent(search)}`,
            headers,
          })
        ).json() as { id: string }[];
      let groupWeekday = 0;
      const createGroup = async (serviceId: string, capacity = 4) => {
        groupWeekday += 1;
        const group = await app.inject({
          method: "POST",
          url: "/groups",
          headers,
          payload: {
            capacity,
            serviceId,
            professionalId: PROFESSIONAL_ID,
            roomId,
            weeklySlots: [
              { weekday: groupWeekday, startTime: "18:00", endTime: "19:00" },
            ],
          },
        });
        expect(group.statusCode, group.body).toBe(201);
        return group.json().id as string;
      };
      const createUser = async (modules: string[], editModules: string[]) => {
        const email = `guiado.${Math.random().toString(36).slice(2)}@teste.local`;
        const created = await app.inject({
          method: "POST",
          url: "/admin/users",
          headers,
          payload: {
            fullName: "Usuária Guiada",
            email,
            password: "SenhaForte123",
            role: "user",
            modules,
            editModules,
          },
        });
        expect(created.statusCode).toBe(201);
        const login = await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email, password: "SenhaForte123" },
        });
        return { authorization: `Bearer ${login.json().token as string}` };
      };
      return {
        app,
        headers,
        roomId,
        guided,
        findPatients,
        createGroup,
        createUser,
      };
    }

    it("keeps the payment method chosen for the plan and the single service", async () => {
      const { app, headers, guided } = await setup();
      const plan = await guided({
        next: "plan",
        patient: { fullName: "Pix Guiado", phone: "11955550101" },
        plan: { ...planTerms, kind: "fixed_package", paymentMethod: "pix" },
      });
      expect(plan.statusCode, plan.body).toBe(201);
      expect(plan.json().plan).toMatchObject({ paymentMethod: "pix" });
      const stored = await app.inject({
        method: "GET",
        url: `/plans?patientId=${plan.json().patient.id as string}`,
        headers,
      });
      expect(stored.json()).toEqual([
        expect.objectContaining({ paymentMethod: "pix" }),
      ]);
      const single = await guided({
        next: "single",
        patient: { fullName: "Cartão Guiado", phone: "11955550102" },
        plan: {
          ...singleTerms,
          installments: 1,
          validUntil: "",
          paymentMethod: "card",
        },
      });
      expect(single.statusCode, single.body).toBe(201);
      expect(single.json().plan).toMatchObject({
        kind: "single",
        paymentMethod: "card",
      });
      const undecided = await guided({
        next: "plan",
        patient: { fullName: "A Combinar Guiado", phone: "11955550103" },
        plan: { ...planTerms, kind: "fixed_package" },
      });
      expect(undecided.statusCode, undecided.body).toBe(201);
      expect(undecided.json().plan).not.toHaveProperty("paymentMethod");
      const invalid = await guided({
        next: "plan",
        patient: { fullName: "Forma Inválida", phone: "11955550104" },
        plan: { ...planTerms, kind: "fixed_package", paymentMethod: "cheque" },
      });
      expect(invalid.statusCode).toBe(400);
      await app.close();
    });

    it("schedules the demonstration class with holiday, conflict and tag checks, all or nothing", async () => {
      const { app, headers, roomId, guided, findPatients } = await setup();
      await configureTags(app, headers, ["Experimental T064"]);
      const appointment = {
        serviceId: SERVICE_ID,
        professionalId: PROFESSIONAL_ID,
        roomId,
        startsAt: "2031-03-12T13:00:00.000Z",
      };
      const created = await guided({
        next: "demonstration",
        patient: {
          fullName: "Demo Guiada",
          phone: "11955550001",
          whatsapp: "11955550001",
          emergencyContactName: "Demo Guiada",
          emergencyContactPhone: "11955550001",
          tags: ["experimental t064"],
        },
        appointment: { ...appointment, notes: "Primeira aula" },
      });
      expect(created.statusCode).toBe(201);
      const body = created.json();
      expect(body.patient).toMatchObject({
        fullName: "Demo Guiada",
        tags: ["Experimental T064"],
      });
      expect(body.appointment).toMatchObject({
        patientId: body.patient.id,
        visitType: "trial",
        serviceId: SERVICE_ID,
        status: "scheduled",
        notes: "Primeira aula",
      });
      expect(body.plan).toBeUndefined();
      const agenda = await app.inject({
        method: "GET",
        url: "/appointments?from=2031-03-12T00:00:00.000Z&to=2031-03-13T00:00:00.000Z",
        headers,
      });
      expect(agenda.json().map((item: Appointment) => item.id)).toContain(
        body.appointment.id,
      );

      // Conflito de agenda: nem o cliente fica gravado.
      const conflict = await guided({
        next: "demonstration",
        patient: { fullName: "Conflito Guiado", phone: "11955550002" },
        appointment,
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ code: "APPOINTMENT_CONFLICT" });
      expect(await findPatients("Conflito Guiado")).toEqual([]);

      const holiday = await app.inject({
        method: "POST",
        url: "/holidays",
        headers,
        payload: { date: "2031-03-19", name: "Feriado teste" },
      });
      expect(holiday.statusCode).toBe(201);
      const onHoliday = await guided({
        next: "demonstration",
        patient: { fullName: "Feriado Guiado", phone: "11955550003" },
        appointment: { ...appointment, startsAt: "2031-03-19T13:00:00.000Z" },
      });
      expect(onHoliday.statusCode).toBe(409);
      expect(onHoliday.json()).toMatchObject({ code: "HOLIDAY" });
      expect(await findPatients("Feriado Guiado")).toEqual([]);

      const unknownTag = await guided({
        next: "demonstration",
        patient: {
          fullName: "Etiqueta Guiada",
          phone: "11955550004",
          whatsapp: "11955550004",
          emergencyContactName: "Etiqueta Guiada",
          emergencyContactPhone: "11955550004",
          tags: ["vip"],
        },
        appointment: { ...appointment, startsAt: "2031-03-26T13:00:00.000Z" },
      });
      expect(unknownTag.statusCode).toBe(400);
      expect(unknownTag.json()).toMatchObject({
        code: "PATIENT_TAG_UNKNOWN",
        details: { unknownTags: ["vip"] },
      });
      expect(await findPatients("Etiqueta Guiada")).toEqual([]);

      const missingRoom = await guided({
        next: "demonstration",
        patient: { fullName: "Sala Guiada", phone: "11955550005" },
        appointment: {
          ...appointment,
          roomId: "99999999-9999-4999-8999-999999999999",
        },
      });
      expect(missingRoom.statusCode).toBe(404);
      expect(missingRoom.json()).toMatchObject({
        code: "RELATED_RECORD_NOT_FOUND",
      });
      expect(await findPatients("Sala Guiada")).toEqual([]);

      const onlyPatient = await guided({
        next: "none",
        patient: { fullName: "Só Cadastro", phone: "11955550006" },
      });
      expect(onlyPatient.statusCode).toBe(201);
      expect(onlyPatient.json()).toEqual({
        patient: expect.objectContaining({ fullName: "Só Cadastro" }),
      });
      await app.close();
    });

    it("creates subscription and single plans, with an optional group of the same service", async () => {
      const { app, headers, guided, findPatients, createGroup } = await setup();
      const groupId = await createGroup(SERVICE_ID);
      const otherGroupId = await createGroup(OTHER_SERVICE_ID);
      const plansBefore = (
        await app.inject({ method: "GET", url: "/plans", headers })
      ).json().length as number;

      const withGroup = await guided({
        next: "plan",
        patient: { fullName: "Assinante Com Turma", phone: "11966660001" },
        plan: { ...planTerms, kind: "recurring", installments: 1 },
        groupId,
      });
      expect(withGroup.statusCode).toBe(201);
      const withGroupBody = withGroup.json();
      expect(withGroupBody.plan).toMatchObject({
        patientId: withGroupBody.patient.id,
        kind: "recurring",
        status: "active",
        remainingSessions: 8,
      });
      expect(withGroupBody.enrollment).toMatchObject({
        groupId,
        patientId: withGroupBody.patient.id,
        status: "active",
      });

      const withoutGroup = await guided({
        next: "plan",
        patient: { fullName: "Assinante Sem Turma", phone: "11966660002" },
        plan: { ...planTerms, kind: "fixed_package" },
        groupId: "",
      });
      expect(withoutGroup.statusCode).toBe(201);
      expect(withoutGroup.json().plan.kind).toBe("fixed_package");
      expect(withoutGroup.json().enrollment).toBeUndefined();

      const single = await guided({
        next: "single",
        patient: { fullName: "Cliente Avulso", phone: "11966660003" },
        plan: {
          ...planTerms,
          services: planTerms.services.map((entry) => ({
            ...entry,
            totalSessions: 1,
          })),
          name: "Sessão avulsa",
          totalSessions: 1,
          installments: 1,
        },
      });
      expect(single.statusCode).toBe(201);
      expect(single.json().plan).toMatchObject({
        kind: "single",
        totalSessions: 1,
      });
      const receivables = (
        await app.inject({ method: "GET", url: "/finance/summary", headers })
      ).json().receivables as { planId?: string }[];
      expect(
        receivables.filter((item) => item.planId === withGroupBody.plan.id),
        // Recorrente: uma cobrança por ciclo, mais a proporcional das aulas da turma
        // do início (01/01) até a véspera do 1º vencimento (10/01).
      ).toHaveLength(2);

      // Turma de outro serviço: nada fica gravado.
      const mismatch = await guided({
        next: "plan",
        patient: { fullName: "Turma Errada", phone: "11966660004" },
        plan: { ...planTerms, kind: "recurring", installments: 1 },
        groupId: otherGroupId,
      });
      expect(mismatch.statusCode).toBe(400);
      expect(mismatch.json()).toMatchObject({ code: "GROUP_SERVICE_MISMATCH" });
      const missingGroup = await guided({
        next: "plan",
        patient: { fullName: "Turma Errada", phone: "11966660004" },
        plan: { ...planTerms, kind: "recurring", installments: 1 },
        groupId: "99999999-9999-4999-8999-999999999999",
      });
      expect(missingGroup.statusCode).toBe(404);
      expect(missingGroup.json()).toMatchObject({
        code: "GROUP_OR_PATIENT_NOT_FOUND",
      });
      // Serviço inexistente: o plano falha depois do cliente, que é desfeito.
      const missingService = await guided({
        next: "single",
        patient: { fullName: "Turma Errada", phone: "11966660004" },
        plan: {
          ...planTerms,
          services: [
            {
              serviceId: "99999999-9999-4999-8999-999999999999",
              totalSessions: 1,
              totalValueInCents: planTerms.totalValueInCents,
            },
          ],
        },
      });
      expect(missingService.statusCode).toBe(400);
      expect(missingService.json()).toMatchObject({
        code: "PLAN_SERVICE_COMPOSITION_MISMATCH",
      });
      expect(await findPatients("Turma Errada")).toEqual([]);
      const plansAfter = (
        await app.inject({ method: "GET", url: "/plans", headers })
      ).json();
      expect(plansAfter).toHaveLength(plansBefore + 3);

      for (const payload of [
        {
          next: "plan",
          patient: { fullName: "Tipo Errado", phone: "11966660005" },
          plan: { ...planTerms, kind: "single" },
        },
        {
          next: "single",
          patient: { fullName: "Tipo Errado", phone: "11966660005" },
        },
        {
          next: "assinatura",
          patient: { fullName: "Tipo Errado", phone: "11966660005" },
        },
      ]) {
        const invalid = await guided(payload);
        expect(invalid.statusCode, JSON.stringify(payload)).toBe(400);
        expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
      }
      expect(await findPatients("Tipo Errado")).toEqual([]);
      await app.close();
    });

    it("creates several plans and single services at once, each plan with its own optional group", async () => {
      const { app, headers, guided, findPatients, createGroup } = await setup();
      const groupId = await createGroup(SERVICE_ID);
      const otherGroupId = await createGroup(OTHER_SERVICE_ID);
      const otherTerms = await configuredPlan(app, {
        ...planTerms,
        name: "Dança mensal",
        serviceId: OTHER_SERVICE_ID,
        services: [
          {
            serviceId: OTHER_SERVICE_ID,
            totalSessions: 4,
            totalValueInCents: 20000,
          },
        ],
        totalSessions: 4,
        totalValueInCents: 20000,
      });
      const otherPlan = {
        ...otherTerms,
        kind: "recurring",
        installments: 1,
      };
      const created = await guided({
        next: "plan",
        patient: { fullName: "Dois Planos", phone: "11966670001" },
        plan: { ...planTerms, kind: "fixed_package" },
        groupId,
        additionalPlans: [
          { plan: otherPlan, groupId: otherGroupId },
          { plan: { ...otherPlan, kind: "fixed_package" }, groupId: "" },
          {
            plan: {
              ...otherTerms,
              services: otherTerms.services.map((entry) => ({
                ...entry,
                totalSessions: 1,
              })),
              totalSessions: 1,
              kind: "single",
              installments: 1,
              validUntil: "",
            },
          },
        ],
      });
      expect(created.statusCode, created.body).toBe(201);
      const body = created.json();
      expect(body.plan).toMatchObject({
        name: "Pilates mensal",
        kind: "fixed_package",
      });
      expect(body.enrollment).toMatchObject({ groupId });
      expect(body.additionalPlans).toEqual([
        {
          plan: expect.objectContaining({
            name: "Dança mensal",
            kind: "recurring",
            patientId: body.patient.id,
          }),
          enrollment: expect.objectContaining({ groupId: otherGroupId }),
        },
        {
          plan: expect.objectContaining({
            name: "Dança mensal",
            kind: "fixed_package",
          }),
        },
        {
          plan: expect.objectContaining({ kind: "single" }),
        },
      ]);
      const stored = (
        await app.inject({
          method: "GET",
          url: `/plans?patientId=${body.patient.id as string}`,
          headers,
        })
      ).json() as unknown[];
      expect(stored).toHaveLength(4);

      // A mesma turma em dois planos: recusado na validação.
      const repeatedGroup = await guided({
        next: "plan",
        patient: { fullName: "Turma Repetida", phone: "11966670002" },
        plan: { ...planTerms, kind: "fixed_package" },
        groupId,
        additionalPlans: [
          {
            plan: { ...planTerms, kind: "recurring", installments: 1 },
            groupId,
          },
        ],
      });
      expect(repeatedGroup.statusCode).toBe(400);
      expect(repeatedGroup.json()).toMatchObject({ code: "VALIDATION_ERROR" });
      // Serviço avulso não tem turma.
      const singleWithGroup = await guided({
        next: "plan",
        patient: { fullName: "Avulso Com Turma", phone: "11966670004" },
        plan: { ...planTerms, kind: "fixed_package" },
        additionalPlans: [
          {
            plan: { ...otherTerms, kind: "single", installments: 1 },
            groupId: otherGroupId,
          },
        ],
      });
      expect(singleWithGroup.statusCode).toBe(400);
      expect(await findPatients("Avulso Com Turma")).toEqual([]);

      // Turma de outro serviço no plano adicional: nada fica gravado.
      const plansBefore = (
        await app.inject({ method: "GET", url: "/plans", headers })
      ).json().length as number;
      const mismatch = await guided({
        next: "plan",
        patient: { fullName: "Adicional Errado", phone: "11966670003" },
        plan: { ...planTerms, kind: "fixed_package" },
        additionalPlans: [{ plan: otherPlan, groupId }],
      });
      expect(mismatch.statusCode).toBe(400);
      expect(mismatch.json()).toMatchObject({ code: "GROUP_SERVICE_MISMATCH" });
      expect(await findPatients("Adicional Errado")).toEqual([]);
      expect(
        (await app.inject({ method: "GET", url: "/plans", headers })).json(),
      ).toHaveLength(plansBefore);
      await app.close();
    });

    it("computes the prorated first charge of each guided plan from its class", async () => {
      const { app, headers, guided, createGroup } = await setup();
      // Primeira turma do teste: às segundas. De 10/12/2025 a 09/01/2026 são 4 segundas;
      // de 01/01 a 09/01, 1 (05/01): 1/4 no início e a mensalidade cheia em 10/01.
      const groupId = await createGroup(SERVICE_ID);
      const created = await guided({
        next: "plan",
        patient: { fullName: "Proporcional Guiado", phone: "11966670010" },
        plan: {
          ...planTerms,
          kind: "recurring",
          installments: 1,
          // Valor enviado pela tela é descartado: o servidor calcula pela turma.
          proratedChargeInCents: 1,
        },
        groupId,
      });
      expect(created.statusCode, created.body).toBe(201);
      const receivables = (
        (
          await app.inject({
            method: "GET",
            url: "/finance/workspace",
            headers,
          })
        ).json().summary.receivables as {
          planId?: string;
          dueDate: string;
          amountInCents: number;
        }[]
      ).filter((item) => item.planId === created.json().plan.id);
      expect(
        receivables
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          .map((item) => [item.dueDate, item.amountInCents]),
      ).toEqual([
        ["2026-01-01", 10_000],
        ["2026-01-10", 40_000],
      ]);
      await app.close();
    });

    it("checks the installment limit of every plan in the guided registration", async () => {
      const { app, headers, guided, findPatients } = await setup();
      const saved = await app.inject({
        method: "PUT",
        url: "/admin/payment-methods",
        headers,
        payload: {
          methods: [
            { method: "pix", acceptsInstallments: false, maxInstallments: 1 },
          ],
        },
      });
      expect(saved.statusCode).toBe(200);
      // O principal está dentro do limite; o adicional no Pix em 2x, não.
      const additionalTerms = await configuredPlan(app, planTerms);
      const refused = await guided({
        next: "plan",
        patient: { fullName: "Adicional Parcelado", phone: "11966670009" },
        plan: { ...planTerms, kind: "fixed_package", paymentMethod: "card" },
        additionalPlans: [
          {
            plan: {
              ...additionalTerms,
              kind: "fixed_package",
              paymentMethod: "pix",
            },
          },
        ],
      });
      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toMatchObject({
        code: "INSTALLMENTS_NOT_ALLOWED",
        message: "Pix não aceita parcelamento: use 1 parcela.",
      });
      expect(await findPatients("Adicional Parcelado")).toEqual([]);
      await app.close();
    });

    it("filters subscribers without a linked group in the list and in the export", async () => {
      const { app, headers, guided, createGroup } = await setup();
      const groupId = await createGroup(SERVICE_ID);
      const fullGroupId = await createGroup(SERVICE_ID, 1);
      const otherGroupId = await createGroup(OTHER_SERVICE_ID);
      const create = async (payload: Record<string, unknown>) => {
        const response = await guided(payload);
        expect(response.statusCode).toBe(201);
        return response.json() as {
          patient: { id: string };
          plan?: { id: string };
        };
      };
      const enrolled = await create({
        next: "plan",
        patient: { fullName: "Filtro Matriculada", phone: "11977771001" },
        plan: { ...planTerms, kind: "recurring", installments: 1 },
        groupId,
      });
      const noGroup = await create({
        next: "plan",
        patient: { fullName: "Filtro Sem Turma", phone: "11977771002" },
        plan: { ...planTerms, kind: "recurring", installments: 1 },
      });
      const otherService = await create({
        next: "plan",
        patient: { fullName: "Filtro Outra Turma", phone: "11977771003" },
        plan: { ...planTerms, kind: "fixed_package" },
      });
      const otherEnroll = await app.inject({
        method: "POST",
        url: "/group-enrollments",
        headers,
        payload: { groupId: otherGroupId, patientId: otherService.patient.id },
      });
      expect(otherEnroll.statusCode).toBe(201);
      await create({
        next: "plan",
        patient: { fullName: "Filtro Ocupa Vaga", phone: "11977771004" },
        plan: { ...planTerms, kind: "recurring", installments: 1 },
        groupId: fullGroupId,
      });
      // Venda com turma cheia é recusada (TW3); a espera da turma vem de Turmas, sem plano novo.
      const waitlisted = await create({
        next: "plan",
        patient: { fullName: "Filtro Espera", phone: "11977771005" },
        plan: { ...planTerms, kind: "recurring", installments: 1 },
      });
      const waitlistEnroll = await app.inject({
        method: "POST",
        url: "/group-enrollments",
        headers,
        payload: { groupId: fullGroupId, patientId: waitlisted.patient.id },
      });
      expect(waitlistEnroll.json()).toMatchObject({ status: "waitlisted" });
      await create({
        next: "single",
        patient: { fullName: "Filtro Avulso", phone: "11977771006" },
        plan: singleTerms,
      });
      const paused = await create({
        next: "plan",
        patient: { fullName: "Filtro Pausado", phone: "11977771007" },
        plan: { ...planTerms, kind: "recurring", installments: 1 },
      });
      const pause = await app.inject({
        method: "PATCH",
        url: `/plans/${paused.plan!.id}/status`,
        headers,
        payload: { status: "paused" },
      });
      expect(pause.statusCode).toBe(200);
      await create({
        next: "none",
        patient: { fullName: "Filtro Sem Plano", phone: "11977771008" },
      });

      const list = await app.inject({
        method: "GET",
        url: "/patients?search=Filtro&withoutGroup=true",
        headers,
      });
      expect(list.statusCode).toBe(200);
      const ids = list.json().map((patient: { id: string }) => patient.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          noGroup.patient.id,
          otherService.patient.id,
          waitlisted.patient.id,
        ]),
      );
      expect(ids).toHaveLength(3);
      expect(ids).not.toContain(enrolled.patient.id);
      const everyone = await app.inject({
        method: "GET",
        url: "/patients?search=Filtro",
        headers,
      });
      expect(everyone.json()).toHaveLength(8);
      const invalid = await app.inject({
        method: "GET",
        url: "/patients?withoutGroup=sim",
        headers,
      });
      expect(invalid.statusCode).toBe(400);

      const exported = await app.inject({
        method: "GET",
        url: "/patients/export?search=Filtro&withoutGroup=true&columns=fullName",
        headers,
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.body.slice(1).replace(/\r\n$/, "").split("\r\n")).toEqual(
        ["Nome", "Filtro Espera", "Filtro Outra Turma", "Filtro Sem Turma"],
      );
      await app.close();
    });

    it("requires editing patients plus the module of the chosen step", async () => {
      const { app, roomId, guided, findPatients, createGroup, createUser } =
        await setup();
      const groupId = await createGroup(SERVICE_ID);
      const patient = (name: string) => ({
        cpf: nextTestCpf(),
        fullName: name,
        phone: "11988880001",
      });
      const demonstration = (name: string) => ({
        next: "demonstration",
        patient: patient(name),
        appointment: {
          serviceId: SERVICE_ID,
          professionalId: PROFESSIONAL_ID,
          roomId,
          startsAt: "2031-04-02T13:00:00.000Z",
        },
      });
      const plan = (name: string, withGroup = false) => ({
        next: "plan",
        patient: patient(name),
        plan: { ...planTerms, kind: "recurring", installments: 1 },
        ...(withGroup ? { groupId } : {}),
      });

      const viewer = await createUser(
        ["patients", "agenda", "plans"],
        ["agenda", "plans"],
      );
      const noEdit = await guided(
        { next: "none", patient: patient("Perm Sem Edição") },
        viewer,
      );
      expect(noEdit.statusCode).toBe(403);
      expect(noEdit.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });

      const patientsOnly = await createUser(["patients"], ["patients"]);
      const none = await guided(
        { next: "none", patient: patient("Perm Só Cadastro") },
        patientsOnly,
      );
      expect(none.statusCode).toBe(201);
      const demoDenied = await guided(
        demonstration("Perm Demo Negada"),
        patientsOnly,
      );
      expect(demoDenied.statusCode).toBe(403);
      expect(demoDenied.json()).toMatchObject({
        code: "AGENDA_ACCESS_DENIED",
        details: { permission: "agenda.create" },
      });
      const planDenied = await guided(plan("Perm Plano Negado"), patientsOnly);
      expect(planDenied.statusCode).toBe(403);
      expect(planDenied.json()).toMatchObject({
        code: "COMMERCIAL_ACCESS_DENIED",
      });
      const singleDenied = await guided(
        {
          next: "single",
          patient: patient("Perm Avulso Negado"),
          plan: singleTerms,
        },
        patientsOnly,
      );
      expect(singleDenied.statusCode).toBe(403);

      const withPlans = await createUser(
        ["patients", "plans"],
        ["patients", "plans"],
      );
      const groupDenied = await guided(
        plan("Perm Turma Negada", true),
        withPlans,
      );
      expect(groupDenied.statusCode).toBe(403);
      expect(groupDenied.json()).toMatchObject({ code: "GROUP_ACCESS_DENIED" });
      expect((await guided(plan("Perm Plano Ok"), withPlans)).statusCode).toBe(
        201,
      );

      const full = await createUser(
        ["patients", "plans", "groups", "agenda"],
        ["patients", "plans", "groups", "agenda"],
      );
      expect((await guided(plan("Perm Turma Ok", true), full)).statusCode).toBe(
        201,
      );
      expect(
        (await guided(demonstration("Perm Demo Ok"), full)).statusCode,
      ).toBe(201);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/patients/guided",
            payload: plan("Anônimo"),
          })
        ).statusCode,
      ).toBe(401);
      expect(await findPatients("Negad")).toEqual([]);
      await app.close();
    });
  });
});
