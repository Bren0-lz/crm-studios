import { afterEach, describe, expect, it } from "vitest";
import type { CommercialEvent, CommercialEventDetail } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { testPatientContact } from "../../test-support/patient-contact.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222",
  apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  return { app, repository, headers };
}

const eventPayload = {
  name: "Aulão na praça",
  location: "Praça Central",
  attendeeCount: 130,
  startsAt: "2026-11-08T12:00:00.000Z",
  notes: "Lista de presença no papel",
};

describe("eventos do comercial", () => {
  it("cadastra, lista, edita e valida o evento", async () => {
    const { app, headers } = await setup();
    for (const payload of [
      { ...eventPayload, name: "A" },
      { ...eventPayload, name: "x".repeat(73) },
      { ...eventPayload, startsAt: "amanhã" },
      { ...eventPayload, attendeeCount: -1 },
      { ...eventPayload, notes: "x".repeat(2001) },
    ]) {
      const invalid = await app.inject({
        method: "POST",
        url: "/events",
        headers,
        payload,
      });
      expect(invalid.statusCode, JSON.stringify(payload)).toBe(400);
    }
    const created = await app.inject({
      method: "POST",
      url: "/events",
      headers,
      payload: eventPayload,
    });
    expect(created.statusCode, created.body).toBe(201);
    const event = created.json() as CommercialEvent;
    expect(event).toMatchObject({
      ...eventPayload,
      clinicId,
      createdBy: actorId,
      participantCount: 0,
    });

    const list = await app.inject({ method: "GET", url: "/events", headers });
    expect(list.statusCode).toBe(200);
    expect((list.json() as CommercialEvent[]).map((item) => item.id)).toEqual([
      event.id,
    ]);

    const updated = await app.inject({
      method: "PUT",
      url: `/events/${event.id}`,
      headers,
      payload: { ...eventPayload, name: "Aulão na praça (2ª ed.)" },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({
      id: event.id,
      name: "Aulão na praça (2ª ed.)",
    });

    // Outra clínica: isolamento coberto no teste do repositório (memória e MySQL).
    for (const request of [
      {
        method: "PUT" as const,
        url: "/events/99999999-9999-4999-8999-000000000000",
        headers,
        payload: eventPayload,
      },
      {
        method: "GET" as const,
        url: "/events/99999999-9999-4999-8999-000000000000",
        headers,
      },
    ]) {
      const missing = await app.inject(request);
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ code: "EVENT_NOT_FOUND" });
    }
    expect(
      (await app.inject({ method: "GET", url: "/events/abc", headers }))
        .statusCode,
    ).toBe(400);
  });

  it("mostra os participantes (leads do evento) e os quatro indicadores", async () => {
    const { app, repository, headers } = await setup();
    const event = (
      await app.inject({
        method: "POST",
        url: "/events",
        headers,
        payload: eventPayload,
      })
    ).json() as CommercialEvent;
    const addParticipant = async (fullName: string, interest = "Evento") => {
      const response = await app.inject({
        method: "POST",
        url: "/leads",
        headers,
        payload: {
          fullName,
          phone: `1198${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
          source: "Outra origem",
          interest,
          eventId: event.id,
        },
      });
      expect(response.statusCode, response.body).toBe(201);
      return response.json() as { id: string; source: string };
    };
    const ana = await addParticipant("Ana Participante");
    expect(ana.source).toBe("Evento: Aulão na praça");
    const bia = await addParticipant("Bia Participante", "Pilates");
    const caio = await addParticipant("Caio Participante", "Dança");
    const unknown = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Sem evento",
        phone: "11988887777",
        source: "Instagram",
        interest: "Pilates",
        eventId: "99999999-9999-4999-8999-000000000000",
      },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ code: "EVENT_NOT_FOUND" });

    const contact = await app.inject({
      method: "POST",
      url: `/leads/${ana.id}/contacts`,
      headers,
      payload: {
        channel: "whatsapp",
        direction: "outbound",
        notes: "Mandei a grade",
      },
    });
    expect(contact.statusCode).toBe(201);
    const [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    const evaluation = await app.inject({
      method: "POST",
      url: `/leads/${bia.id}/appointments`,
      headers,
      payload: {
        professionalId: professional!.id,
        roomId: room!.id,
        serviceId: service!.id,
        startsAt: "2031-05-12T13:00:00.000Z",
        visitType: "evaluation",
      },
    });
    expect(evaluation.statusCode, evaluation.body).toBe(201);
    const converted = await app.inject({
      method: "POST",
      url: `/leads/${caio.id}/convert`,
      headers,
      payload: { cpf: nextTestCpf(), ...testPatientContact },
    });
    expect(converted.statusCode, converted.body).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/events/${event.id}`,
      headers,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as CommercialEventDetail;
    expect(body.participants.map((item) => item.fullName)).toEqual([
      "Ana Participante",
      "Bia Participante",
      "Caio Participante",
    ]);
    expect(body.participants[1]).toMatchObject({
      eventId: event.id,
      evaluationAt: "2031-05-12T13:00:00.000Z",
    });
    expect(body.indicators).toEqual({
      contacted: 1,
      interested: 2,
      evaluations: 1,
      converted: 1,
    });
    expect(body.participantCount).toBe(3);
  });

  it("exige events.view para consultar e events.manage para cadastrar", async () => {
    const { app, repository } = await setup();
    const asUser = async (permissions: string[]) => {
      const user = await repository.createAdminUser(
        clinicId,
        actorId,
        {
          fullName: `Equipe ${permissions.length}`,
          email: `eventos${permissions.length}@example.com`,
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
    const crmOnly = await asUser(["crm.view"]);
    const denied = await app.inject({
      method: "GET",
      url: "/events",
      headers: crmOnly,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
    const viewer = await asUser(["crm.view", "events.view"]);
    expect(
      (await app.inject({ method: "GET", url: "/events", headers: viewer }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/events",
          headers: viewer,
          payload: eventPayload,
        })
      ).statusCode,
    ).toBe(403);
    const manager = await asUser(["crm.view", "events.view", "events.manage"]);
    const created = await app.inject({
      method: "POST",
      url: "/events",
      headers: manager,
      payload: eventPayload,
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/events/${created.json().id}`,
          headers: viewer,
          payload: eventPayload,
        })
      ).statusCode,
    ).toBe(403);
  });
});
