import { describe, expect, it, vi } from "vitest";
import type { Appointment, Lead, UserRole } from "@crm/contracts";
import { defaultRelationshipSettings, groupClassName } from "@crm/contracts";
import { localParts, zonedTimeToUtc } from "./group-schedule.js";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { MemoryClinicRepository } from "./memory-repository.js";

async function authenticatedApp() {
  const app = await buildApp({
    repository: new MemoryClinicRepository(),
    logger: false,
  });
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@movimenta.local", password: "Admin@123" },
  });
  return { app, token: response.json().token as string };
}

describe("CRM API", () => {
  it("allows the web app to send every write method through CORS", async () => {
    const app = await buildApp({ repository: new MemoryClinicRepository(), logger: false });
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
      expect(preflight.headers["access-control-allow-origin"]).toBe(config.WEB_ORIGIN);
      expect(String(preflight.headers["access-control-allow-methods"])).toContain(method);
    }
    await app.close();
  });

  it("reports health", async () => {
    const app = await buildApp({
      repository: new MemoryClinicRepository(),
      logger: false,
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      storage: config.STORAGE_MODE,
    });
    await app.close();
  });

  it("allows either local frontend address during development", async () => {
    const app = await buildApp({ repository: new MemoryClinicRepository(), logger: false });
    const local = await app.inject({ method: "GET", url: "/health", headers: { origin: "http://127.0.0.1:5173" } });
    expect(local.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    const external = await app.inject({ method: "GET", url: "/health", headers: { origin: "http://example.com" } });
    expect(external.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("authenticates the demo owner", async () => {
    const { app, token } = await authenticatedApp();
    expect(token).toBeTypeOf("string");
    await app.close();
  });

  it("creates and searches a patient", async () => {
    const { app, token } = await authenticatedApp();
    const created = await app.inject({
      method: "POST",
      url: "/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fullName: "Joana de Souza",
        phone: "11999990000",
        cpf: "12345678901",
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

    const byFormattedPhone = await app.inject({
      method: "GET",
      url: `/patients?search=${encodeURIComponent("(11) 99999-0000")}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(byFormattedPhone.json().map((item: { fullName: string }) => item.fullName)).toContain("Joana de Souza");
    await app.close();
  });

  it("edits a patient without changing their record number or duplicating a CPF", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patient = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          fullName: "Joana de Souza",
          phone: "11999990000",
          cpf: "12345678901",
          tags: [],
        },
      })
    ).json();
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
        payload: {
          patientId: patient.id,
          professionalId: professional.json()[0].id,
          roomId: room.json()[0].id,
          serviceId: service.json()[0].id,
          startsAt: startsAt.toISOString(),
        },
      })
    ).json();
    const updated = await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: {
        fullName: "Joana Pereira",
        phone: "11988887777",
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
    expect(agenda.json().find((item: Appointment) => item.id === appointment.id).patientName).toBe("Joana Pereira");
    const other = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: { fullName: "Outra Pessoa", phone: "11911112222", tags: [] },
      })
    ).json();
    const duplicate = await app.inject({
      method: "PUT",
      url: `/patients/${other.id}`,
      headers,
      payload: {
        fullName: other.fullName,
        phone: other.phone,
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
          payload,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/appointments",
          headers,
          payload,
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
      await app.inject({ method: "POST", url: "/appointments", headers, payload: { ...payload, startsAt: at(0) } })
    ).json();
    expect(
      (await app.inject({ method: "POST", url: "/appointments", headers, payload: { ...payload, startsAt: at(2) } })).statusCode,
    ).toBe(201);
    const move = { professionalId: payload.professionalId, roomId: payload.roomId, startsAt: at(1) };
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
    expect(history.json()[0]).toMatchObject({ previousStartsAt: at(0), startsAt: at(1), actorName: "Mariana Costa" });
    expect(
      (await app.inject({ method: "PUT", url: `/appointments/${first.id}/schedule`, headers, payload: move })).statusCode,
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
    expect(afterConflict.json().find((item: Appointment) => item.id === first.id).startsAt).toBe(at(1));
    expect(
      (await app.inject({ method: "GET", url: `/appointments/${first.id}/reschedules`, headers })).json(),
    ).toHaveLength(1);
    expect(
      (await app.inject({ method: "PATCH", url: `/appointments/${first.id}/status`, headers, payload: { status: "cancelled" } })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "PUT", url: `/appointments/${first.id}/schedule`, headers, payload: move })).statusCode,
    ).toBe(409);
    await app.close();
  });

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

  it("denies clinical records to reception profiles", async () => {
    const app = await buildApp({
      repository: new MemoryClinicRepository(),
      logger: false,
    });
    const token = app.jwt.sign({
      sub: "22222222-2222-4222-8222-222222222222",
      clinicId: "11111111-1111-4111-8111-111111111111",
      role: "reception",
    });
    const response = await app.inject({
      method: "GET",
      url: "/clinical-records",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "CLINICAL_ACCESS_DENIED" });
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
      payload: {
        patientId: patient.id,
        serviceId: service.id,
        name: "Pacote teste",
        kind: "fixed_package",
        totalSessions: 5,
        validFrom: date,
        totalValueInCents: 10001,
        installments: 3,
        firstDueDate: date,
      },
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

    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointment.id}/status`,
      headers,
      payload: { status: "completed" },
    });
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

  it("renews recurring plans automatically, catching up missed periods once", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const patientId = patients.json()[0].id as string;
    const serviceId = services.json()[0].id as string;
    const now = new Date();
    const monthStart = (offset: number) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
        .toISOString()
        .slice(0, 10);
    const monthEnd = (offset: number) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0))
        .toISOString()
        .slice(0, 10);
    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        patientId,
        serviceId,
        name: "Mensalidade Pilates",
        kind: "recurring",
        totalSessions: 8,
        validFrom: monthStart(-3),
        validUntil: monthEnd(-3),
        totalValueInCents: 40000,
        installments: 1,
        firstDueDate: monthStart(-3),
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().autoRenew).toBe(true);

    const listPlans = async () =>
      (
        await app.inject({
          method: "GET",
          url: `/plans?patientId=${patientId}`,
          headers,
        })
      ).json() as {
        id: string;
        status: string;
        validFrom: string;
        validUntil: string;
        remainingSessions: number;
        renewedFromPlanId?: string;
        renewedByPlanId?: string;
      }[];
    const plans = await listPlans();
    expect(plans.map((plan) => plan.validFrom).sort()).toEqual([
      monthStart(-3),
      monthStart(-2),
      monthStart(-1),
      monthStart(0),
    ]);
    const current = plans.find((plan) => plan.validFrom === monthStart(0))!;
    expect(current).toMatchObject({
      status: "active",
      validUntil: monthEnd(0),
      remainingSessions: 8,
    });
    expect(
      plans.filter((plan) => plan.status === "expired").map((plan) => plan.validFrom).sort(),
    ).toEqual([monthStart(-3), monthStart(-2), monthStart(-1)]);
    const original = plans.find((plan) => plan.id === created.json().id)!;
    expect(original.renewedByPlanId).toBeTruthy();
    expect(
      plans.find((plan) => plan.id === original.renewedByPlanId)!.renewedFromPlanId,
    ).toBe(original.id);

    expect(await listPlans()).toHaveLength(4);
    const receivables = (
      await app.inject({ method: "GET", url: "/finance/summary", headers })
    )
      .json()
      .receivables.filter((item: { patientId: string }) => item.patientId === patientId);
    expect(
      receivables.map((item: { dueDate: string }) => item.dueDate).sort(),
    ).toEqual([monthStart(-3), monthStart(-2), monthStart(-1), monthStart(0)]);

    const disabled = await app.inject({
      method: "PATCH",
      url: `/plans/${current.id}/auto-renew`,
      headers,
      payload: { autoRenew: false },
    });
    expect(disabled.json().autoRenew).toBe(false);
    await app.close();
  });

  it("renews a plan manually with new terms only once", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const payload = {
      patientId: patients.json()[0].id,
      serviceId: services.json()[0].id,
      name: "Pacote fisioterapia",
      kind: "fixed_package",
      totalSessions: 10,
      validFrom: "2026-01-01",
      totalValueInCents: 150000,
      installments: 2,
      firstDueDate: "2026-01-05",
    };
    const created = await app.inject({ method: "POST", url: "/plans", headers, payload });
    expect(created.json().autoRenew).toBe(false);
    const withoutEnd = await app.inject({
      method: "PATCH",
      url: `/plans/${created.json().id}/auto-renew`,
      headers,
      payload: { autoRenew: true },
    });
    expect(withoutEnd.statusCode).toBe(409);

    const renewal = {
      name: "Pacote fisioterapia",
      totalSessions: 12,
      validFrom: "2026-10-01",
      validUntil: "2026-12-31",
      totalValueInCents: 172000,
      installments: 3,
      firstDueDate: "2026-10-05",
    };
    const renewed = await app.inject({
      method: "POST",
      url: `/plans/${created.json().id}/renew`,
      headers,
      payload: renewal,
    });
    expect(renewed.statusCode).toBe(201);
    expect(renewed.json()).toMatchObject({
      kind: "fixed_package",
      remainingSessions: 12,
      totalValueInCents: 172000,
      renewedFromPlanId: created.json().id,
      autoRenew: false,
    });
    const again = await app.inject({
      method: "POST",
      url: `/plans/${created.json().id}/renew`,
      headers,
      payload: renewal,
    });
    expect(again.statusCode).toBe(409);
    const movements = await app.inject({
      method: "GET",
      url: `/plans/${renewed.json().id}/movements`,
      headers,
    });
    expect(movements.json()[0]).toMatchObject({
      kind: "credit",
      quantity: 12,
      reason: "Crédito da renovação do plano",
    });

    const other = await app.inject({ method: "POST", url: "/plans", headers, payload });
    await app.inject({
      method: "PATCH",
      url: `/plans/${other.json().id}/status`,
      headers,
      payload: { status: "cancelled" },
    });
    const cancelled = await app.inject({
      method: "POST",
      url: `/plans/${other.json().id}/renew`,
      headers,
      payload: renewal,
    });
    expect(cancelled.statusCode).toBe(409);
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

  it("sends WhatsApp messages to the dedicated number", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = await app.inject({ method: "GET", url: "/patients", headers });
    const patient = patients.json()[0];
    const updated = await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: {
        fullName: patient.fullName,
        phone: patient.phone,
        whatsapp: "(11) 90000-1234",
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
    const withoutWhatsapp = await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: { fullName: patient.fullName, phone: patient.phone, whatsapp: "", tags: patient.tags },
    });
    expect(withoutWhatsapp.json().whatsapp).toBe("");
    const fallback = await app.inject({
      method: "POST",
      url: "/communications/messages",
      headers,
      payload: { patientId: patient.id, channel: "whatsapp", body: "Olá de novo" },
    });
    expect(fallback.json().recipient).toBe(patient.phone);
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

  it("returns reproducible management metrics and an authenticated CSV", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const report = await app.inject({
      method: "GET",
      url: `/reports/management?from=${date}&to=${date}`,
      headers,
    });
    expect(report.statusCode).toBe(200);
    expect(report.json()).toMatchObject({ from: date, to: date });
    expect(report.json().appointments.total).toBeGreaterThan(0);
    expect(report.json().byProfessional.length).toBeGreaterThan(0);
    const csv = await app.inject({
      method: "GET",
      url: `/reports/management.csv?from=${date}&to=${date}`,
      headers,
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("atendimentos");
    const receptionToken = app.jwt.sign({
      sub: "22222222-2222-4222-8222-222222222222",
      clinicId: "11111111-1111-4111-8111-111111111111",
      role: "reception",
    });
    const denied = await app.inject({
      method: "GET",
      url: `/reports/management?from=${date}&to=${date}`,
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(denied.statusCode).toBe(403);
    const month = date.slice(0, 7);
    const sales = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers,
    });
    expect(sales.statusCode).toBe(200);
    expect(sales.json()).toMatchObject({ month, current: { from: `${month}-01` } });
    const xlsx = await app.inject({
      method: "GET",
      url: `/reports/sales.xlsx?month=${month}`,
      headers,
    });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(xlsx.headers["content-disposition"]).toContain(`vendas-${month}.xlsx`);
    const deniedSales = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers: { authorization: `Bearer ${receptionToken}` },
    });
    expect(deniedSales.statusCode).toBe(403);
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
      payload: input,
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
      payload: { ...input, startsAt: blockedStart.toISOString() },
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
      payload: { ...input, startsAt: blockedStart.toISOString() },
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
      responsibleName: "Mariana Costa",
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
    expect(contact.json()).toMatchObject({ actorName: "Mariana Costa" });
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

  it("operates receivables, payables, receipts and monthly cash flow", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patientsResponse, servicesResponse] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const patient = patientsResponse.json()[0];
    const service = servicesResponse.json()[0];
    const date = new Date().toISOString().slice(0, 10);

    const plan = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        patientId: patient.id,
        serviceId: service.id,
        name: "Plano financeiro",
        kind: "fixed_package",
        totalSessions: 1,
        validFrom: date,
        totalValueInCents: 12_000,
        installments: 1,
        firstDueDate: date,
      },
    });
    expect(plan.statusCode).toBe(201);

    let workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const receivableId = workspace.json().summary.receivables[0].id;
    const adjusted = await app.inject({
      method: "PATCH",
      url: `/finance/receivables/${receivableId}/adjust`,
      headers,
      payload: {
        amountInCents: 11_500,
        reason: "Desconto comercial autorizado",
      },
    });
    expect(adjusted.json()).toMatchObject({
      amountInCents: 11_500,
      status: "open",
    });
    const received = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivableId}/pay`,
      headers,
      payload: { paymentMethod: "card" },
    });
    expect(received.json()).toMatchObject({
      status: "paid",
      paymentMethod: "card",
    });
    const receipt = await app.inject({
      method: "GET",
      url: `/finance/receivables/${receivableId}/receipt`,
      headers,
    });
    expect(receipt.statusCode).toBe(200);
    expect(receipt.json()).toMatchObject({
      patientName: patient.fullName,
      amountInCents: 11_500,
      paymentMethod: "card",
    });

    const category = workspace
      .json()
      .categories.find((item: { kind: string }) => item.kind === "expense");
    const costCenter = workspace.json().costCenters[0];
    const payable = await app.inject({
      method: "POST",
      url: "/finance/payables",
      headers,
      payload: {
        description: "Aluguel da unidade",
        supplier: "Imobiliária Centro",
        categoryId: category.id,
        costCenterId: costCenter.id,
        dueDate: date,
        amountInCents: 4_000,
      },
    });
    expect(payable.statusCode).toBe(201);
    const expense = await app.inject({
      method: "POST",
      url: `/finance/payables/${payable.json().id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    expect(expense.json()).toMatchObject({
      status: "paid",
      paymentMethod: "pix",
    });

    workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(workspace.json()).toMatchObject({
      paidExpensesThisMonthInCents: 4_000,
      cashBalanceThisMonthInCents: 7_500,
    });

    const reversed = await app.inject({
      method: "POST",
      url: `/finance/payables/${payable.json().id}/reverse`,
      headers,
    });
    expect(reversed.json()).toMatchObject({ status: "open" });
    await app.close();
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
      payload: {
        patientId: patient.id,
        professionalId: professionals.json()[0].id,
        roomId: rooms.json()[0].id,
        serviceId: services.json()[0].id,
        startsAt: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString(),
      },
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

  it("renegotiates debt and generates commissions idempotently", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
    ]);
    const startsAt = new Date(
      Date.now() + 55 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const date = startsAt.slice(0, 10);
    await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        patientId: patients.json()[0].id,
        serviceId: services.json()[0].id,
        name: "Plano renegociado",
        kind: "fixed_package",
        totalSessions: 2,
        validFrom: date,
        totalValueInCents: 10000,
        installments: 2,
        firstDueDate: date,
      },
    });
    let workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const ids = workspace
      .json()
      .summary.receivables.map((item: { id: string }) => item.id);
    const renegotiated = await app.inject({
      method: "POST",
      url: "/finance/renegotiations",
      headers,
      payload: {
        receivableIds: ids,
        totalAmountInCents: 9001,
        installments: 3,
        firstDueDate: date,
        reason: "Acordo comercial de teste",
      },
    });
    expect(renegotiated.statusCode).toBe(201);
    expect(renegotiated.json().newReceivables).toHaveLength(3);
    expect(
      renegotiated
        .json()
        .newReceivables.reduce(
          (sum: number, item: { amountInCents: number }) =>
            sum + item.amountInCents,
          0,
        ),
    ).toBe(9001);

    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        patientId: patients.json()[0].id,
        professionalId: professionals.json()[0].id,
        roomId: rooms.json()[0].id,
        serviceId: services.json()[0].id,
        startsAt,
      },
    });
    await app.inject({
      method: "PATCH",
      url: `/appointments/${appointment.json().id}/status`,
      headers,
      payload: { status: "completed" },
    });
    await app.inject({
      method: "POST",
      url: "/finance/commission-rules",
      headers,
      payload: {
        professionalId: professionals.json()[0].id,
        percentage: 30,
        effectiveFrom: date,
      },
    });
    const first = await app.inject({
      method: "POST",
      url: "/finance/commissions/generate",
      headers,
      payload: { competence: startsAt.slice(0, 7) },
    });
    const second = await app.inject({
      method: "POST",
      url: "/finance/commissions/generate",
      headers,
      payload: { competence: startsAt.slice(0, 7) },
    });
    expect(first.json()).toHaveLength(1);
    expect(second.json()).toHaveLength(1);
    const paid = await app.inject({
      method: "POST",
      url: `/finance/commissions/${first.json()[0].id}/pay`,
      headers,
    });
    expect(paid.json().status).toBe("paid");
    workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(workspace.json().commissions).toHaveLength(1);
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
      patients: patients.json(),
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
      payload: { capacity: 2, weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }, { weekday: 4, startTime: "18:00", endTime: "19:30" }] },
    });
    expect(updatedGroup.statusCode).toBe(200);
    expect(updatedGroup.json()).toMatchObject({ capacity: 2, activeEnrollments: 2, waitlistCount: 0 });
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
    const agenda = await app.inject({ method: "GET", url: `/group-sessions?${agendaRange}`, headers });
    expect(agenda.statusCode).toBe(200);
    const sessions = agenda
      .json()
      .filter((item: { groupId: string }) => item.groupId === group.json().id);
    // Terças 18:00–19:00 e quintas 18:00–19:30 reservadas automaticamente por 12 semanas.
    expect(sessions.length).toBeGreaterThanOrEqual(22);
    for (const session of sessions) {
      const local = localParts(new Date(session.startsAt), "America/Sao_Paulo");
      const minutes = (new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000;
      expect([local.weekday, local.time, minutes]).toEqual(local.weekday === 2 ? [2, "18:00", 60] : [4, "18:00", 90]);
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
    const targetGroup = await createGroup(4, [{ weekday: 3, startTime: "10:00", endTime: "11:00" }]);
    expect(targetGroup.json()).toMatchObject({
      sequence: group.json().sequence + 1,
      name: groupClassName(references.service.name, group.json().sequence + 1),
    });
    const targetSessions = await app.inject({ method: "GET", url: `/group-sessions?${agendaRange}`, headers });
    const targetSession = targetSessions
      .json()
      .find((item: { groupId: string }) => item.groupId === targetGroup.json().id);
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
    const room = rooms.json().find((item: { capacity: number }) => item.capacity >= 4);
    const timezone = "America/Sao_Paulo";
    // Primeira sexta-feira a partir de `weeksAhead` semanas, no horário local informado.
    const friday = (weeksAhead: number, time: string) => {
      let date = localParts(new Date(Date.now() + weeksAhead * 7 * 86_400_000), timezone).date;
      while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 5) {
        const next = new Date(`${date}T12:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        date = next.toISOString().slice(0, 10);
      }
      return zonedTimeToUtc(date, time, timezone).toISOString();
    };
    const book = (startsAt: string) =>
      app.inject({
        method: "POST",
        url: "/appointments",
        headers,
        payload: {
          patientId: patients.json()[0].id,
          professionalId: professional.id,
          roomId: room.id,
          serviceId: service.id,
          startsAt,
        },
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
    expect((await book(friday(2, "06:00"))).json().code).toBe("APPOINTMENT_CONFLICT");
    // Além das 12 semanas já reservadas, o horário fixo da turma continua ocupado.
    expect((await book(friday(30, "06:30"))).json().code).toBe("APPOINTMENT_CONFLICT");
    expect((await book(friday(30, "06:50"))).statusCode).toBe(201);
    await app.close();
  });

  it("controls stock and reverses inventory and finance when a tab is cancelled", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const product = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: {
        name: "Faixa elástica",
        sku: "FX-001",
        unit: "un",
        costInCents: 2000,
        salePriceInCents: 4500,
        initialStock: 5,
        minimumStock: 2,
      },
    });
    expect(product.statusCode).toBe(201);
    const excessiveLoss = await app.inject({
      method: "POST",
      url: "/inventory/movements",
      headers,
      payload: {
        productId: product.json().id,
        kind: "loss",
        quantity: 6,
        notes: "Avaria identificada",
      },
    });
    expect(excessiveLoss.statusCode).toBe(409);
    const tab = await app.inject({
      method: "POST",
      url: "/patient-tabs",
      headers,
      payload: { patientId: patients.json()[0].id, notes: "Venda interna" },
    });
    const withItem = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/items`,
      headers,
      payload: { productId: product.json().id, quantity: 2 },
    });
    expect(withItem.json().totalInCents).toBe(9000);
    let inventory = await app.inject({
      method: "GET",
      url: "/inventory/workspace",
      headers,
    });
    expect(inventory.json().products[0].currentStock).toBe(3);
    const closed = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/close`,
      headers,
      payload: {
        settlement: "paid",
        paymentMethod: "pix",
        dueDate: new Date().toISOString().slice(0, 10),
      },
    });
    expect(closed.json()).toMatchObject({
      status: "closed",
      paymentStatus: "paid",
    });
    let finance = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(finance.json().summary.receivables[0].status).toBe("paid");
    const month = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date()).slice(0, 7);
    const soldReport = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers,
    });
    expect(soldReport.json().current).toMatchObject({
      grossSalesInCents: 9000,
      netSalesInCents: 9000,
      receivedInCents: 9000,
    });
    const cancelled = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/cancel`,
      headers,
    });
    expect(cancelled.json().status).toBe("cancelled");
    inventory = await app.inject({
      method: "GET",
      url: "/inventory/workspace",
      headers,
    });
    expect(inventory.json().products[0].currentStock).toBe(5);
    expect(
      inventory.json().movements.map((item: { kind: string }) => item.kind),
    ).toEqual(
      expect.arrayContaining(["initial_stock", "sale", "sale_reversal"]),
    );
    finance = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(finance.json().summary.receivables[0].status).toBe("cancelled");
    const cancelledReport = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers,
    });
    expect(cancelledReport.json().current).toMatchObject({
      grossSalesInCents: 9000,
      cancelledSalesInCents: 9000,
      netSalesInCents: 0,
      receivedInCents: 9000,
    });
    const duplicateCancellation = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/cancel`,
      headers,
    });
    expect(duplicateCancellation.statusCode).toBe(409);
    await app.close();
  });

  it("reads relationship settings with defaults and lets only the owner update them", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const initial = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers,
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual(defaultRelationshipSettings);

    const updatedSettings = {
      ...defaultRelationshipSettings,
      birthdayDaysAhead: 3,
      planExpiringDays: 10,
      formerClientMinDays: 15,
      formerClientMaxDays: 45,
      messages: {
        ...defaultRelationshipSettings.messages,
        birthday: "Parabéns, {{nome}}!",
      },
    };
    const updated = await app.inject({
      method: "PUT",
      url: "/relationship/settings",
      headers,
      payload: updatedSettings,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual(updatedSettings);
    const reread = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers,
    });
    expect(reread.json()).toEqual(updatedSettings);

    const invalid = await app.inject({
      method: "PUT",
      url: "/relationship/settings",
      headers,
      payload: { ...updatedSettings, formerClientMinDays: 90, formerClientMaxDays: 30 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });

    const clinicId = "11111111-1111-4111-8111-111111111111";
    const sub = "22222222-2222-4222-8222-222222222222";
    const receptionHeaders = {
      authorization: `Bearer ${app.jwt.sign({ sub, clinicId, role: "reception" })}`,
    };
    const receptionRead = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers: receptionHeaders,
    });
    expect(receptionRead.statusCode).toBe(200);
    expect(receptionRead.json()).toEqual(updatedSettings);
    const receptionWrite = await app.inject({
      method: "PUT",
      url: "/relationship/settings",
      headers: receptionHeaders,
      payload: defaultRelationshipSettings,
    });
    expect(receptionWrite.statusCode).toBe(403);
    expect(receptionWrite.json()).toMatchObject({ code: "OWNER_ACCESS_REQUIRED" });

    const physiotherapistRead = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub, clinicId, role: "physiotherapist" })}`,
      },
    });
    expect(physiotherapistRead.statusCode).toBe(403);
    expect(physiotherapistRead.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
    await app.close();
  });

  it("lists contact suggestions and hides them after a contact or until the snooze date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00.000Z"));
    try {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      const clinicId = "11111111-1111-4111-8111-111111111111";
      const sub = "22222222-2222-4222-8222-222222222222";
      const roleHeaders = (role: UserRole) => ({
        authorization: `Bearer ${app.jwt.sign({ sub, clinicId, role })}`,
      });
      const patient = (
        await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload: {
            fullName: "Rita Relacionamento",
            phone: "11955554444",
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
        payload: {
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
        },
      });
      expect(plan.statusCode).toBe(201);

      type Suggestion = { patientId: string; reason: string; referenceKey: string };
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
      const birthday = ownerSuggestions.find((item) => item.reason === "birthday")!;
      expect(birthday.referenceKey).toBe(`${patient.id}:2026`);
      const overdue = ownerSuggestions.find(
        (item) => item.reason === "overdue_payment",
      )!;

      const receptionSuggestions = await suggestionsFor(roleHeaders("reception"));
      expect(receptionSuggestions.map((item) => item.reason)).toEqual(["birthday"]);
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
        const denied = await app.inject({ ...request, headers: physiotherapist });
        expect(denied.statusCode).toBe(403);
        expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
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
        actorUserId: sub,
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
});
