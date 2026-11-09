import { afterEach, describe, expect, it } from "vitest";
import {
  EVENT_LEAD_DEFAULT_INTEREST,
  eventLeadSource,
  type CommercialEvent,
  type CommercialEventDetail,
  type Lead,
} from "@crm/contracts";
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
        visitType: "trial",
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

  it("registra contato feito ou tentativa do participante e atualiza os indicadores", async () => {
    const { app, headers } = await setup();
    const event = (
      await app.inject({
        method: "POST",
        url: "/events",
        headers,
        payload: eventPayload,
      })
    ).json() as CommercialEvent;
    const lead = (
      await app.inject({
        method: "POST",
        url: "/leads",
        headers,
        payload: {
          fullName: "Duda Participante",
          phone: "11987650000",
          email: "duda@example.com",
          whatsapp: "11987650001",
          source: eventLeadSource(event.name),
          interest: EVENT_LEAD_DEFAULT_INTEREST,
          eventId: event.id,
        },
      })
    ).json() as { id: string };
    const indicators = async () =>
      (
        (
          await app.inject({
            method: "GET",
            url: `/events/${event.id}`,
            headers,
          })
        ).json() as CommercialEventDetail
      ).indicators.contacted;
    const tooLong = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/contacts`,
      headers,
      payload: {
        channel: "phone",
        direction: "outbound",
        notes: "x".repeat(2001),
        reached: true,
      },
    });
    expect(tooLong.statusCode).toBe(400);
    const attempt = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/contacts`,
      headers,
      payload: {
        channel: "phone",
        direction: "outbound",
        notes: "Não atendeu, ligar amanhã",
        occurredAt: "2026-11-09T13:00:00.000Z",
        reached: false,
      },
    });
    expect(attempt.statusCode, attempt.body).toBe(201);
    expect(attempt.json()).toMatchObject({ reached: false });
    expect(await indicators()).toBe(0);
    const done = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/contacts`,
      headers,
      payload: {
        channel: "phone",
        direction: "outbound",
        notes: "x".repeat(2000),
        occurredAt: "2026-11-10T13:00:00.000Z",
        reached: true,
      },
    });
    expect(done.statusCode, done.body).toBe(201);
    const detail = (
      await app.inject({ method: "GET", url: `/events/${event.id}`, headers })
    ).json() as CommercialEventDetail;
    expect(detail.indicators.contacted).toBe(1);
    expect(detail.participants[0]).toMatchObject({
      phone: "11987650000",
      email: "duda@example.com",
      whatsapp: "11987650001",
      interest: EVENT_LEAD_DEFAULT_INTEREST,
      contactedAt: "2026-11-10T13:00:00.000Z",
      lastContactAt: "2026-11-10T13:00:00.000Z",
    });
  });

  it("grava o serviço do evento e filtra a lista por serviço", async () => {
    const { app, repository, headers } = await setup();
    const [pilates, other] = await repository.listServices(clinicId);
    const create = (payload: Record<string, unknown>) =>
      app.inject({ method: "POST", url: "/events", headers, payload });
    const withService = await create({
      ...eventPayload,
      name: "Aulão de Pilates",
      serviceId: pilates!.id,
    });
    expect(withService.statusCode, withService.body).toBe(201);
    expect(withService.json()).toMatchObject({
      serviceId: pilates!.id,
      serviceName: pilates!.name,
    });
    const withoutService = (
      await create({ ...eventPayload, name: "Feira", serviceId: "" })
    ).json() as CommercialEvent;
    expect(withoutService.serviceId).toBeUndefined();
    const missing = await create({
      ...eventPayload,
      serviceId: "99999999-9999-4999-8999-000000000000",
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "SERVICE_NOT_FOUND" });

    const list = async (query = "") => {
      const response = await app.inject({
        method: "GET",
        url: `/events${query}`,
        headers,
      });
      expect(response.statusCode, response.body).toBe(200);
      return (response.json() as CommercialEvent[]).map((item) => item.name);
    };
    expect((await list()).sort()).toEqual(["Aulão de Pilates", "Feira"]);
    expect(await list(`?serviceId=${pilates!.id}`)).toEqual([
      "Aulão de Pilates",
    ]);
    expect(await list(`?serviceId=${other!.id}`)).toEqual([]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/events?serviceId=pilates",
          headers,
        })
      ).statusCode,
    ).toBe(400);

    // Editar troca ou tira o serviço.
    const id = (withService.json() as CommercialEvent).id;
    const cleared = await app.inject({
      method: "PUT",
      url: `/events/${id}`,
      headers,
      payload: { ...eventPayload, name: "Aulão de Pilates", serviceId: "" },
    });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(cleared.json().serviceId).toBeUndefined();
    expect(await list(`?serviceId=${pilates!.id}`)).toEqual([]);
  });

  it("exclui o evento e mantém os participantes como leads", async () => {
    const { app, headers } = await setup();
    const event = (
      await app.inject({
        method: "POST",
        url: "/events",
        headers,
        payload: eventPayload,
      })
    ).json() as CommercialEvent;
    const lead = (
      await app.inject({
        method: "POST",
        url: "/leads",
        headers,
        payload: {
          fullName: "Ana Participante",
          phone: "11987650099",
          source: "Evento",
          interest: "Pilates",
          eventId: event.id,
        },
      })
    ).json() as Lead;
    const removed = await app.inject({
      method: "DELETE",
      url: `/events/${event.id}`,
      headers,
    });
    expect(removed.statusCode, removed.body).toBe(204);
    expect(
      (await app.inject({ method: "GET", url: `/events/${event.id}`, headers }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: "/events", headers })).json(),
    ).toEqual([]);
    const leads = (
      await app.inject({ method: "GET", url: "/leads", headers })
    ).json() as Lead[];
    const kept = leads.find((item) => item.id === lead.id);
    expect(kept).toMatchObject({
      fullName: "Ana Participante",
      source: "Evento: Aulão na praça",
    });
    expect(kept?.eventId).toBeUndefined();
    const again = await app.inject({
      method: "DELETE",
      url: `/events/${event.id}`,
      headers,
    });
    expect(again.statusCode).toBe(404);
    expect(again.json()).toMatchObject({ code: "EVENT_NOT_FOUND" });
  });

  it("remove o participante do evento sem apagar o lead", async () => {
    const { app, headers } = await setup();
    const create = async (name: string) =>
      (
        await app.inject({
          method: "POST",
          url: "/events",
          headers,
          payload: { ...eventPayload, name },
        })
      ).json() as CommercialEvent;
    const event = await create("Aulão na praça"),
      other = await create("Feira");
    const add = async (fullName: string, eventId: string) =>
      (
        await app.inject({
          method: "POST",
          url: "/leads",
          headers,
          payload: {
            fullName,
            phone: `1198${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
            source: "Evento",
            interest: "Pilates",
            eventId,
          },
        })
      ).json() as Lead;
    const ana = await add("Ana Participante", event.id),
      bia = await add("Bia Participante", event.id),
      caio = await add("Caio Participante", other.id);
    const remove = (eventId: string, leadId: string) =>
      app.inject({
        method: "DELETE",
        url: `/events/${eventId}/participants/${leadId}`,
        headers,
      });
    expect((await remove(event.id, ana.id)).statusCode).toBe(204);
    const detail = (
      await app.inject({ method: "GET", url: `/events/${event.id}`, headers })
    ).json() as CommercialEventDetail;
    expect(detail.participants.map((item) => item.id)).toEqual([bia.id]);
    expect(detail.participantCount).toBe(1);
    expect(detail.indicators.interested).toBe(1);
    const leads = (
      await app.inject({ method: "GET", url: "/leads", headers })
    ).json() as Lead[];
    expect(leads.find((item) => item.id === ana.id)?.eventId).toBeUndefined();
    // Participante de outro evento, já removido ou evento inexistente: 404.
    const wrongEvent = await remove(event.id, caio.id);
    expect(wrongEvent.statusCode).toBe(404);
    expect(wrongEvent.json()).toMatchObject({
      code: "EVENT_PARTICIPANT_NOT_FOUND",
    });
    expect((await remove(event.id, ana.id)).statusCode).toBe(404);
    const missing = await remove(
      "99999999-9999-4999-8999-000000000000",
      bia.id,
    );
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "EVENT_NOT_FOUND" });
  });

  it("exige events.view para consultar e events.manage para cadastrar", async () => {
    const { app, repository } = await setup();
    const asUser = async (permissions: string[]) => {
      const user = await repository.createAdminUser(
        clinicId,
        actorId,
        {
          fullName: `Equipe ${permissions.length}`,
          email: `eventos${permissions.length}-${permissions.join("-").replace(/\W/g, "")}@example.com`,
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
    // Excluir evento e remover participante pedem a mesma permissão de editar.
    for (const url of [
      `/events/${created.json().id}`,
      `/events/${created.json().id}/participants/99999999-9999-4999-8999-000000000000`,
    ])
      expect(
        (await app.inject({ method: "DELETE", url, headers: viewer }))
          .statusCode,
      ).toBe(403);
    // Quem vê eventos lista os serviços (filtro e cadastro do evento).
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/services",
          headers: await asUser(["events.view"]),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/events/${created.json().id}`,
          headers: manager,
        })
      ).statusCode,
    ).toBe(204);
  });
});
